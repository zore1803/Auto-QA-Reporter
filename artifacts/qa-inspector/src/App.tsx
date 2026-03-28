import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UrlInput } from "./pages/UrlInput";
import { ScanProgress } from "./pages/ScanProgress";
import { Results } from "./pages/Results";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

type AppState = "IDLE" | "SCANNING" | "RESULTS";

/* ─── Cyberpunk Grid Background ────────────────────────────────────────── */
function CyberpunkBackground() {
  return (
    <div className="fixed inset-0 -z-10 bg-[#06060a]">
      {/* Prime Grid */}
      <div 
        className="absolute inset-0 opacity-[0.05]" 
        style={{ 
          backgroundImage: `linear-gradient(rgba(0, 245, 255, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 245, 255, 0.5) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }} 
      />
      {/* Secondary Fine Grid */}
      <div 
        className="absolute inset-0 opacity-[0.02]" 
        style={{ 
          backgroundImage: `linear-gradient(rgba(0, 245, 255, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 245, 255, 0.3) 1px, transparent 1px)`,
          backgroundSize: '10px 10px'
        }} 
      />
      {/* Bottom Gradient Fade */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#06060a] via-transparent to-transparent opacity-80" />
      
      {/* Scanline Effect */}
      <div className="scanline" />
    </div>
  );
}

/* ─── Minimal Step Indicator ────────────────────────────────────────────── */
const STEPS: { id: AppState; label: string; num: number }[] = [
  { id: "IDLE", label: "Configure", num: 1 },
  { id: "SCANNING", label: "Scanning", num: 2 },
  { id: "RESULTS", label: "Results", num: 3 },
];

function StepIndicator({ current }: { current: AppState }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center gap-6 font-mono text-[10px] tracking-widest uppercase">
      {STEPS.map((step, i) => {
        const active = step.id === current;
        const done = STEPS.findIndex(s => s.id === current) > i;
        
        return (
          <div key={step.id} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`flex items-center justify-center w-5 h-5 rounded-full border ${
                active ? "bg-white text-black border-white" : 
                done ? "border-emerald-500 text-emerald-500" : "border-white/20 text-white/20"
              }`}>
                {step.num}
              </span>
              <span className={active ? "text-white font-bold" : "text-white/40"}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-8 h-[1px] bg-white/10" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main App ───────────────────────────────────────────────────────────── */
function MainApp() {
  const [appState, setAppState] = useState<AppState>("IDLE");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [rescanUrl, setRescanUrl] = useState<string | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const jobParam = params.get("jobId");
    if (jobParam) {
      setCurrentJobId(jobParam);
      setAppState("RESULTS");
    }
  }, []);

  const handleScanStarted = (jobId: string) => {
    setCurrentJobId(jobId);
    setAppState("SCANNING");
    setRescanUrl(undefined);
    window.history.pushState({}, "", `?jobId=${jobId}`);
  };

  const handleScanComplete = () => setAppState("RESULTS");

  const handleReset = () => {
    setAppState("IDLE");
    setCurrentJobId(null);
    setRescanUrl(undefined);
    window.history.pushState({}, "", window.location.pathname);
  };

  const handleCancel = () => {
    setAppState("IDLE");
    setCurrentJobId(null);
    setRescanUrl(undefined);
    window.history.pushState({}, "", window.location.pathname);
  };

  const handleRescan = (url: string) => {
    setRescanUrl(url);
    setCurrentJobId(null);
    setAppState("IDLE");
    window.history.pushState({}, "", window.location.pathname);
  };

  return (
    <>
      <CyberpunkBackground />

      <div
        className={`min-h-screen w-full flex flex-col font-sans transition-opacity duration-1000 ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* ── Navbar ── */}
        <nav className="w-full border-b border-white/5 bg-[#0a0a0f] sticky top-0 z-50">
          <div className="max-w-screen-2xl mx-auto px-8 h-12 flex items-center justify-between">
            {/* Logo */}
            <button
              onClick={handleReset}
              className="flex items-center gap-4 group focus:outline-none"
            >
              <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/20 group-hover:scale-105 transition-transform">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 16 16">
                  <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex flex-col items-start leading-none">
                <span className="text-white font-mono font-bold tracking-[0.2em] text-[13px] uppercase">
                  QA Inspector
                </span>
              </div>
            </button>

            {/* Steps */}
            <div className="hidden md:block">
              <StepIndicator current={appState} />
            </div>

            {/* Status pill */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-white/5 bg-white/5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[9px] font-mono font-bold text-white/60 uppercase tracking-widest">
                Online
              </span>
            </div>
          </div>
        </nav>

        {/* ── Main Content ── */}
        <main className="flex-grow flex flex-col w-full max-w-screen-2xl mx-auto px-8 py-10">
          {/* Header Section */}
          <div className="mb-12 text-center">
            {appState === "IDLE" && (
              <div className="space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-white/30">Step 1 of 3</p>
                <h1 className="text-3xl font-mono font-bold text-white tracking-widest uppercase">
                  Enter a URL to inspect
                </h1>
                <p className="text-white/40 text-xs font-medium">
                  We'll crawl the site and surface quality issues automatically.
                </p>
              </div>
            )}
            {appState === "SCANNING" && (
              <div className="space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-white/30">Step 2 of 3</p>
                <h1 className="text-3xl font-mono font-bold text-white tracking-widest uppercase">
                  Scanning Ecosystem
                </h1>
                <p className="text-white/40 text-xs font-medium">
                  Autonomous agents are traversing the DOM and executing parallel test suites.
                </p>
              </div>
            )}
            {appState === "RESULTS" && (
              <div className="space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-white/30">Step 3 of 3</p>
                <h1 className="text-3xl font-mono font-bold text-white tracking-widest uppercase">
                  Analysis Complete
                </h1>
                <p className="text-white/40 text-xs font-medium">
                  Review quality metrics and bug reports categorized by severity.
                </p>
              </div>
            )}
          </div>

          {/* Main Content Area (Clean, no glass) */}
          <div className="flex-grow flex flex-col min-h-0 bg-transparent">
            {appState === "IDLE" && (
              <UrlInput onScanStarted={handleScanStarted} initialUrl={rescanUrl} />
            )}
            {appState === "SCANNING" && currentJobId && (
              <ScanProgress
                jobId={currentJobId}
                onScanComplete={handleScanComplete}
                onCancel={handleCancel}
              />
            )}
            {appState === "RESULTS" && currentJobId && (
              <Results
                jobId={currentJobId}
                onReset={handleReset}
                onRescan={handleRescan}
              />
            )}
          </div>
        </main>

        {/* ── Footer ── */}
        <footer className="w-full h-14 border-t border-white/5 bg-[#0a0a0f] flex items-center">
          <div className="max-w-screen-2xl mx-auto px-8 w-full flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">
            <div className="flex items-center gap-10">
              <span>&copy; 2026 Automated Website Analysis</span>
              <span className="hidden sm:inline">Engine v4.2.0-Alpha</span>
            </div>
            <div className="flex items-center gap-8">
              <span className="cursor-pointer hover:text-white/40 transition-colors underline-offset-4 hover:underline">Documentation</span>
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/30 ring-1 ring-indigo-500/50" />
                Powered by QA Inspector
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* Advanced Global Styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) both; }
        
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        
        ::selection {
          background: rgba(99, 102, 241, 0.2);
          color: #fff;
        }
      `}</style>
    </>
  );
}

/* ─── Root ───────────────────────────────────────────────────────────────── */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MainApp />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;