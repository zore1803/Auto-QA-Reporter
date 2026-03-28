import { chromium } from 'playwright';
import { generateHtmlReport } from './report-generator.js';
import type { ScanReport } from './types.js';
import { playwrightEnv } from './playwright-env.js';

export async function generatePdfReport(report: ScanReport): Promise<Buffer> {
  const html = generateHtmlReport(report);

  const browser = await chromium.launch({
    headless: true,
    env: playwrightEnv(),
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm',
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
