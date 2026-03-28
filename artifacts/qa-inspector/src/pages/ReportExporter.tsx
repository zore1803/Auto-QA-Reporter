import { Copy, Check, FileJson, FileCode, FileText, Loader2, Download, ChevronDown } from "lucide-react";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import type { ScanReport } from "@workspace/api-client-react";

interface ReportExporterProps {
  jobId: string;
  report: ScanReport;
}

export function ReportExporter({ jobId, report }: ReportExporterProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `qa_report_${jobId}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast({ title: "Downloaded", description: "JSON report saved." });
  };

  const handleDownloadHTML = () => {
    window.open(`/api/scan/${jobId}/export/html`, '_blank');
    toast({ title: "Opened", description: "HTML report opened in new tab." });
  };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    toast({ title: "Generating PDF", description: "This may take a few seconds..." });

    try {
      const response = await fetch(`/api/scan/${jobId}/export/pdf`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Failed to generate PDF');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qa-report-${jobId.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "PDF Downloaded", description: "Report saved as PDF." });
    } catch (err) {
      toast({
        title: "PDF Export Failed",
        description: err instanceof Error ? err.message : "Could not generate PDF.",
        variant: "destructive",
      });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?jobId=${jobId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link Copied", description: "Share link copied to clipboard." });
  };

  return (
    <div className="flex items-center gap-3 mt-12 pt-8 border-t border-white/10">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="gap-2 cyber-button"
            disabled={pdfLoading}
          >
            {pdfLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {pdfLoading ? "Generating PDF…" : "Export"}
            {!pdfLoading && <ChevronDown className="w-3 h-3 opacity-60" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
        >
          <DropdownMenuItem onClick={handleDownloadPDF} className="gap-2 cursor-pointer">
            <FileText className="w-4 h-4" />
            Export as PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadHTML} className="gap-2 cursor-pointer">
            <FileCode className="w-4 h-4" />
            Export as HTML
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDownloadJSON} className="gap-2 cursor-pointer">
            <FileJson className="w-4 h-4" />
            Export as JSON
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button onClick={handleCopyLink} variant="secondary" className="gap-2 ml-auto cyber-button">
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        Copy Link
      </Button>
    </div>
  );
}
