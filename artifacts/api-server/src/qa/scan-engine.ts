import path from 'path';
import fs from 'fs/promises';
import { crawlSite } from './crawler.js';
import { checkLinks } from './link-checker.js';
import { inspectUI } from './ui-inspector.js';
import { runMultiBrowserInspection } from './browser-runs.js';
import { testForms } from './form-tester.js';
import { runJourneyTests } from './journey-tests.js';
import { classifyBug } from './ai-classifier.js';
import { buildReport } from './report-generator.js';
import {
  deduplicateBrokenLinks,
  deduplicateUIIssues,
  deduplicateFormIssues,
} from './bug-grouping.js';
import { findBaselineScan, compareWithBaseline } from './baseline-compare.js';
import { annotatePageScreenshots } from './screenshot-annotator.js';
import type { ScanJob, ScanReport, ScanStep } from './types.js';

export const SCREENSHOTS_BASE_DIR = path.join(process.cwd(), '..', '..', 'screenshots');

export async function loadReportFromDisk(jobId: string): Promise<ScanReport | null> {
  try {
    const reportPath = path.join(SCREENSHOTS_BASE_DIR, jobId, 'report.json');
    const raw = await fs.readFile(reportPath, 'utf-8');
    return JSON.parse(raw) as ScanReport;
  } catch {
    return null;
  }
}

function makeSteps(runJourneys: boolean, multiplesBrowsers: boolean): ScanStep[] {
  const steps: ScanStep[] = [
    { name: 'crawl', status: 'pending', label: 'Crawling Pages' },
    { name: 'links', status: 'pending', label: 'Checking Links' },
    { name: 'ui', status: 'pending', label: multiplesBrowsers ? 'Cross-Browser UI Inspection' : 'UI Inspection' },
    { name: 'forms', status: 'pending', label: 'Form Testing' },
  ];
  if (runJourneys) {
    steps.push({ name: 'journeys', status: 'pending', label: 'User Journey Testing' });
  }
  steps.push({ name: 'report', status: 'pending', label: 'Generating Report' });
  return steps;
}

function setStepStatus(job: ScanJob, stepName: string, status: ScanStep['status']) {
  const step = job.steps.find((s) => s.name === stepName);
  if (step) step.status = status;
}

