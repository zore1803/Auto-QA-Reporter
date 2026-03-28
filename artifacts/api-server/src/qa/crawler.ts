import { chromium, devices, type Browser, type Page } from 'playwright';
import path from 'path';
import fs from 'fs/promises';
import type { PageScanned } from './types.js';
import { playwrightEnv } from './playwright-env.js';

export interface CrawlResult {
  pages: PageScanned[];
  allLinks: Array<{ sourcePage: string; linkUrl: string }>;
  brokenResources: Array<{ url: string; status: number; type: string; source: string }>;
}

function sanitizeFilename(url: string): string {
  return url.replace(/[^a-z0-9]/gi, '_').substring(0, 80);
}

function isSameDomain(base: string, link: string): boolean {
  try {
    const baseUrl = new URL(base);
    const linkUrl = new URL(link);
    
    // Normalize hostnames (remove www.)
    const baseHost = baseUrl.hostname.replace(/^www\./, '');
    const linkHost = linkUrl.hostname.replace(/^www\./, '');
    
    // Allow if they are the same base domain or one is a subdomain of the other
    return linkHost === baseHost || linkHost.endsWith('.' + baseHost);
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
  device: string | undefined,
  onProgress: (currentUrl: string, progress: number) => void
): Promise<CrawlResult> {
  let browser: Browser | null = null;
  const pages: PageScanned[] = [];
  const allLinks: Array<{ sourcePage: string; linkUrl: string }> = [];
  const visited = new Set<string>();
  const toVisit: string[] = [normalizeUrl(targetUrl)];
  const brokenResources: Array<{ url: string; status: number; type: string; source: string }> = [];

  await fs.mkdir(screenshotsDir, { recursive: true });

  try {
    browser = await chromium.launch({
      headless: true,
      env: playwrightEnv(),
    });
    const deviceConfig = device && devices[device] 
      ? { ...devices[device], deviceScaleFactor: 1 } 
      : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

    const context = await browser.newContext(deviceConfig);

    // Inject __name shim to prevent esbuild-injected helper errors in browser context
    await context.addInitScript(() => {
      // @ts-ignore
      window.__name = (f, n) => f;
    });


    let pageIndex = 0;

    while (toVisit.length > 0 && pages.length < maxPages) {
      // Filter out already visited URLs before picking batch
      const unvisitedToVisit = toVisit.filter(u => !visited.has(u));
      toVisit.length = 0;
      toVisit.push(...unvisitedToVisit);

      if (toVisit.length === 0) break;

      const batchSize = Math.min(5, maxPages - pages.length, toVisit.length);
      const batchUrls = toVisit.splice(0, batchSize);
      
      const batchPromises = batchUrls.map(async (currentUrl, i) => {
        if (visited.has(currentUrl)) return null;
        visited.add(currentUrl);

        const currentProgress = 5 + Math.floor((pages.length / maxPages) * 20);
        onProgress(currentUrl, currentProgress);
        const page: Page = await context.newPage();
        const startTime = Date.now();
        const currentIndex = pageIndex + i; // Pre-allocate index for this batch item

        try {
          // Track resource failures for this specific page
          page.on('response', (res) => {
            const status = res.status();
            if (status >= 400 && res.request().resourceType() !== 'document') {
              brokenResources.push({
                url: res.url(),
                status,
                type: res.request().resourceType(),
                source: currentUrl
              });
            }
          });

          const response = await page.goto(currentUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 7000,
          });
          
          // no networkidle wait here, discovery phase only

          const loadTimeMs = Date.now() - startTime;
          const statusCode = response?.status() ?? 0;
          const title = await page.title().catch(() => '');

          const screenshotFile = `${jobId}_${currentIndex}_${sanitizeFilename(currentUrl)}.png`;
          const screenshotPath = path.join(screenshotsDir, screenshotFile);

          if (currentIndex < 3) {
            try {
              await page.screenshot({ path: screenshotPath, fullPage: false });
            } catch {
              // screenshot failed, continue
            }
          } else {
            // Skip secondary screenshots to maximize speed
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

      // SPA Fallback: If the initial target URL returned a 404, try adding the root URL to the queue
      if (pages.length === 0 && batchResults.length > 0) {
        const first = batchResults[0];
        if (first && first.statusCode === 404 && first.currentUrl === normalizeUrl(targetUrl)) {
          const rootUrl = new URL('/', targetUrl).toString();
          const normalizedRoot = normalizeUrl(rootUrl);
          if (!visited.has(normalizedRoot) && !toVisit.includes(normalizedRoot)) {
            toVisit.push(normalizedRoot);
          }
        }
      }

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

  return { pages, allLinks, brokenResources };
}
