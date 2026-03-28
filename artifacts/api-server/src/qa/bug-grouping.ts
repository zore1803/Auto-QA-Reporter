import type { BrokenLink, UIIssue, FormIssue, BrowserName } from './types.js';

function uiKey(issue: UIIssue): string {
  return `${issue.issueType}::${issue.page}`;
}

function formKey(issue: FormIssue): string {
  return `${issue.issueType}::${issue.page}::${issue.formSelector}`;
}

function linkKey(link: BrokenLink): string {
  return link.linkUrl;
}

/**
 * Collapse duplicate broken links (same URL) into one entry,
 * incrementing occurrences and keeping the first sourcePage seen.
 */
export function deduplicateBrokenLinks(links: BrokenLink[]): BrokenLink[] {
  const map = new Map<string, BrokenLink>();
  for (const link of links) {
    const key = linkKey(link);
    const existing = map.get(key);
    if (existing) {
      existing.occurrences = (existing.occurrences ?? 1) + 1;
    } else {
      map.set(key, { ...link, occurrences: 1 });
    }
  }
  return Array.from(map.values());
}

/**
 * Collapse duplicate UI issues (same issueType + page) into one,
 * merging the browsers array so cross-browser occurrences are visible.
 */
export function deduplicateUIIssues(issues: UIIssue[]): UIIssue[] {
  const map = new Map<string, UIIssue>();
  for (const issue of issues) {
    const key = uiKey(issue);
    const existing = map.get(key);
    if (existing) {
      existing.occurrences = (existing.occurrences ?? 1) + 1;
      if (issue.browsers?.length) {
        const merged = new Set<BrowserName>([...(existing.browsers ?? []), ...issue.browsers]);
        existing.browsers = Array.from(merged);
      }
    } else {
      map.set(key, { ...issue, occurrences: 1 });
    }
  }
  return Array.from(map.values());
}

/**
 * Collapse duplicate form issues (same issueType + page + form selector).
 */
export function deduplicateFormIssues(issues: FormIssue[]): FormIssue[] {
  const map = new Map<string, FormIssue>();
  for (const issue of issues) {
    const key = formKey(issue);
    const existing = map.get(key);
    if (existing) {
      existing.occurrences = (existing.occurrences ?? 1) + 1;
    } else {
      map.set(key, { ...issue, occurrences: 1 });
    }
  }
  return Array.from(map.values());
}
