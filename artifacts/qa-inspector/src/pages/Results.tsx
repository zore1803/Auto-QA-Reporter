import { useEffect } from "react";
import { formatDuration } from "@/lib/utils";
import { SummaryCards } from "./SummaryCards";
import { BugReportTable } from "./BugReportTable";
import { ScreenshotGallery } from "./ScreenshotGallery";
import { ReportExporter } from "./ReportExporter";
import { saveCompletedScan } from "./UrlInput";
import { useGetScanReport, useGetScanScreenshots } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Globe, Image as ImageIcon, RotateCcw, Monitor, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResultsProps {
  jobId: string;
  onReset: () => void;
  onRescan: (url: string) => void;
}

const BROWSER_LABELS: Record<string, string> = {
  chromium: "Chromium",
  firefox: "Firefox",
  webkit: "WebKit",
};

export function Results({ jobId, onReset, onRescan }: ResultsProps) {
  const { data: report, isLoading: isLoadingReport, error: reportError } = useGetScanReport(jobId);
  const { data: screenshots, isLoading: isLoadingScreenshots } = useGetScanScreenshots(jobId);

  useEffect(() => {
    if (report) {
      saveCompletedScan(
        report.jobId,
        report.targetUrl,
        report.summary.totalBugs,
        report.summary.healthScore ?? 100,
      );
    }
  }, [report]);

  if (isLoadingReport) {
    return (
      <div className="w-full max-w-5xl mx-auto mt-8 space-y-8">
        <div className="h-32 border p-8 flex items-center justify-center bg-card rounded-md">
          <p className="text-muted-foreground animate-pulse">Loading results...</p>
        </div>
      </div>
    );
  }

  if (reportError || !report) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-12 p-8 border border-destructive/20 bg-destructive/5 text-center rounded-md">
        <h2 className="text-destructive font-semibold text-2xl mb-4">Error Loading Report</h2>
        <p className="text-muted-foreground mb-8">Failed to retrieve inspection report. Session may have expired.</p>
        <Button onClick={onReset} variant="outline">
          Start New Scan
        </Button>
      </div>
    );
  }

  const hasBaseline = Boolean(report.previousJobId);
  const browsers = report.browsers ?? ["chromium"];
  const isMultiBrowser = browsers.length > 1;
  const summary = report.summary;

  return (
    <div className="w-full max-w-6xl mx-auto mt-8 pb-24 text-center">
      <div className="flex flex-col items-center mb-6 pb-6 border-b border-white/5">
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-white/30">Step 3 of 3</p>
          <h1 className="text-3xl font-mono font-bold text-white tracking-widest uppercase">
            Inspection Report
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-6 font-mono text-[10px] uppercase tracking-widest text-white/40">
            <span className="flex items-center text-cyan-400 font-bold">
              <Globe className="w-3.5 h-3.5 mr-2"/> {report.targetUrl}
            </span>
            <span>{new Date(report.scannedAt).toLocaleString()}</span>
            <span>Duration: {formatDuration(report.scanDurationMs)}</span>
          </div>

          {/* Browser badges */}
          {isMultiBrowser && (
            <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-white/5">
              <span className="text-[9px] text-white/20 uppercase tracking-[0.2em]">Tested in:</span>
              <div className="flex gap-2">
                {browsers.map((b) => (
                  <span key={b} className="px-2 py-0.5 border border-white/10 bg-white/5 text-[9px] text-white/60 uppercase tracking-tighter">
                    {BROWSER_LABELS[b] ?? b}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 mt-8">
          <button
            onClick={() => onRescan(report.targetUrl)}
            className="px-6 py-2 border border-cyan-500/30 text-cyan-400 font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-cyan-500 hover:text-black transition-all shadow-[0_0_15px_rgba(6,182,212,0.1)] cyber-button"
          >
            [ Re-scan ]
          </button>
          <button 
            onClick={onReset} 
            className="px-6 py-2 border border-white/10 text-white/40 font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-white/5 hover:text-white transition-all cyber-button"
          >
            [ New Scan ]
          </button>
        </div>
      </div>

      {/* Baseline comparison bar */}
      {hasBaseline && (
        <div className="flex flex-wrap items-center gap-3 mb-6 px-4 py-3 rounded-lg border bg-muted/30 text-sm">
          <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground font-medium">
            Compared with baseline (job {report.previousJobId!.substring(0, 8)}…):
          </span>
          {summary.newIssues !== undefined && (
            <Badge className="bg-blue-500 hover:bg-blue-600 text-white">
              {summary.newIssues} New
            </Badge>
          )}
          {summary.repeatedIssues !== undefined && (
            <Badge className="bg-amber-500 hover:bg-amber-600 text-white">
              {summary.repeatedIssues} Repeated
            </Badge>
          )}
          {summary.fixedIssues !== undefined && (
            <Badge className="bg-green-500 hover:bg-green-600 text-white">
              {summary.fixedIssues} Fixed since last scan
            </Badge>
          )}
        </div>
      )}

      <SummaryCards summary={report.summary} totalPages={report.totalPages} />

      <BugReportTable report={report} />

      <div className="mt-16">
        <div className="flex items-center gap-2 mb-6">
          <ImageIcon className="w-5 h-5" />
          <h2 className="text-xl font-semibold m-0">Screenshots</h2>
        </div>
        {isLoadingScreenshots ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1,2,3].map(i => <Skeleton key={i} className="h-48 w-full bg-muted border rounded-md" />)}
          </div>
        ) : (
          <ScreenshotGallery screenshots={screenshots?.screenshots} />
        )}
      </div>

      <ReportExporter jobId={jobId} report={report} />
    </div>
  );
}
