import type {
  ScanReport,
  BrokenLink,
  UIIssue,
  FormIssue,
  JourneyIssue,
  PageScanned,
  BrowserName,
} from './types.js';

function severityColor(severity: string): string {
  if (severity === 'High') return '#ef4444';
  if (severity === 'Medium') return '#f59e0b';
  return '#22c55e';
}

function statusColor(statusType: string): string {
  if (statusType === 'Not Found' || statusType === 'Client Error') return '#ef4444';
  if (statusType === 'Server Error') return '#ef4444';
  if (statusType === 'Timeout/Error') return '#f59e0b';
  if (statusType === 'Redirect') return '#f59e0b';
  return '#22c55e';
}

function issueStatusBadge(status?: string): string {
  if (!status) return '';
  const colors: Record<string, string> = { new: '#3b82f6', repeated: '#f59e0b', fixed: '#22c55e' };
  const color = colors[status] ?? '#64748b';
  return `<span class="badge" style="background:${color};margin-left:4px">${status}</span>`;
}

function browsersBadges(browsers?: BrowserName[]): string {
  if (!browsers || browsers.length === 0) return '';
  const shortName: Record<BrowserName, string> = { chromium: 'CR', firefox: 'FF', webkit: 'WK' };
  return browsers
    .map((b) => `<span class="badge" style="background:#7c3aed">${shortName[b] ?? b}</span>`)
    .join(' ');
}

export function buildReport(params: {
  jobId: string;
  targetUrl: string;
  scannedAt: string;
  scanDurationMs: number;
  brokenLinks: BrokenLink[];
  uiIssues: UIIssue[];
  formIssues: FormIssue[];
  journeyIssues: JourneyIssue[];
  journeyResults?: import('./types.js').JourneyResult[];
  pagesScanned: PageScanned[];
  browsers: BrowserName[];
  device?: string;
  previousJobId?: string;
  newCount?: number;
  fixedCount?: number;
  repeatedCount?: number;
}): ScanReport {
  const totalBugs =
    params.brokenLinks.length +
    params.uiIssues.length +
    params.formIssues.length +
    params.journeyIssues.length;

  const allIssuesWithSeverity = [
    ...params.uiIssues.map((i) => i.severity),
    ...params.formIssues.map((i) => i.severity),
    ...params.journeyIssues.map((i) => i.severity),
  ];

  const brokenLinksBySeverity = params.brokenLinks.map((l) => {
    if (l.statusCode === 0 || l.statusType === 'Timeout/Error') return 'Medium';
    if (l.statusCode >= 500) return 'High';
    return 'Medium';
  });

  const allSeverities = [...allIssuesWithSeverity, ...brokenLinksBySeverity];
  const highCount = allSeverities.filter((s) => s === 'High').length;
  const mediumCount = allSeverities.filter((s) => s === 'Medium').length;
  const lowCount = allSeverities.filter((s) => s === 'Low').length;

  const healthScore = Math.max(0, 100 - highCount * 12 - mediumCount * 4 - lowCount * 1);

  return {
    jobId: params.jobId,
    targetUrl: params.targetUrl,
    scannedAt: params.scannedAt,
    totalPages: params.pagesScanned.length,
    scanDurationMs: params.scanDurationMs,
    summary: {
      totalBugs,
      brokenLinks: params.brokenLinks.length,
      uiIssues: params.uiIssues.length,
      formIssues: params.formIssues.length,
      journeyIssues: params.journeyIssues.length,
      healthScore,
      severityCounts: { high: highCount, medium: mediumCount, low: lowCount },
      newIssues: params.newCount,
      fixedIssues: params.fixedCount,
      repeatedIssues: params.repeatedCount,
    },
    brokenLinks: params.brokenLinks,
    uiIssues: params.uiIssues,
    formIssues: params.formIssues,
    journeyIssues: params.journeyIssues,
    journeyResults: params.journeyResults,
    pagesScanned: params.pagesScanned,
    browsers: params.browsers,
    device: params.device,
    previousJobId: params.previousJobId,
  };
}

