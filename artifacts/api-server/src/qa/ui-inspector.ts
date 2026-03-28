import { chromium, devices, type Page } from 'playwright';
import type { UIIssue, Severity, BoundingBox } from './types.js';
import { playwrightEnv } from './playwright-env.js';


type RawIssue = {
  severity: string;
  issueType: string;
  description: string;
  impact: string;
  recommendation: string;
  selector?: string;
};

/**
 * Run all UI/accessibility checks on an already-open Playwright page.
 * This is the core check logic, browser-agnostic.
 */
export async function runPageUIChecks(page: Page, url: string): Promise<UIIssue[]> {
  const rawIssues: RawIssue[] = await page.evaluate((pageUrl: string) => {
    const found: RawIssue[] = [];

    // Robust absolute CSS path generator
    const getCssPath = (el: Element | null): string => {
      if (!el || !(el instanceof Element)) return '';
      const path: string[] = [];
      let current: Element | null = el;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.nodeName.toLowerCase();
        if (current.id) {
          selector += '#' + current.id.replace(/(:|\.|\[|\]|,|=|@)/g, '\\$1');
          path.unshift(selector);
          break;
        } else {
          let sib = current.previousElementSibling;
          let nth = 1;
          while (sib) {
            if (sib.nodeName.toLowerCase() === selector) nth++;
            sib = sib.previousElementSibling;
          }
          if (nth !== 1) selector += `:nth-of-type(${nth})`;
          else {
            // Even if it's the 1st of type, if there are multiple children of the same type later, we should still explicitly use nth-of-type(1) for safety, but leaving it as tag name usually works if it's the uniquely only one of that type ahead of it. Actually, `nth-of-type(1)` is safer.
            let nextSib = current.nextElementSibling;
            let hasMore = false;
            while (nextSib) {
              if (nextSib.nodeName.toLowerCase() === selector) { hasMore = true; break; }
              nextSib = nextSib.nextElementSibling;
            }
            if (hasMore) selector += `:nth-of-type(1)`;
          }
        }
        path.unshift(selector);
        current = current.parentElement;
      }
      return path.join(' > ');
    };

    // ── Missing Alt Text ──────────────────────────────────────────────
    document.querySelectorAll('img').forEach((img, i) => {
      if (!img.alt || img.alt.trim() === '') {
        const src = img.src ? img.src.substring(0, 80) : '(unknown src)';
        found.push({
          severity: 'Medium',
          issueType: 'Missing Alt Text',
          description: `Image ${i + 1} (src: "${src}") has no alt attribute or an empty one.`,
          impact:
            'Screen readers announce this image as "image" with no context, making it meaningless to visually-impaired users. Search engines also use alt text to index images, so missing alt text reduces SEO value.',
          recommendation:
            'Add a descriptive alt attribute that conveys the purpose or content of the image. For purely decorative images use alt="" (empty string) to tell screen readers to skip it.',
          selector: getCssPath(img),
        });
      }
    });

    // ── Empty Buttons ─────────────────────────────────────────────────
    document.querySelectorAll('button').forEach((btn, i) => {
      const text = btn.textContent?.trim() || '';
      const ariaLabel = btn.getAttribute('aria-label') || '';
      const title = btn.getAttribute('title') || '';
      if (!text && !ariaLabel && !title) {
        found.push({
          severity: 'High',
          issueType: 'Empty Button',
          description: `Button ${i + 1} has no visible text and no aria-label attribute.`,
          impact:
            'Keyboard-only and screen-reader users cannot determine what this button does. Automated accessibility audits will flag this as a WCAG 2.1 Level A failure (Success Criterion 4.1.2).',
          recommendation:
            'Add meaningful text inside the button element, or add an aria-label attribute. If the button only contains an icon, pair it with a visually-hidden <span> or use aria-label.',
          selector: getCssPath(btn),
        });
      }
    });

    // ── Empty Links ───────────────────────────────────────────────────
    document.querySelectorAll('a').forEach((link, i) => {
      const text = link.textContent?.trim() || '';
      const ariaLabel = link.getAttribute('aria-label') || '';
      const title = link.getAttribute('title') || '';
      if (!text && !ariaLabel && !title) {
        const href = link.href?.substring(0, 80) || 'none';
        found.push({
          severity: 'Medium',
          issueType: 'Empty Link',
          description: `Link ${i + 1} (href: "${href}") has no visible text and no aria-label.`,
          impact:
            'Screen readers read this link as "link" with no destination hint. Search engines treat anchor text as a relevance signal — an empty link passes no keyword value.',
          recommendation:
            'Provide descriptive anchor text or an aria-label that describes the destination. Avoid generic text like "click here".',
          selector: getCssPath(link),
        });
      }
    });

    // ── Missing Form Labels ───────────────────────────────────────────
    document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"])'
    ).forEach((input, i) => {
      const id = input.getAttribute('id');
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledby = input.getAttribute('aria-labelledby');
      const hasLabel = id ? document.querySelector(`label[for="${id}"]`) !== null : false;
      if (!hasLabel && !ariaLabel && !ariaLabelledby) {
        const type = input.getAttribute('type') || 'text';
        found.push({
          severity: 'High',
          issueType: 'Missing Form Label',
          description: `Input field ${i + 1} (type="${type}") has no associated <label>, aria-label, or aria-labelledby attribute.`,
          impact:
            'Screen readers cannot tell users what to type into this field. This is a WCAG 2.1 Level A violation (Success Criterion 1.3.1 and 3.3.2).',
          recommendation:
            'Add a <label for="inputId"> element whose for attribute matches the input\'s id. If a visible label is not desired, use aria-label on the input itself.',
          selector: getCssPath(input),
        });
      }
    });

    // ── Heading Hierarchy Skip ────────────────────────────────────────
    let prevLevel = 0;
    document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      const level = parseInt(h.tagName.substring(1));
      if (prevLevel > 0 && level > prevLevel + 1) {
        found.push({
          severity: 'Low',
          issueType: 'Heading Hierarchy Skip',
          description: `Heading level jumps from H${prevLevel} to H${level}. Heading text: "${h.textContent?.trim().substring(0, 60)}"`,
          impact:
            'Screen readers use heading structure to let users navigate the page by section. Skipping levels confuses this outline and breaks WCAG 2.1 Success Criterion 1.3.1.',
          recommendation: `Change the H${level} to an H${prevLevel + 1} so the outline is sequential.`,
          selector: getCssPath(h),
        });
      }
      prevLevel = level;
    });

    // ── Missing Meta Description ──────────────────────────────────────
    const metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc || !metaDesc.getAttribute('content')?.trim()) {
      found.push({
        severity: 'Low',
        issueType: 'Missing Meta Description',
        description: 'This page has no <meta name="description"> tag (or the content is empty).',
        impact:
          'Search engines often display the meta description as the snippet text in search results. Without it, Google generates its own excerpt, which may reduce click-through rate.',
        recommendation:
          'Add <meta name="description" content="..."> inside <head> with a concise summary (ideally 150–160 characters).',
        selector: 'head',
      });
    }

    // ── Missing Page Title ────────────────────────────────────────────
    if (!document.title || document.title.trim() === '') {
      found.push({
        severity: 'Medium',
        issueType: 'Missing Page Title',
        description: 'This page has no <title> element, or it is blank.',
        impact:
          'The page title is displayed in browser tabs, bookmarks, and search result headlines. A missing title is a WCAG 2.4.2 Level A failure and significantly hurts SEO.',
        recommendation:
          'Add <title>Descriptive Page Name — Site Name</title> inside <head>. Keep it under 60 characters.',
        selector: 'head > title',
      });
    }

    // ── Viewport Overflow ─────────────────────────────────────────────
    const hasHorizontalScroll =
      document.documentElement.scrollWidth > document.documentElement.clientWidth;
    if (hasHorizontalScroll) {
      const overflow =
        document.documentElement.scrollWidth - document.documentElement.clientWidth;
      found.push({
        severity: 'Medium',
        issueType: 'Viewport Overflow',
        description: `Page content is wider than the viewport by ${overflow}px, causing a horizontal scrollbar.`,
        impact:
          "Horizontal scrolling breaks the reading flow on desktop and is nearly unusable on mobile. Google's mobile-friendliness test penalises pages with viewport overflow.",
        recommendation:
          'Identify the overflowing element using browser DevTools. Common causes: fixed-width containers, long unbreakable text, or images without max-width: 100%.',
        selector: 'html',
      });
    }

    // ── Overlapping Interactive Elements ──────────────────────────────
    (() => {
      const allElements = document.querySelectorAll('button, a, input, select, textarea');
      const rects: Array<{ el: Element; rect: DOMRect }> = [];
      allElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) rects.push({ el, rect });
      });
      for (let i = 0; i < rects.length && i < 50; i++) {
        for (let j = i + 1; j < rects.length && j < 50; j++) {
          const a = rects[i].rect;
          const b = rects[j].rect;
          const overlap = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
          if (overlap) {
            found.push({
              severity: 'High',
              issueType: 'Overlapping Interactive Elements',
              description: `Two interactive elements overlap: ${rects[i].el.tagName.toLowerCase()} and ${rects[j].el.tagName.toLowerCase()} at 1280×800.`,
              impact:
                'When clickable elements overlap, users may accidentally trigger the wrong action. On touchscreens the problem is amplified.',
              recommendation:
                'Use browser DevTools to identify the overlapping elements and fix their positioning (check z-index, absolute/fixed positioning, or negative margins).',
            });
            return;
          }
        }
      }
    })();

    return found;
  }, url);

  // Fetch document-relative bounding boxes for every issue that has a selector
  const selectors = rawIssues.map((i) => i.selector ?? '');
  let boundingBoxes: (BoundingBox | null)[] = selectors.map(() => null);
  try {
    boundingBoxes = await page.evaluate((sels: string[]) => {
      const scrollX = window.pageXOffset || 0;
      const scrollY = window.pageYOffset || 0;
      return sels.map((sel) => {
        if (!sel) return null;
        try {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return null;
          return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
        } catch {
          return null;
        }
      });
    }, selectors);
  } catch {
    // bounding box fetch failed — continue without them
  }

  return rawIssues.map((issue, i) => ({
    page: url,
    severity: issue.severity as Severity,
    issueType: issue.issueType,
    description: issue.description,
    impact: issue.impact,
    recommendation: issue.recommendation,
    selector: issue.selector,
    boundingBox: boundingBoxes[i] ?? undefined,
  }));
}

