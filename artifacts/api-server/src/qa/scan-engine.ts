import path from 'path';
import { createClient } from '@supabase/supabase-js';
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
import type { ScanJob, ScanReport, ScanStep, BrokenLink, UIIssue } from './types.js';

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

    const { pages, allLinks, brokenResources } = await crawlSite(
      job.url,
      job.maxPages,
      job.jobId,
      screenshotsDir,
      job.device,
      (currentUrl, progress) => { 
        job.currentUrl = currentUrl;
        job.progress = Math.max(job.progress, progress);
      }
    );

    setStepStatus(job, 'crawl', 'completed');
    job.progress = 20;
    if (job.cancelled) return;

    // ── Step 2-5: Parallel Inspection ──────────────────────────────────
    job.currentStep = 'Performing comprehensive inspection...';
    
    const [brokenLinksResult, uiIssuesResult, formIssuesResult, journeyData] = await Promise.all([
      // 1. Link Checking
      (async () => {
        setStepStatus(job, 'links', 'running');
        let bl = await checkLinks(allLinks);
        bl = deduplicateBrokenLinks(bl);
        setStepStatus(job, 'links', 'completed');
        return bl;
      })(),

      // 2. UI Inspection
      (async () => {
        setStepStatus(job, 'ui', 'running');
        const pagesToInspect = pages.slice(0, Math.min(pages.length, 3));
        let ui = multiBrowser && !job.device
          ? await runMultiBrowserInspection(pagesToInspect, job.browsers)
          : await inspectUI(pagesToInspect, job.device);
        ui = deduplicateUIIssues(ui);
        setStepStatus(job, 'ui', 'completed');
        return ui;
      })(),

      // 3. Form Testing
      (async () => {
        setStepStatus(job, 'forms', 'running');
        const pagesToInspect = pages.slice(0, Math.min(pages.length, 3));
        const pagesWithForms = pagesToInspect.filter((p) => (p.formsFound || 0) > 0);
        let forms = await testForms(
          pagesWithForms.length > 0 ? pagesWithForms : pagesToInspect.slice(0, 3),
          job.device
        );
        forms = deduplicateFormIssues(forms);
        setStepStatus(job, 'forms', 'completed');
        return forms;
      })(),

      // 4. Journey Testing (optional)
      (async () => {
        if (!job.runJourneys) return { results: [], issues: [] };
        setStepStatus(job, 'journeys', 'running');
        const pagesToInspect = pages.slice(0, Math.min(pages.length, 3));
        const data = await runJourneyTests(pagesToInspect, job.device);
        setStepStatus(job, 'journeys', 'completed');
        return data;
      })()
    ]);

    let brokenLinks = brokenLinksResult;
    let uiIssues = uiIssuesResult;
    let formIssues = formIssuesResult;
    let journeyResults = journeyData.results;
    let journeyIssues = journeyData.issues;

    job.progress = 80;
    if (job.cancelled) return;

    // ── Annotate screenshots with red boxes (non-blocking) ──────────────
    annotatePageScreenshots(pages, uiIssues, formIssues, screenshotsDir).catch(() => {});
    if (job.cancelled) return;

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

    // Map broken resources to broken links for simplicity in report
    const resourceBrokenLinks: BrokenLink[] = brokenResources.map(r => ({
      sourcePage: r.source,
      linkUrl: r.url,
      statusCode: r.status,
      statusType: r.status >= 500 ? 'Server Error' : (r.status === 404 ? 'Not Found' : 'Client Error'),
      error: `Resource failed to load (${r.type})`
    }));

    const report = buildReport({
      jobId: job.jobId,
      targetUrl: job.url,
      scannedAt: new Date(job.startedAt).toISOString(),
      scanDurationMs,
      brokenLinks: [...brokenLinks, ...resourceBrokenLinks],
      uiIssues,
      formIssues,
      journeyIssues,
      journeyResults,
      pagesScanned: pages,
      browsers: job.browsers,
      device: job.device,
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

    // Save to Supabase
    const supabaseUrl = process.env['SUPABASE_URL'];
    const supabaseKey = process.env['SUPABASE_ANON_KEY'];
    
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const scanToInsert = {
        job_id: job.jobId,
        target_url: job.url,
        scanned_at: new Date(job.startedAt).toISOString(),
        total_pages: pages.length,
        scan_duration_ms: scanDurationMs,
        summary: report.summary,
        browsers: job.browsers,
        previous_job_id: previousJobId,
        status: 'completed',
        full_report: report
      };
      
      try {
        const { error: scanError } = await supabase.from('scans').upsert(scanToInsert);
        if (scanError) console.error("Supabase scan insert error:", scanError);
        
        const issuesToInsert = [];
        
        for (const link of report.brokenLinks) {
          issuesToInsert.push({
            job_id: job.jobId,
            issue_category: 'broken_link',
            page_url: link.sourcePage,
            severity: 'High',
            issue_type: link.statusType,
            description: `Broken link to ${link.linkUrl} (${link.statusCode})`,
            ai_category: link.aiCategory || null,
            ai_confidence: link.aiConfidence || null,
            issue_status: link.issueStatus || null,
            occurrences: link.occurrences || 1,
            details: link
          });
        }
        
        for (const ui of report.uiIssues) {
          issuesToInsert.push({
            job_id: job.jobId,
            issue_category: 'ui_issue',
            page_url: ui.page,
            severity: ui.severity,
            issue_type: ui.issueType,
            description: ui.description,
            ai_category: ui.aiCategory || null,
            ai_confidence: ui.aiConfidence || null,
            issue_status: ui.issueStatus || null,
            occurrences: ui.occurrences || 1,
            details: ui
          });
        }
        
        for (const form of report.formIssues) {
          issuesToInsert.push({
            job_id: job.jobId,
            issue_category: 'form_issue',
            page_url: form.page,
            severity: form.severity,
            issue_type: form.issueType,
            description: form.description,
            ai_category: form.aiCategory || null,
            ai_confidence: form.aiConfidence || null,
            issue_status: form.issueStatus || null,
            occurrences: form.occurrences || 1,
            details: form
          });
        }

        if (issuesToInsert.length > 0) {
          for (let i = 0; i < issuesToInsert.length; i += 100) {
              const chunk = issuesToInsert.slice(i, i + 100);
              const { error: issueError } = await supabase.from('scan_issues').insert(chunk);
              if (issueError) console.error("Supabase issue insert error:", issueError);
          }
        }
      } catch(sbErr) {
        console.error("Supabase saving failed:", sbErr);
      }
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
