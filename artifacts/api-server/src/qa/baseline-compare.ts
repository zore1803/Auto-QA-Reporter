import path from 'path';
import fs from 'fs/promises';
import type { ScanReport, UIIssue, FormIssue, BrokenLink, IssueStatus } from './types.js';

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).replace(/\/$/, '').toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function uiSignature(i: UIIssue): string {
  return `${i.issueType}::${normalizeUrl(i.page)}`;
}

function formSignature(i: FormIssue): string {
  return `${i.issueType}::${normalizeUrl(i.page)}::${i.formSelector}`;
}

function linkSignature(l: BrokenLink): string {
  return `${l.linkUrl}::${l.statusType}`;
}

/**
 * Find the most recent completed scan report for the same target URL.
 * Scans the screenshots directory for report.json files.
 */
export async function findBaselineScan(
  screenshotsBaseDir: string,
  targetUrl: string,
  currentJobId: string
): Promise<ScanReport | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(screenshotsBaseDir);
  } catch {
    return null;
  }

  const normalizedTarget = normalizeUrl(targetUrl);
  const candidates: { report: ScanReport; mtime: number }[] = [];

  for (const entry of entries) {
    if (entry === currentJobId) continue;
    try {
      const reportPath = path.join(screenshotsBaseDir, entry, 'report.json');
      const [stat, raw] = await Promise.all([
        fs.stat(reportPath),
        fs.readFile(reportPath, 'utf-8'),
      ]);
      const report = JSON.parse(raw) as ScanReport;
      if (normalizeUrl(report.targetUrl) === normalizedTarget) {
        candidates.push({ report, mtime: stat.mtimeMs });
      }
    } catch {
      // Skip missing/invalid reports
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].report;
}

export interface BaselineResult {
  uiIssues: UIIssue[];
  formIssues: FormIssue[];
  brokenLinks: BrokenLink[];
  newCount: number;
  repeatedCount: number;
  fixedCount: number;
  previousJobId: string;
}

/**
 * Compare current scan results against a baseline report.
 * Tags each current issue as 'new' or 'repeated'.
 * Counts 'fixed' issues (present in baseline but absent now).
 */
export function compareWithBaseline(
  current: { uiIssues: UIIssue[]; formIssues: FormIssue[]; brokenLinks: BrokenLink[] },
  baseline: ScanReport
): BaselineResult {
  const baseUI = new Set(baseline.uiIssues.map(uiSignature));
  const baseForm = new Set(baseline.formIssues.map(formSignature));
  const baseLink = new Set(baseline.brokenLinks.map(linkSignature));

  const curUI = new Set(current.uiIssues.map(uiSignature));
  const curForm = new Set(current.formIssues.map(formSignature));
  const curLink = new Set(current.brokenLinks.map(linkSignature));

  const tag = <T extends { issueStatus?: IssueStatus }>(
    item: T,
    sig: string,
    baseSet: Set<string>
  ): T => ({
    ...item,
    issueStatus: (baseSet.has(sig) ? 'repeated' : 'new') as IssueStatus,
  });

  const uiIssues = current.uiIssues.map((i) => tag(i, uiSignature(i), baseUI));
  const formIssues = current.formIssues.map((i) => tag(i, formSignature(i), baseForm));
  const brokenLinks = current.brokenLinks.map((l) => tag(l, linkSignature(l), baseLink));

  const fixedCount =
    [...baseUI].filter((k) => !curUI.has(k)).length +
    [...baseForm].filter((k) => !curForm.has(k)).length +
    [...baseLink].filter((k) => !curLink.has(k)).length;

  const newCount = [
    ...uiIssues.filter((i) => i.issueStatus === 'new'),
    ...formIssues.filter((i) => i.issueStatus === 'new'),
    ...brokenLinks.filter((l) => l.issueStatus === 'new'),
  ].length;

  const repeatedCount = [
    ...uiIssues.filter((i) => i.issueStatus === 'repeated'),
    ...formIssues.filter((i) => i.issueStatus === 'repeated'),
    ...brokenLinks.filter((l) => l.issueStatus === 'repeated'),
  ].length;

  return {
    uiIssues,
    formIssues,
    brokenLinks,
    newCount,
    repeatedCount,
    fixedCount,
    previousJobId: baseline.jobId,
  };
}