export function generateHtmlReport(report: ScanReport): string {
  const fmtDate = new Date(report.scannedAt).toLocaleString();
  const scanSecs = (report.scanDurationMs / 1000).toFixed(1);

  const allIssues = [
    ...report.brokenLinks.map((l) => ({
      type: 'Broken Link',
      severity: l.statusCode >= 500 ? 'High' : 'Medium',
      page: l.sourcePage,
      description: `${l.linkUrl} — ${l.statusType} (${l.statusCode || 'No response'})`,
      selector: '',
      aiCategory: l.aiCategory,
      issueStatus: l.issueStatus,
      occurrences: l.occurrences,
      browsers: undefined as BrowserName[] | undefined,
    })),
    ...report.uiIssues.map((i) => ({
      type: i.issueType,
      severity: i.severity,
      page: i.page,
      description: i.description,
      selector: i.selector || '',
      aiCategory: i.aiCategory,
      issueStatus: i.issueStatus,
      occurrences: i.occurrences,
      browsers: i.browsers,
    })),
    ...report.formIssues.map((i) => ({
      type: i.issueType,
      severity: i.severity,
      page: i.page,
      description: i.description,
      selector: i.formSelector,
      aiCategory: i.aiCategory,
      issueStatus: i.issueStatus,
      occurrences: i.occurrences,
      browsers: undefined as BrowserName[] | undefined,
    })),
    ...report.journeyIssues.map((i) => ({
      type: `Journey: ${i.issueType}`,
      severity: i.severity,
      page: i.page,
      description: i.description,
      selector: i.selector || '',
      aiCategory: i.journeyType,
      issueStatus: undefined,
      occurrences: undefined,
      browsers: undefined as BrowserName[] | undefined,
    })),
  ];

  const browsersInfo = report.browsers.join(', ');
  const baselineInfo = report.previousJobId
    ? `<div class="baseline-bar">
        <strong>Baseline comparison vs job ${report.previousJobId.substring(0, 8)}:</strong>
        ${report.summary.newIssues !== undefined ? `<span class="badge" style="background:#3b82f6">${report.summary.newIssues} New</span>` : ''}
        ${report.summary.repeatedIssues !== undefined ? `<span class="badge" style="background:#f59e0b">${report.summary.repeatedIssues} Repeated</span>` : ''}
        ${report.summary.fixedIssues !== undefined ? `<span class="badge" style="background:#22c55e">${report.summary.fixedIssues} Fixed</span>` : ''}
      </div>`
    : '';

  const issueRows = allIssues
    .map(
      (issue) => `
    <tr>
      <td><span class="badge" style="background:${severityColor(issue.severity)}">${issue.severity}</span>${issueStatusBadge(issue.issueStatus)}</td>
      <td>${issue.type}${issue.occurrences && issue.occurrences > 1 ? ` <span class="badge" style="background:#64748b">×${issue.occurrences}</span>` : ''}</td>
      <td class="url">${issue.page}</td>
      <td>${issue.description}</td>
      <td class="mono">${issue.selector}${browsersBadges(issue.browsers)}</td>
      <td>${issue.aiCategory ?? '—'}</td>
    </tr>`
    )
    .join('');

  const brokenLinkRows = report.brokenLinks
    .map(
      (l) => `
    <tr>
      <td><span class="badge" style="background:${statusColor(l.statusType)}">${l.statusCode || '?'}</span>${issueStatusBadge(l.issueStatus)}</td>
      <td>${l.statusType}${l.occurrences && l.occurrences > 1 ? ` <span class="badge" style="background:#64748b">×${l.occurrences}</span>` : ''}</td>
      <td class="url">${l.sourcePage}</td>
      <td class="url">${l.linkUrl}</td>
      <td class="mono">${l.error ?? '—'}</td>
    </tr>`
    )
    .join('');

  const journeyRows =
    report.journeyIssues.length > 0
      ? report.journeyIssues
          .map(
            (i) => `
    <tr>
      <td><span class="badge" style="background:${severityColor(i.severity)}">${i.severity}</span></td>
      <td>${i.journeyType}</td>
      <td>${i.issueType}</td>
      <td class="url">${i.page}</td>
      <td>${i.description}</td>
      <td>${i.step ?? '—'}</td>
    </tr>`
          )
          .join('')
      : '';

  const pageRows = report.pagesScanned
    .map(
      (p) => `
    <tr>
      <td class="url">${p.url}</td>
      <td><span class="badge" style="background:${p.statusCode === 200 ? '#22c55e' : '#ef4444'}">${p.statusCode}</span></td>
      <td>${p.title || '—'}</td>
      <td>${p.loadTimeMs ?? '—'}ms</td>
      <td>${p.linksFound ?? 0}</td>
      <td>${p.formsFound ?? 0}</td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QA Report — ${report.targetUrl}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; color: #0f172a; font-family: Georgia, serif; padding: 2rem; font-size: 0.9rem; line-height: 1.5; }
  h1, h2, h3 { font-family: Arial, sans-serif; }
  .header { border-bottom: 3px solid #1e40af; padding-bottom: 1.25rem; margin-bottom: 2rem; }
  .header h1 { font-size: 2rem; color: #1e40af; }
  .header .meta { color: #64748b; font-size: 0.8rem; margin-top: 0.4rem; font-family: monospace; }
  .header .target { color: #0f172a; font-size: 0.95rem; margin-top: 0.2rem; font-weight: bold; font-family: monospace; }
  .baseline-bar { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 0.6rem 1rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; font-family: Arial, sans-serif; font-size: 0.82rem; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
  .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #e2e8f0; padding: 1rem; border-radius: 4px; }
  .kpi-card .label { font-size: 0.7rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.08em; font-family: Arial, sans-serif; font-weight: 600; }
  .kpi-card .value { font-size: 2rem; font-weight: 700; margin-top: 0.2rem; font-family: Arial, sans-serif; }
  .kpi-card.total { border-left-color: #1e40af; } .kpi-card.total .value { color: #1e40af; }
  .kpi-card.links { border-left-color: #dc2626; } .kpi-card.links .value { color: #dc2626; }
  .kpi-card.ui { border-left-color: #b45309; } .kpi-card.ui .value { color: #b45309; }
  .kpi-card.forms { border-left-color: #7c3aed; } .kpi-card.forms .value { color: #7c3aed; }
  .kpi-card.health { border-left-color: #16a34a; } .kpi-card.health .value { color: #16a34a; }
  .kpi-card.journeys { border-left-color: #0891b2; } .kpi-card.journeys .value { color: #0891b2; }
  .severity-bar { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 0.75rem 1rem; border-radius: 4px; font-family: Arial, sans-serif; flex-wrap: wrap; }
  .sev-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; }
  .sev-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  section { margin-bottom: 2.5rem; }
  section h2 { font-size: 1.2rem; color: #1e40af; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.4rem; margin-bottom: 1rem; font-family: Arial, sans-serif; }
  table { width: 100%; border-collapse: collapse; font-size: 0.78rem; font-family: Arial, sans-serif; }
  th { background: #f1f5f9; color: #64748b; text-transform: uppercase; font-size: 0.68rem; letter-spacing: 0.08em; padding: 0.5rem 0.7rem; text-align: left; border: 1px solid #e2e8f0; font-weight: 700; }
  td { padding: 0.5rem 0.7rem; border: 1px solid #e2e8f0; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge { display: inline-block; padding: 0.15rem 0.45rem; font-size: 0.65rem; font-weight: 700; color: #fff; border-radius: 3px; }
  .url { font-size: 0.68rem; word-break: break-all; max-width: 180px; font-family: monospace; color: #64748b; }
  .mono { font-family: monospace; font-size: 0.72rem; }
  .footer { border-top: 1px solid #e2e8f0; margin-top: 2rem; padding-top: 0.75rem; color: #64748b; font-size: 0.72rem; font-family: Arial, sans-serif; }
  .empty { color: #64748b; font-style: italic; padding: 0.75rem 0; }
</style>
</head>
<body>
<div class="header">
  <h1>&#x2699; Autonomous QA Inspector Report</h1>
  <div class="target">Target: ${report.targetUrl}</div>
  <div class="meta">
    Job ID: ${report.jobId} &nbsp;|&nbsp;
    Scanned: ${fmtDate} &nbsp;|&nbsp;
    Duration: ${scanSecs}s &nbsp;|&nbsp;
    Pages: ${report.totalPages} &nbsp;|&nbsp;
    Browsers: ${browsersInfo}
  </div>
</div>

${baselineInfo}

<div class="kpi-grid">
  <div class="kpi-card total"><div class="label">Total Bugs</div><div class="value">${report.summary.totalBugs}</div></div>
  <div class="kpi-card links"><div class="label">Broken Links</div><div class="value">${report.summary.brokenLinks}</div></div>
  <div class="kpi-card ui"><div class="label">UI Issues</div><div class="value">${report.summary.uiIssues}</div></div>
  <div class="kpi-card forms"><div class="label">Form Issues</div><div class="value">${report.summary.formIssues}</div></div>
  <div class="kpi-card journeys"><div class="label">Journey Issues</div><div class="value">${report.summary.journeyIssues}</div></div>
  <div class="kpi-card health"><div class="label">Health Score</div><div class="value">${report.summary.healthScore}</div></div>
</div>

<div class="severity-bar">
  <strong style="color:#64748b;text-transform:uppercase;font-size:0.75rem">Severity:</strong>
  <div class="sev-item"><div class="sev-dot" style="background:#ef4444"></div><span>${report.summary.severityCounts.high} High</span></div>
  <div class="sev-item"><div class="sev-dot" style="background:#f59e0b"></div><span>${report.summary.severityCounts.medium} Medium</span></div>
  <div class="sev-item"><div class="sev-dot" style="background:#22c55e"></div><span>${report.summary.severityCounts.low} Low</span></div>
</div>

<section>
  <h2>All Issues (${allIssues.length})</h2>
  ${allIssues.length === 0 ? '<div class="empty">No issues found — site looks clean!</div>' : `
  <table>
    <thead><tr><th>Severity</th><th>Type</th><th>Page</th><th>Description</th><th>Selector / Browsers</th><th>Category</th></tr></thead>
    <tbody>${issueRows}</tbody>
  </table>`}
</section>

<section>
  <h2>Broken Links (${report.brokenLinks.length})</h2>
  ${report.brokenLinks.length === 0 ? '<div class="empty">No broken links found.</div>' : `
  <table>
    <thead><tr><th>Status</th><th>Type</th><th>Source Page</th><th>Link URL</th><th>Error</th></tr></thead>
    <tbody>${brokenLinkRows}</tbody>
  </table>`}
</section>

${report.journeyIssues.length > 0 ? `
<section>
  <h2>Journey Issues (${report.journeyIssues.length})</h2>
  <table>
    <thead><tr><th>Severity</th><th>Journey</th><th>Issue</th><th>Page</th><th>Description</th><th>Step</th></tr></thead>
    <tbody>${journeyRows}</tbody>
  </table>
</section>` : ''}

<section>
  <h2>Pages Scanned (${report.totalPages})</h2>
  <table>
    <thead><tr><th>URL</th><th>Status</th><th>Title</th><th>Load Time</th><th>Links</th><th>Forms</th></tr></thead>
    <tbody>${pageRows}</tbody>
  </table>
</section>

<div class="footer">Generated by Autonomous QA Inspector &mdash; ${fmtDate}</div>
</body>
</html>`;
}
