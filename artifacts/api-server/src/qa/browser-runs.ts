import { chromium, firefox, webkit } from 'playwright';
import type { UIIssue, BrowserName } from './types.js';
import { playwrightEnv } from './playwright-env.js';
import { runPageUIChecks } from './ui-inspector.js';

const BROWSER_LAUNCHERS = {
  chromium,
  firefox,
  webkit,
} as const;

/**
 * Run UI inspection in a single browser and tag every issue with that browser name.
 */
async function inspectInBrowser(
  pages: Array<{ url: string }>,
  browserName: BrowserName
): Promise<UIIssue[]> {
  const launcher = BROWSER_LAUNCHERS[browserName];
  const issues: UIIssue[] = [];
  let browser = null;

  try {
    browser = await launcher.launch({
      headless: true,
      // Only inject the Mesa GPU path for Chromium; other browsers manage their own libs
      env: browserName === 'chromium' ? playwrightEnv() : (process.env as Record<string, string>),
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    // Inject __name shim to prevent esbuild-injected helper errors in browser context
    await context.addInitScript(() => {
      // @ts-ignore
      window.__name = (f, n) => f;
    });

    for (const { url } of pages) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
        
        // Capture console errors
        const consoleErrors: UIIssue[] = [];
        page.on('console', msg => {
          if (msg.type() === 'error') {
            consoleErrors.push({
              page: url,
              severity: 'High',
              issueType: 'Console Error',
              description: `JS Error (${browserName}): ${msg.text()}`,
              impact: 'Javascript errors can break critical site functionality and user interactions.',
              recommendation: 'Check the browser console and source code to resolve this exception.',
              browsers: [browserName]
            });
          }
        });

        const pageIssues = await runPageUIChecks(page, url);
        for (const issue of pageIssues) {
          issues.push({ ...issue, browsers: [browserName] });
        }
        issues.push(...consoleErrors);
      } catch {
        // Skip failed pages
      } finally {
        await page.close();
      }
    }

    await context.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[browser-runs] ${browserName} skipped: ${msg}`);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }

  return issues;
}

/**
 * Run UI inspection across multiple browsers, then merge results.
 * Issues that appear in multiple browsers are collapsed (deduped by issueType+page),
 * with all affected browser names combined in the `browsers` array.
 */
export async function runMultiBrowserInspection(
  pages: Array<{ url: string }>,
  browsers: BrowserName[]
): Promise<UIIssue[]> {
  if (browsers.length === 0) return [];

  const results = await Promise.all(
    browsers.map((browserName) => inspectInBrowser(pages, browserName))
  );
  const allIssues = results.flat();

  // Merge: if same issueType appears on same page across browsers, unify browsers[]
  const map = new Map<string, UIIssue>();
  for (const issue of allIssues) {
    const key = `${issue.issueType}::${issue.page}`;
    const existing = map.get(key);
    if (existing) {
      const merged = new Set([...(existing.browsers ?? []), ...(issue.browsers ?? [])]);
      existing.browsers = Array.from(merged) as BrowserName[];
      existing.occurrences = (existing.occurrences ?? 1) + 1;
    } else {
      map.set(key, { ...issue });
    }
  }

  return Array.from(map.values());
}
