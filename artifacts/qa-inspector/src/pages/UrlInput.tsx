import { useState, useEffect } from "react";
import { Globe, SlidersHorizontal, BrainCircuit, History, ExternalLink, Trash2, Zap, Monitor, Route, RefreshCcw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useStartScan } from "@workspace/api-client-react";
import type { BrowserName } from "@workspace/api-client-react";

interface UrlInputProps {
  onScanStarted: (jobId: string) => void;
  initialUrl?: string;
}

interface ScanHistoryItem {
  jobId: string;
  url: string;
  scannedAt: string;
  totalBugs: number;
  healthScore: number;
}

const HISTORY_KEY = "qa-inspector-history";
const MAX_HISTORY = 8;

function loadHistory(): ScanHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToHistory(item: ScanHistoryItem) {
  try {
    const history = loadHistory().filter(h => h.jobId !== item.jobId);
    const updated = [item, ...history].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}

export function saveCompletedScan(jobId: string, url: string, totalBugs: number, healthScore: number) {
  saveToHistory({
    jobId,
    url,
    scannedAt: new Date().toISOString(),
    totalBugs,
    healthScore,
  });
}

const DEMO_JOB_ID = "394d6243-302a-4f69-b303-fc56118c7012";
const DEMO_URL = "https://books.toscrape.com/";

const ALL_BROWSERS: { id: BrowserName; label: string; description: string }[] = [
  { id: "chromium", label: "Chromium", description: "Always included" },
  { id: "firefox", label: "Firefox", description: "Gecko engine" },
  { id: "webkit", label: "WebKit", description: "Safari engine" },
];

const DEVICE_PRESETS: { label: string; value: string; group: string; resolution: string }[] = [
  { label: "Desktop (Default)", value: "", group: "Desktop", resolution: "1280×800" },
  { label: "iPhone 14", value: "iPhone 14", group: "Phone", resolution: "390×844" },
  { label: "iPhone 14 Pro Max", value: "iPhone 14 Pro Max", group: "Phone", resolution: "430×932" },
  { label: "iPhone 13", value: "iPhone 13", group: "Phone", resolution: "390×844" },
  { label: "iPhone 12", value: "iPhone 12", group: "Phone", resolution: "390×844" },
  { label: "iPhone SE", value: "iPhone SE", group: "Phone", resolution: "375×667" },
  { label: "Pixel 7", value: "Pixel 7", group: "Phone", resolution: "412×915" },
  { label: "Pixel 5", value: "Pixel 5", group: "Phone", resolution: "393×851" },
  { label: "Galaxy S9+", value: "Galaxy S9+", group: "Phone", resolution: "320×658" },
  { label: "Galaxy S8", value: "Galaxy S8", group: "Phone", resolution: "360×740" },
  { label: "iPad Pro 11", value: "iPad Pro 11", group: "Tablet", resolution: "834×1194" },
  { label: "iPad Mini", value: "iPad Mini", group: "Tablet", resolution: "768×1024" },
  { label: "iPad (gen 7)", value: "iPad (gen 7)", group: "Tablet", resolution: "810×1080" },
];

export function UrlInput({ onScanStarted, initialUrl }: UrlInputProps) {
  const [url, setUrl] = useState(initialUrl || "https://example.com");
  const [maxPages, setMaxPages] = useState(10);
  const [enableAI, setEnableAI] = useState(false);
  const [runJourneys, setRunJourneys] = useState(false);
  const [selectedBrowsers, setSelectedBrowsers] = useState<BrowserName[]>(["chromium"]);
  const [history, setHistory] = useState<ScanHistoryItem[]>(() => loadHistory());
  const [selectedDevice, setSelectedDevice] = useState("");
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
    }
  }, [initialUrl]);

  const startScanMutation = useStartScan({
    mutation: {
      onSuccess: (data) => {
        onScanStarted(data.jobId);
      }
    }
  });

  const toggleBrowser = (browser: BrowserName) => {
    setSelectedBrowsers(prev => {
      if (browser === "chromium") return prev; // Chromium always stays
      if (prev.includes(browser)) {
        return prev.filter(b => b !== browser);
      }
      return [...prev, browser];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    startScanMutation.mutate({
      data: {
        url,
        maxPages,
        enableAI,
        browsers: selectedBrowsers,
        device: selectedDevice || undefined,
        runJourneys,
      }
    });
  };

  const handleDeleteHistory = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter(h => h.jobId !== jobId);
    setHistory(updated);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } catch {}
  };

  const handleClearAll = () => {
    clearHistory();
    setHistory([]);
  };

  const healthColor = (score: number) =>
    score >= 80 ? "text-green-500" : score >= 50 ? "text-yellow-500" : "text-destructive";

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8 animate-fade-in">
      {/* ── Demo Banner (Cyberpunk style) ── */}
      <div
        className="mb-8 relative overflow-hidden rounded border border-cyan-500/30 bg-cyan-500/5 p-4 hover:border-cyan-500/60 transition-all cursor-pointer group"
        onClick={() => onScanStarted(DEMO_JOB_ID)}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded border border-cyan-500/30 flex items-center justify-center bg-cyan-500/10">
              <Zap className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-cyan-400 font-mono text-sm font-bold uppercase tracking-wider">Try the live demo</h3>
              <p className="text-white/40 text-[10px] mt-0.5 font-mono uppercase tracking-widest">
                {DEMO_URL} — 324 issues found
              </p>
            </div>
          </div>
          <button
            className="px-4 py-1.5 border border-cyan-500/50 text-cyan-400 font-mono text-[10px] uppercase tracking-widest hover:bg-cyan-500 hover:text-black transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onScanStarted(DEMO_JOB_ID);
            }}
          >
            View Report
          </button>
        </div>
      </div>

      <Card className="bg-[#0a0a0f] border-white/10 rounded-none shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        <CardContent className="p-10 space-y-8">
          <div className="text-center space-y-2 mb-8">
            <h2 className="text-2xl font-mono font-bold text-white tracking-[0.3em] uppercase">QA Inspector</h2>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">Automated website analysis</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/30 ml-1 font-mono">
                Website URL
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Globe className="w-4 h-4 text-cyan-500/50 group-focus-within:text-cyan-500 transition-colors" />
                </div>
                <Input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  required
                  className="pl-12 h-12 bg-black/40 border-white/10 text-white placeholder:text-white/10 rounded-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all font-mono text-sm group-hover:border-cyan-500/30"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-white/30 font-mono">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Max Pages</span>
                </label>
                <span className="text-cyan-400 font-mono font-bold text-xs bg-cyan-500/10 px-2 py-0.5 border border-cyan-500/20">
                  {maxPages} pages
                </span>
              </div>
              <Slider
                min={5}
                max={50}
                step={5}
                value={[maxPages]}
                onValueChange={(v) => setMaxPages(v[0])}
                className="py-2"
              />
            </div>

            {/* Browsers Selection */}
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-white/30 px-1 font-mono">
                <Monitor className="w-3.5 h-3.5" />
                <span>Browsers</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {ALL_BROWSERS.map((b) => {
                  const selected = selectedBrowsers.includes(b.id);
                  return (
                    <div key={b.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={b.id} 
                        checked={selected}
                        onCheckedChange={() => toggleBrowser(b.id)}
                        disabled={b.id ==='chromium'}
                        className="border-white/20 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                      />
                      <label htmlFor={b.id} className="text-[10px] font-mono uppercase tracking-wider text-white/60 cursor-pointer">
                        {b.label}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Device Emulation Selector */}
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-white/30 px-1 font-mono">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Device Emulation</span>
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDeviceDropdownOpen(!deviceDropdownOpen)}
                  className="w-full flex items-center justify-between h-11 px-4 bg-black/40 border border-white/10 hover:border-cyan-500/30 text-white font-mono text-xs transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-4 h-4 text-cyan-500/60" />
                    <span className="text-white/80">
                      {selectedDevice || "Desktop (Default)"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-cyan-400/60 uppercase tracking-widest">
                      {DEVICE_PRESETS.find(d => d.value === selectedDevice)?.resolution || "1280×800"}
                    </span>
                    <svg className={`w-3 h-3 text-white/30 transition-transform ${deviceDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </button>

                {deviceDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto bg-[#0a0a14] border border-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.1)]">
                    {["Desktop", "Phone", "Tablet"].map(group => {
                      const devices = DEVICE_PRESETS.filter(d => d.group === group);
                      return (
                        <div key={group}>
                          <div className="px-3 py-1.5 text-[8px] font-mono uppercase tracking-[0.3em] text-cyan-500/50 bg-cyan-500/5 border-b border-white/5">
                            {group}
                          </div>
                          {devices.map(d => (
                            <button
                              key={d.value}
                              type="button"
                              onClick={() => {
                                setSelectedDevice(d.value);
                                setDeviceDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-mono transition-all hover:bg-cyan-500/10 ${
                                selectedDevice === d.value
                                  ? 'bg-cyan-500/15 text-cyan-400 border-l-2 border-cyan-500'
                                  : 'text-white/60 border-l-2 border-transparent'
                              }`}
                            >
                              <span>{d.label}</span>
                              <span className="text-[9px] text-white/20">{d.resolution}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center justify-between p-4 border border-white/5 bg-white/[0.02]">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/60">Journey Testing</p>
                  <p className="text-[9px] text-white/20 uppercase tracking-tighter">Detect flows</p>
                </div>
                <Switch checked={runJourneys} onCheckedChange={setRunJourneys} className="data-[state=checked]:bg-cyan-500" />
              </div>
              <div className="flex items-center justify-between p-4 border border-white/5 bg-white/[0.02]">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/60">AI Classification</p>
                  <p className="text-[9px] text-white/20 uppercase tracking-tighter">Smart Analysis</p>
                </div>
                <Switch checked={enableAI} onCheckedChange={setEnableAI} className="data-[state=checked]:bg-cyan-500" />
              </div>
            </div>

            <div className="pt-4">
              <Button
                type="submit"
                className="w-full h-12 bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs uppercase tracking-[0.3em] rounded-none shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all cyber-button"
                disabled={startScanMutation.isPending}
              >
                {startScanMutation.isPending ? (
                  <div className="flex items-center gap-3">
                    <RefreshCcw className="w-4 h-4 animate-spin" />
                    <span>Spinning up agents...</span>
                  </div>
                ) : (
                  <span>Start Scan</span>
                )}
              </Button>
              {startScanMutation.isError && (
                <p className="text-rose-400 text-[10px] font-bold uppercase tracking-widest mt-4 text-center">
                  {(startScanMutation.error as any)?.payload?.error || 'System Breach: Failed to initialize scan'}
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-[0.2em] text-white/30">
              <History className="w-3.5 h-3.5" />
              <span>Recent Records</span>
            </div>
            <button 
              className="text-[9px] font-mono uppercase tracking-widest text-white/20 hover:text-cyan-400 transition-colors" 
              onClick={handleClearAll}
            >
              [ Wipe History ]
            </button>
          </div>
          <div className="space-y-2">
            {history.map((item) => (
              <div
                key={item.jobId}
                className="group flex items-center justify-between p-4 border border-white/5 bg-[#0a0a0f] hover:border-cyan-500/30 transition-all cyber-card"
              >
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setUrl(item.url)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono font-bold text-white tracking-wider truncate block">
                      {item.url}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 font-mono text-[9px] uppercase tracking-widest">
                    <span className="text-white/20">
                      {new Date(item.scannedAt).toLocaleDateString()}
                    </span>
                    <span className="text-white/40">{item.totalBugs} issues detected</span>
                    <span className={item.healthScore >= 80 ? "text-emerald-500" : "text-amber-500"}>
                      Score: {item.healthScore}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    className="p-2 border border-white/10 hover:border-cyan-500/50 text-white/40 hover:text-cyan-400 transition-all"
                    title="View report"
                    onClick={() => {
                      window.history.pushState({}, '', `?jobId=${item.jobId}`);
                      window.location.reload();
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-2 border border-white/10 hover:border-rose-500/50 text-white/40 hover:text-rose-500 transition-all"
                    title="Remove"
                    onClick={(e) => handleDeleteHistory(item.jobId, e)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
