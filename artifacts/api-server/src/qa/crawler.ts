import { chromium, type Browser, type Page } from 'playwright';
import path from 'path';
import fs from 'fs/promises';
import type { PageScanned } from './types.js';
import { playwrightEnv } from './playwright-env.js';

export interface CrawlResult {
  pages: PageScanned[];
  allLinks: Array<{ sourcePage: string; linkUrl: string }>;
}

function sanitizeFilename(url: string): string {
  return url.replace(/[^a-z0-9]/gi, '_').substring(0, 80);
}

function isSameDomain(base: string, link: string): boolean {
  try {
    const baseUrl = new URL(base);
    const linkUrl = new URL(link);
    return baseUrl.hostname === linkUrl.hostname;
  } catch {
    return false;
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

export async function crawlSite(
  targetUrl: string,
  maxPages: number,
  jobId: string,
  screenshotsDir: string,
  onProgress: (currentUrl: string) => void
): Promise<CrawlResult> {
  let browser: Browser | null = null;
  const pages: PageScanned[] = [];
  const allLinks: Array<{ sourcePage: string; linkUrl: string }> = [];
  const visited = new Set<string>();
  const toVisit: string[] = [normalizeUrl(targetUrl)];

  await fs.mkdir(screenshotsDir, { recursive: true });

  try {
    browser = await chromium.launch({
      headless: true,
      env: playwrightEnv(),
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (compatible; AutonomousQAInspector/1.0)',
      viewport: { width: 1280, height: 800 },
    });

    // Inject __name shim to prevent esbuild-injected helper errors in browser context
    await context.addInitScript(() => {
      // @ts-ignore
      window.__name = (f, n) => f;
    });

    let pageIndex = 0;

    while (toVisit.length > 0 && pages.length < maxPages) {
      const batchSize = Math.min(10, maxPages - pages.length, toVisit.length);
      const batchUrls = toVisit.splice(0, batchSize);
      
      const batchPromises = batchUrls.map(async (currentUrl, i) => {
        if (visited.has(currentUrl)) return null;
        visited.add(currentUrl);

        onProgress(currentUrl);
        const page: Page = await context.newPage();
        const startTime = Date.now();
        const currentIndex = pageIndex + i; // Pre-allocate index for this batch item

        try {
          const response = await page.goto(currentUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 20000,
          });
          
          try {
            await page.waitForLoadState('networkidle', { timeout: 10000 });
          } catch {
            // ignore networkidle timeout, proceed
          }

          const loadTimeMs = Date.now() - startTime;
          const statusCode = response?.status() ?? 0;
          const title = await page.title().catch(() => '');

          const screenshotFile = `${jobId}_${currentIndex}_${sanitizeFilename(currentUrl)}.png`;
          const screenshotPath = path.join(screenshotsDir, screenshotFile);

          try {
            await page.screenshot({ path: screenshotPath, fullPage: true });
          } catch {
            // screenshot failed, continue
          }

          const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href]'))
              .map((a) => (a as HTMLAnchorElement).href)
              .filter((href) => href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:'));
          });

          const forms = await page.evaluate(() => {
            return document.querySelectorAll('form').length;
          });

          return {
            success: true,
            currentUrl,
            title,
            statusCode,
            screenshotFile,
            loadTimeMs,
            links,
            formsFound: forms
          };

        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            currentUrl,
            title: `Error: ${msg.substring(0, 100)}`,
            statusCode: 0,
            loadTimeMs: Date.now() - startTime,
            links: [],
            formsFound: 0
          };
        } finally {
          await page.close();
        }
      });

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (!result) continue; // skipped visitation

        const absoluteLinks: string[] = [];
        for (const link of result.links) {
          try {
            const abs = new URL(link, result.currentUrl).toString();
            absoluteLinks.push(abs);
            allLinks.push({ sourcePage: result.currentUrl, linkUrl: abs });

            const normalized = normalizeUrl(abs);
            if (isSameDomain(targetUrl, abs) && !visited.has(normalized) && !toVisit.includes(normalized)) {
              toVisit.push(normalized);
            }
          } catch {
            // invalid URL
          }
        }

        pages.push({
          url: result.currentUrl,
          title: result.title,
          statusCode: result.statusCode,
          screenshotFile: result.success ? result.screenshotFile : undefined,
          loadTimeMs: result.loadTimeMs,
          linksFound: absoluteLinks.length,
          formsFound: result.formsFound,
        });
      }

      pageIndex += batchSize;
    }

    await context.close();
  } finally {
    if (browser) await browser.close();
  }

  return { pages, allLinks };
}