/**
 * Run UI inspection using Chromium (default, backward-compatible entry point).
 */
export async function inspectUI(pages: Array<{ url: string }>, device?: string): Promise<UIIssue[]> {
  const issues: UIIssue[] = [];
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, env: playwrightEnv() });
    console.log('[inspectUI] Browser launched');

    const deviceConfig = device && devices[device] 
      ? { ...devices[device], deviceScaleFactor: 1 } 
      : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
    const context = await browser.newContext(deviceConfig);
    
    // Inject __name shim to prevent esbuild-injected helper errors in browser context
    await context.addInitScript(() => {
      // @ts-ignore
      window.__name = (f, n) => f;
    });
    
    const inspectionPromises = pages.map(async ({ url }) => {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
        console.log(`[inspectUI] Page loaded: ${url}`);
        
        // Capture console errors
        const consoleErrors: UIIssue[] = [];
        page.on('console', msg => {
          if (msg.type() === 'error') {
            consoleErrors.push({
              page: url,
              severity: 'High',
              issueType: 'Console Error',
              description: `JS Error: ${msg.text()}`,
              impact: 'Javascript errors can break critical site functionality and user interactions.',
              recommendation: 'Check the browser console and source code to resolve this exception.'
            });
          }
        });

        const pageIssues = await runPageUIChecks(page, url);
        const combined = [...pageIssues, ...consoleErrors];
        console.log(`[inspectUI] ${url} => ${combined.length} issues`);
        return combined;
      } catch (err) {
        console.error(`[inspectUI] Failed on ${url}:`, err instanceof Error ? err.message : err);
        // Skip failed pages
        return [];
      } finally {
        await page.close();
      }
    });

    const results = await Promise.all(inspectionPromises);
    for (const res of results) {
      issues.push(...res);
    }

    await context.close();
  } finally {
    if (browser) await browser.close();
  }
  return issues;
}
