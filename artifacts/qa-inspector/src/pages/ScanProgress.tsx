import { useEffect } from "react";
import { CheckSquare, Square, RefreshCcw, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGetScanStatus, useCancelScan } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface ScanProgressProps {
  jobId: string;
  onScanComplete: () => void;
  onCancel: () => void;
}

export function ScanProgress({ jobId, onScanComplete, onCancel }: ScanProgressProps) {
  const { data: status } = useGetScanStatus(jobId, {
    query: {
      queryKey: ["getScanStatus", jobId],
      refetchInterval: (query) => {
        const state = query.state.data?.status;
        return state === "completed" || state === "failed" ? false : 2000;
      },
    },
  });

  const cancelMutation = useCancelScan({
    mutation: {
      onSuccess: () => {
        onCancel();
      },
    },
  });

  useEffect(() => {
    if (status?.status === "completed") {
      const timer = setTimeout(() => {
        onScanComplete();
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status?.status, onScanComplete]);

  const progress = status?.progress || 0;
  const steps = status?.steps || [
    { name: "crawling", label: "Crawling Pages", status: "pending" as const },
    { name: "links", label: "Checking Links", status: "pending" as const },
    { name: "ui", label: "UI Inspection", status: "pending" as const },
    { name: "forms", label: "Form Testing", status: "pending" as const },
    { name: "report", label: "Generating Report", status: "pending" as const },
  ];

  if (status?.status === 'failed') {
    const isCancelled = status.error === 'Scan cancelled by user';
    return (
      <div className="w-full max-w-2xl mx-auto mt-12">
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-6 text-destructive flex flex-col items-center justify-center text-center">
            {isCancelled ? (
              <XCircle className="w-10 h-10 mb-4" />
            ) : (
              <AlertTriangle className="w-10 h-10 mb-4" />
            )}
            <h3 className="font-semibold text-lg mb-2">
              {isCancelled ? 'Scan Cancelled' : 'Scan Failed'}
            </h3>
            <p className="text-sm">{status.error || "An unknown error occurred during the scan."}</p>
            <Button variant="outline" className="mt-6" onClick={onCancel}>
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-12 animate-fade-in flex flex-col">
      {/* ── Scanning Header ── */}
      <div className="mb-10 space-y-1 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-cyan-500/50">Step 2 of 3</p>
        <h2 className="text-2xl font-mono font-bold text-white tracking-widest uppercase flex items-center justify-center gap-3">
          Scanning Ecosystem
          <RefreshCcw className="w-4 h-4 text-cyan-500 animate-spin" />
        </h2>
        <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest truncate">
          Target: {status?.currentUrl || "Initializing targets..."}
        </p>
      </div>

      <Card className="bg-[#0a0a0f] border-white/10 rounded-none shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden">
        <CardContent className="p-0">
          {/* Main Progress Bar Area */}
          <div className="p-8 space-y-8 border-b border-white/5">
            <div className="space-y-4">
              <div className="flex justify-between items-end font-mono">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/30">
                    Process Status
                  </p>
                  <p className="text-sm font-bold text-white uppercase tracking-widest">
                    {status?.currentStep || "Initializing"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-cyan-400 tabular-nums">
                    {Math.round(progress)}%
                  </p>
                </div>
              </div>
              
              <div className="h-6 w-full bg-black border border-white/10 p-1">
                <div 
                  className="h-full bg-cyan-500 transition-all duration-700 ease-out shadow-[0_0_20px_rgba(6,182,212,0.6)] animate-pulse"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>

            {/* Steps Grid (Cyberpunk List) */}
            <div className="grid grid-cols-1 gap-2">
              {steps.map((step, idx) => {
                const isActive = step.status === "running";
                const isDone = step.status === "completed";
                const isFailed = step.status === "failed";
                
                return (
                  <div key={idx} className={cn(
                    "flex items-center justify-between p-3 border border-white/5 bg-white/[0.02] transition-opacity",
                    isActive ? "opacity-100 border-cyan-500/30" : "opacity-30"
                  )}>
                    <div className="flex items-center gap-3">
                       <div className={cn(
                        "w-4 h-4 flex items-center justify-center border",
                        isDone ? "bg-emerald-500 border-emerald-500" : 
                        isActive ? "bg-cyan-500/20 border-cyan-500 animate-pulse" :
                        isFailed ? "bg-rose-500 border-rose-500" :
                        "border-white/20"
                      )}>
                        {isDone && <CheckSquare className="w-3 h-3 text-black" />}
                        {isActive && <div className="w-1.5 h-1.5 bg-cyan-500" />}
                        {isFailed && <XCircle className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white">
                        {step.label}
                      </span>
                    </div>
                    <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-white/40">
                      {isDone ? "[ Verified ]" : isActive ? "> Running" : "[ In Queue ]"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity Terminal (Raw style) */}
          <div className="bg-black p-6 font-mono text-[9px] uppercase tracking-widest leading-relaxed">
            <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-2 text-cyan-500/60">
              <span className="animate-pulse">&gt;</span>
              <span>Autonomous Activity Stream</span>
            </div>
            <div className="space-y-1.5 max-h-[140px] overflow-auto scrollbar-hide">
              <p className="text-white/20 italic">[$] System initialized. Loading test suites...</p>
              <p className="text-cyan-500/40">&gt; Spawning engine nodes (Chromium v130.x)</p>
              <p className="text-white/30">&gt; Inspecting {status?.currentUrl || "Targets"}...</p>
              {progress > 20 && <p className="text-emerald-500/50">&gt; SUCCESS: DOM snapshot captured</p>}
              {progress > 50 && <p className="text-cyan-500/50">&gt; RUNNING: Cross-browser verification</p>}
              {progress > 80 && <p className="text-amber-500/50">&gt; ANALYZING: Processing issue classifications</p>}
              {status?.status === 'running' && <p className="text-white animate-pulse">_</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 flex justify-center">
        <button
          className="px-6 py-2 border border-rose-500/30 text-rose-500/50 font-mono text-[10px] uppercase tracking-[0.3em] transition-all cyber-button-danger"
          onClick={() => cancelMutation.mutate({ jobId })}
          disabled={cancelMutation.isPending}
        >
          {cancelMutation.isPending ? '[ Aborting... ]' : '[ Abort Session ]'}
        </button>
      </div>
    </div>
  );
}
