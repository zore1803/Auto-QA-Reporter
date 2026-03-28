import { Router, type IRouter, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs/promises';
import { runScan, SCREENSHOTS_BASE_DIR, loadReportFromDisk } from '../qa/scan-engine.js';
import { generateHtmlReport } from '../qa/report-generator.js';
import { generatePdfReport } from '../qa/pdf-exporter.js';
import type { ScanJob, BrowserName } from '../qa/types.js';

const router: IRouter = Router();
const jobs = new Map<string, ScanJob>();
const MAX_CONCURRENT_SCANS = 3;

function getSupabase() {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_ANON_KEY'];
  if (url && key) return createClient(url, key);
  return null;
}

const VALID_BROWSERS: BrowserName[] = ['chromium', 'firefox', 'webkit'];

function getRunningScansCount(): number {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.status === 'pending' || job.status === 'running') count++;
  }
  return count;
}

router.post('/scan', async (req: Request, res: Response) => {
  const {
    url,
    maxPages = 20,
    enableAI = false,
    browsers,
    device,
    runJourneys = false,
  } = req.body as {
    url?: string;
    maxPages?: number;
    enableAI?: boolean;
    browsers?: string[];
    device?: string;
    runJourneys?: boolean;
  };

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Invalid protocol');
  } catch {
    res.status(400).json({ error: 'Invalid URL — must be a full http/https URL' });
    return;
  }

  if (getRunningScansCount() >= MAX_CONCURRENT_SCANS) {
    res.status(429).json({ error: 'Too many concurrent scans. Please wait for an existing scan to finish.' });
    return;
  }

  // Validate and normalise browser list
  const requestedBrowsers: BrowserName[] = Array.isArray(browsers)
    ? (browsers.filter((b) => VALID_BROWSERS.includes(b as BrowserName)) as BrowserName[])
    : ['chromium'];

  const selectedBrowsers: BrowserName[] =
    requestedBrowsers.length > 0 ? requestedBrowsers : ['chromium'];

  const jobId = randomUUID();
  const job: ScanJob = {
    jobId,
    url: parsedUrl.toString(),
    maxPages: Math.min(Math.max(Number(maxPages) || 20, 1), 50),
    enableAI: Boolean(enableAI),
    browsers: selectedBrowsers,
    device,
    runJourneys: Boolean(runJourneys),
    status: 'pending',
    progress: 0,
    currentStep: 'Queued',
    steps: [],
    startedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  runScan(job).catch((err: unknown) => {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
  });

  res.json({ jobId, status: 'pending', message: 'Scan started' });
});

router.delete('/scan/:jobId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.status === 'completed' || job.status === 'failed') {
    res.status(400).json({ error: 'Cannot cancel a finished scan' });
    return;
  }
  job.cancelled = true;
  job.status = 'failed';
  job.error = 'Scan cancelled by user';
  job.completedAt = new Date().toISOString();
  job.currentStep = 'Cancelled';
  for (const step of job.steps) {
    if (step.status === 'running' || step.status === 'pending') step.status = 'failed';
  }
  res.json({ jobId: job.jobId, status: 'cancelled' });
});

router.get('/scan/:jobId/status', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json({
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    currentUrl: job.currentUrl,
    steps: job.steps,
    error: job.error,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    browsers: job.browsers,
    device: job.device,
    runJourneys: job.runJourneys,
  });
});

router.get('/scan/:jobId/report', async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = jobs.get(jobId);
  if (job) {
    if (job.status !== 'completed' || !job.report) {
      res.status(202).json({ error: 'Report not ready yet', status: job.status });
      return;
    }
    res.json(job.report);
    return;
  }
  
  const sb = getSupabase();
  if (sb) {
     const { data } = await sb.from('scans').select('full_report').eq('job_id', jobId).single();
     if (data?.full_report) {
       res.json(data.full_report);
       return;
     }
  }

  const diskReport = await loadReportFromDisk(jobId);
  if (diskReport) {
    res.json(diskReport);
    return;
  }
  res.status(404).json({ error: 'Job not found' });
});

// List past scans from disk or DB
router.get('/scans/history', async (_req: Request, res: Response) => {
  try {
    let scans: Array<{
      jobId: string;
      targetUrl: string;
      scannedAt: string;
      totalBugs: number;
      healthScore: number;
    }> = [];

    const sb = getSupabase();
    if (sb) {
       const { data } = await sb.from('scans').select('job_id, target_url, scanned_at, summary').order('scanned_at', { ascending: false });
       if (data && data.length > 0) {
         scans = data.map(d => ({
            jobId: d.job_id,
            targetUrl: d.target_url,
            scannedAt: d.scanned_at,
            totalBugs: (d.summary as any)?.totalBugs ?? 0,
            healthScore: (d.summary as any)?.healthScore ?? 0,
         }));
         res.json({ scans });
         return;
       }
    }

    const entries = await fs.readdir(SCREENSHOTS_BASE_DIR).catch(() => [] as string[]);

    for (const entry of entries) {
      try {
        const reportPath = path.join(SCREENSHOTS_BASE_DIR, entry, 'report.json');
        const raw = await fs.readFile(reportPath, 'utf-8');
        const report = JSON.parse(raw);
        scans.push({
          jobId: report.jobId,
          targetUrl: report.targetUrl,
          scannedAt: report.scannedAt,
          totalBugs: report.summary?.totalBugs ?? 0,
          healthScore: report.summary?.healthScore ?? 0,
        });
      } catch {
        // Skip missing/invalid
      }
    }

    scans.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());
    res.json({ scans });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load history' });
  }
});

router.get('/scan/:jobId/screenshots', async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const job = jobs.get(jobId);
  const report = job?.report ?? (await loadReportFromDisk(jobId));
  const screenshotsDir = path.join(SCREENSHOTS_BASE_DIR, jobId);
  let files: string[] = [];
  try {
    const entries = await fs.readdir(screenshotsDir);
    files = entries.filter((f) => f.endsWith('.png'));
  } catch {
    // No screenshots directory
  }
  if (files.length === 0 && !report) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  const screenshots = files.map((filename) => {
    const pageUrl =
      report?.pagesScanned.find((p) => p.screenshotFile === filename)?.url ||
      filename.replace(`${jobId}_`, '').replace(/_/g, '/').replace('.png', '');
    return { filename, url: `/api/screenshots/${encodeURIComponent(filename)}`, pageUrl };
  });
  res.json({ jobId, screenshots });
});

router.get('/scan/:jobId/export/html', async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const report = jobs.get(jobId)?.report ?? (await loadReportFromDisk(jobId));
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  const html = generateHtmlReport(report);
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="qa-report-${jobId.substring(0, 8)}.html"`);
  res.send(html);
});

router.get('/scan/:jobId/export/pdf', async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const report = jobs.get(jobId)?.report ?? (await loadReportFromDisk(jobId));
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  try {
    const pdfBuffer = await generatePdfReport(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="qa-report-${jobId.substring(0, 8)}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `PDF generation failed: ${msg}` });
  }
});

router.get('/screenshots/:filename', async (req: Request, res: Response) => {
  const filename = decodeURIComponent(req.params.filename as string);
  if (filename.includes('..') || filename.includes('/')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const jobId = filename.split('_')[0];
  if (!jobId) {
    res.status(400).json({ error: 'Invalid filename format' });
    return;
  }
  const filePath = path.join(SCREENSHOTS_BASE_DIR, jobId, filename);
  try {
    await fs.access(filePath);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const content = await fs.readFile(filePath);
    res.send(content);
  } catch {
    res.status(404).json({ error: 'Screenshot not found' });
  }
});

export default router;