export async function runScan(job: ScanJob): Promise<void> {
  const startTime = Date.now();
  const screenshotsDir = path.join(SCREENSHOTS_BASE_DIR, job.jobId);
  const multiBrowser = job.browsers.length > 1;

  job.status = 'running';
  job.steps = makeSteps(job.runJourneys, multiBrowser);

  try {
    const openaiApiKey = process.env['OPENAI_API_KEY'];
    const aiModel = process.env['AI_MODEL'] || 'gpt-4o';
    const envEnableAI = process.env['ENABLE_AI_CLASSIFICATION'] === 'true';
    const enableAI = job.enableAI || envEnableAI;

    // ── Step 1: Crawl ──────────────────────────────────────────────────
    setStepStatus(job, 'crawl', 'running');
    job.currentStep = 'Crawling Pages';
    job.progress = 5;

    const { pages, allLinks } = await crawlSite(
      job.url,
      job.maxPages,
      job.jobId,
      screenshotsDir,
      (currentUrl) => { job.currentUrl = currentUrl; }
    );

    setStepStatus(job, 'crawl', 'completed');
    job.progress = 20;
    if (job.cancelled) return;

    // ── Step 2: Link Checking ──────────────────────────────────────────
    setStepStatus(job, 'links', 'running');
    job.currentStep = 'Checking Links';
    job.currentUrl = undefined;

    let brokenLinks = await checkLinks(allLinks);
    brokenLinks = deduplicateBrokenLinks(brokenLinks);

    setStepStatus(job, 'links', 'completed');
    job.progress = 38;
    if (job.cancelled) return;

    // ── Step 3: UI Inspection (single or multi-browser) ────────────────
    setStepStatus(job, 'ui', 'running');
    job.currentStep = multiBrowser ? 'Cross-Browser UI Inspection' : 'UI Inspection';

    const pagesToInspect = pages.slice(0, Math.min(pages.length, 10));
    console.log(`[scan-engine] UI Inspection starting for ${pagesToInspect.length} pages, multiBrowser=${multiBrowser}`);

    let uiIssues = multiBrowser
      ? await runMultiBrowserInspection(pagesToInspect, job.browsers)
      : await inspectUI(pagesToInspect);

    console.log(`[scan-engine] UI Inspection completed: ${uiIssues.length} issues found`);
    uiIssues = deduplicateUIIssues(uiIssues);

    setStepStatus(job, 'ui', 'completed');
    job.progress = 58;
    if (job.cancelled) return;

    // ── Step 4: Form Testing ───────────────────────────────────────────
    setStepStatus(job, 'forms', 'running');
    job.currentStep = 'Form Testing';

    const pagesWithForms = pagesToInspect.filter((p) => (p.formsFound || 0) > 0);
    console.log(`[scan-engine] Form Testing starting: ${pagesWithForms.length} pages with forms, fallback=${pagesWithForms.length === 0}`);
    let formIssues = await testForms(
      pagesWithForms.length > 0 ? pagesWithForms : pagesToInspect.slice(0, 5)
    );
    console.log(`[scan-engine] Form Testing completed: ${formIssues.length} issues found`);
    formIssues = deduplicateFormIssues(formIssues);

    setStepStatus(job, 'forms', 'completed');
    job.progress = 72;
    if (job.cancelled) return;

    // ── Annotate screenshots with red boxes for every detected issue ────
    // (runs after both UI + form inspection so all issues are captured)
    try {
      await annotatePageScreenshots(pages, uiIssues, formIssues, screenshotsDir);
    } catch {
      // Non-fatal — scan continues even if annotation fails
    }
    if (job.cancelled) return;

    // ── Step 5: Journey Testing (optional) ────────────────────────────
    let journeyIssues: import('./types.js').JourneyIssue[] = [];
    let journeyResults: import('./types.js').JourneyResult[] = [];

    if (job.runJourneys) {
      setStepStatus(job, 'journeys', 'running');
      job.currentStep = 'User Journey Testing';

      const { results, issues } = await runJourneyTests(pagesToInspect);
      journeyResults = results;
      journeyIssues = issues;

      setStepStatus(job, 'journeys', 'completed');
      job.progress = 82;
      if (job.cancelled) return;
    }

    // ── Step 6: AI Classification + Report Generation ──────────────────
    setStepStatus(job, 'report', 'running');
    job.currentStep = 'Generating Report';

    if (enableAI) {
      await Promise.all([
        ...brokenLinks.map(async (link) => {
          const r = await classifyBug(link.linkUrl, 'Broken Link', enableAI, openaiApiKey, aiModel);
          link.aiCategory = r.category;
          link.aiConfidence = r.confidence;
        }),
        ...uiIssues.map(async (issue) => {
          const r = await classifyBug(issue.description, issue.issueType, enableAI, openaiApiKey, aiModel);
          issue.aiCategory = r.category;
          issue.aiConfidence = r.confidence;
        }),
        ...formIssues.map(async (issue) => {
          const r = await classifyBug(issue.description, issue.issueType, enableAI, openaiApiKey, aiModel);
          issue.aiCategory = r.category;
          issue.aiConfidence = r.confidence;
        }),
      ]);
    } else {
      await Promise.all([
        ...brokenLinks.map(async (link) => {
          const r = await classifyBug(link.linkUrl, 'Broken Link', false);
          link.aiCategory = r.category;
        }),
        ...uiIssues.map(async (issue) => {
          const r = await classifyBug(issue.description, issue.issueType, false);
          issue.aiCategory = r.category;
        }),
        ...formIssues.map(async (issue) => {
          const r = await classifyBug(issue.description, issue.issueType, false);
          issue.aiCategory = r.category;
        }),
      ]);
    }

    // ── Baseline Comparison ────────────────────────────────────────────
    let previousJobId: string | undefined;
    let newCount: number | undefined;
    let fixedCount: number | undefined;
    let repeatedCount: number | undefined;

    const baseline = await findBaselineScan(SCREENSHOTS_BASE_DIR, job.url, job.jobId);
    if (baseline) {
      const compared = compareWithBaseline({ uiIssues, formIssues, brokenLinks }, baseline);
      uiIssues = compared.uiIssues;
      formIssues = compared.formIssues;
      brokenLinks = compared.brokenLinks;
      previousJobId = baseline.jobId;
      newCount = compared.newCount;
      fixedCount = compared.fixedCount;
      repeatedCount = compared.repeatedCount;
    }

    const scanDurationMs = Date.now() - startTime;

    const report = buildReport({
      jobId: job.jobId,
      targetUrl: job.url,
      scannedAt: new Date(job.startedAt).toISOString(),
      scanDurationMs,
      brokenLinks,
      uiIssues,
      formIssues,
      journeyIssues,
      journeyResults,
      pagesScanned: pages,
      browsers: job.browsers,
      previousJobId,
      newCount,
      fixedCount,
      repeatedCount,
    });

    job.report = report;
    setStepStatus(job, 'report', 'completed');
    job.progress = 100;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.currentStep = 'Scan Complete';
    job.screenshotsDir = screenshotsDir;

    try {
      const reportPath = path.join(screenshotsDir, 'report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    } catch {
      // Non-fatal
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    job.status = 'failed';
    job.error = msg;
    job.progress = 100;
    job.currentStep = 'Scan Failed';
    for (const step of job.steps) {
      if (step.status === 'running') step.status = 'failed';
    }
  }
}
