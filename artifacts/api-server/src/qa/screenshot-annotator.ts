import path from 'path';
import { chromium } from 'playwright';
import type { UIIssue, FormIssue, PageScanned } from './types.js';
import { playwrightEnv } from './playwright-env.js';

const SEVERITY_COLOR: Record<string, string> = {
  High: '#ef4444',
  Medium: '#f97316',
  Low: '#eab308',
};

interface IssueAnnotation {
  selector: string;
  label: string;
  color: string;
}

/**
 * Re-opens each affected page URL in Playwright, injects visible red/orange/yellow
 * bounding-box overlays at exact document coordinates, then takes a full-page
 * screenshot that replaces the original PNG.  Because we work on the live DOM
 * (not a static image), element positions are always accurate regardless of
 * page height or layout complexity.
 */
export async function annotatePageScreenshots(
  pages: PageScanned[],
  uiIssues: UIIssue[],
  formIssues: FormIssue[],
  screenshotsDir: string,
): Promise<void> {
  // ── Collect annotations grouped by page URL ──────────────────────────────
  const annotationsByUrl = new Map<string, IssueAnnotation[]>();

  for (const issue of uiIssues) {
    if (!issue.selector) continue;
    const color = SEVERITY_COLOR[issue.severity] ?? '#ef4444';
    const list = annotationsByUrl.get(issue.page) ?? [];
    list.push({
      selector: issue.selector,
      label: `[${issue.severity}] ${issue.issueType}`,
      color,
    });
    annotationsByUrl.set(issue.page, list);
  }

  for (const issue of formIssues) {
    if (!issue.formSelector) continue;
    const color = SEVERITY_COLOR[issue.severity] ?? '#ef4444';
    const list = annotationsByUrl.get(issue.page) ?? [];
    list.push({
      selector: issue.formSelector,
      label: `[${issue.severity}] Form: ${issue.issueType}`,
      color,
    });
    annotationsByUrl.set(issue.page, list);
  }

  if (annotationsByUrl.size === 0) return;

  // ── Launch browser once and process every affected page ──────────────────
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, env: playwrightEnv() });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    
    // Inject __name shim to prevent esbuild-injected helper errors in browser context
    await context.addInitScript(() => {
      // @ts-ignore
      window.__name = (f, n) => f;
    });

    const annotationPromises = Array.from(annotationsByUrl.entries()).map(async ([pageUrl, annotations]) => {
      const pageInfo = pages.find((p) => p.url === pageUrl);
      if (!pageInfo?.screenshotFile) return;

      const screenshotPath = path.join(screenshotsDir, pageInfo.screenshotFile);

      const page = await context.newPage();
      try {
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
        // Give the page a moment to render completely
        await page.waitForTimeout(2000);

        // Inject annotation overlay container + one box+label per issue
        await page.evaluate((items: IssueAnnotation[]) => {
          // Single fixed overlay container anchored to document top-left
          const container = document.createElement('div');
          container.id = '__qa_overlay';
          container.style.cssText = [
            'position:absolute',
            'top:0',
            'left:0',
            'width:0',
            'height:0',
            'overflow:visible',
            'pointer-events:none',
            'z-index:2147483647',
          ].join(';');
          document.body.appendChild(container);

          const scrollX = window.pageXOffset || 0;
          const scrollY = window.pageYOffset || 0;

          let idx = 0;
          for (const item of items) {
            let el: Element | null = null;
            try {
              el = document.querySelector(item.selector);
            } catch {
              continue;
            }
            if (!el) continue;

            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;

            // Document-absolute coordinates
            const x = r.left + scrollX;
            const y = r.top + scrollY;
            const w = r.width;
            const h = r.height;

            // ── Bounding box (Translucent red fill with thick borders) ───
            const box = document.createElement('div');
            box.style.cssText = [
              'position:absolute',
              `left:${x}px`,
              `top:${y}px`,
              `width:${w}px`,
              `height:${h}px`,
              `border:3px solid ${item.color}`,
              `background-color:${item.color}33`, 
              'box-sizing:border-box',
              'box-shadow: 0 0 0 1px white, 0 0 8px rgba(0,0,0,0.5)',
            ].join(';');
            container.appendChild(box);

            // ── Label badge (High contrast text) ────────────────────────
            const badgeHeight = 22;
            const labelY = y > badgeHeight ? y - badgeHeight : y + h + 2;
            const badge = document.createElement('div');
            badge.textContent = `${idx + 1}. ${item.label}`;
            badge.style.cssText = [
              'position:absolute',
              `left:${Math.max(0, x)}px`,
              `top:${labelY}px`,
              `background:${item.color}`,
              'color:#fff',
              'font-weight: 700',
              'font-family: system-ui, sans-serif',
              'font-size: 13px',
              'padding: 2px 6px',
              'border-radius: 3px',
              'border: 1px solid #fff',
              'box-shadow: 0 2px 5px rgba(0,0,0,0.4)',
              'white-space:nowrap',
              'max-width:480px',
              'overflow:hidden',
              'text-overflow:ellipsis',
            ].join(';');
            container.appendChild(badge);

            idx++;
          }
        }, annotations);

        // Take full-page screenshot — replaces the original crawler screenshot
        await page.screenshot({ path: screenshotPath, fullPage: true });
      } catch {
        // Non-fatal: if page can't load, keep original screenshot
      } finally {
        await page.close();
      }
    });

    await Promise.all(annotationPromises);
    await context.close();
  } finally {
    if (browser) await browser.close();
  }
}
