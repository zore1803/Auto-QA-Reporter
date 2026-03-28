export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';
export type Severity = 'Low' | 'Medium' | 'High';
export type IssueStatus = 'new' | 'repeated' | 'fixed';
export type BrowserName = 'chromium' | 'firefox' | 'webkit';

export interface ScanStep {
  name: string;
  status: StepStatus;
  label: string;
}

export interface BrokenLink {
  sourcePage: string;
  linkUrl: string;
  statusCode: number;
  statusType: string;
  error?: string;
  impact?: string;
  recommendation?: string;
  aiCategory?: string;
  aiConfidence?: number;
  issueStatus?: IssueStatus;
  occurrences?: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UIIssue {
  page: string;
  severity: Severity;
  issueType: string;
  description: string;
  impact?: string;
  recommendation?: string;
  selector?: string;
  boundingBox?: BoundingBox;
  aiCategory?: string;
  aiConfidence?: number;
  issueStatus?: IssueStatus;
  occurrences?: number;
  browsers?: BrowserName[];
}

export interface FormIssue {
  page: string;
  formSelector: string;
  issueType: string;
  description: string;
  impact?: string;
  recommendation?: string;
  severity: Severity;
  aiCategory?: string;
  aiConfidence?: number;
  issueStatus?: IssueStatus;
  occurrences?: number;
}

export interface JourneyIssue {
  journeyType: 'login' | 'signup' | 'search' | 'checkout' | 'contact' | 'generic';
  page: string;
  severity: Severity;
  issueType: string;
  description: string;
  step?: string;
  recommendation?: string;
  selector?: string;
}

export interface JourneyResult {
  journeyType: string;
  page: string;
  stepsCompleted: string[];
  issues: JourneyIssue[];
}

export interface PageScanned {
  url: string;
  title?: string;
  statusCode: number;
  screenshotFile?: string;
  loadTimeMs?: number;
  linksFound?: number;
  formsFound?: number;
}

export interface ScanSummary {
  totalBugs: number;
  brokenLinks: number;
  uiIssues: number;
  formIssues: number;
  journeyIssues: number;
  healthScore: number;
  severityCounts: {
    high: number;
    medium: number;
    low: number;
  };
  newIssues?: number;
  fixedIssues?: number;
  repeatedIssues?: number;
}

export interface ScanReport {
  jobId: string;
  targetUrl: string;
  scannedAt: string;
  totalPages: number;
  scanDurationMs: number;
  summary: ScanSummary;
  brokenLinks: BrokenLink[];
  uiIssues: UIIssue[];
  formIssues: FormIssue[];
  journeyIssues: JourneyIssue[];
  journeyResults?: JourneyResult[];
  pagesScanned: PageScanned[];
  browsers: BrowserName[];
  previousJobId?: string;
}

export interface ScanJob {
  jobId: string;
  url: string;
  maxPages: number;
  enableAI: boolean;
  browsers: BrowserName[];
  runJourneys: boolean;
  status: ScanStatus;
  progress: number;
  currentStep: string;
  currentUrl?: string;
  steps: ScanStep[];
  error?: string;
  startedAt: string;
  completedAt?: string;
  report?: ScanReport;
  screenshotsDir?: string;
  cancelled?: boolean;
}
