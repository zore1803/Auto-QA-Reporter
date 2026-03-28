import { Layers, Link2Off, LayoutTemplate, ShieldCheck, Route } from "lucide-react";
import type { ScanSummary } from "@workspace/api-client-react";

interface SummaryCardsProps {
  summary: ScanSummary;
  totalPages: number;
}

function HealthScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-500" : score >= 50 ? "text-yellow-500" : "text-destructive";
  const label = score >= 80 ? "Good" : score >= 50 ? "Fair" : "Poor";
  return (
    <div className="flex flex-col items-center justify-center">
      <span className={`text-3xl font-mono font-bold tracking-tight ${color} neon-text`}>{score}</span>
      <span className={`text-[10px] font-mono uppercase tracking-[0.2em] mt-0.5 ${color} opacity-80`}>{label}</span>
    </div>
  );
}

export function SummaryCards({ summary, totalPages }: SummaryCardsProps) {
  const healthScore = summary.healthScore ?? 100;
  const journeyIssues = summary.journeyIssues ?? 0;

  const cards = [
    {
      title: "Health Score",
      value: null,
      icon: ShieldCheck,
      color: healthScore >= 80 ? "text-green-500" : healthScore >= 50 ? "text-yellow-500" : "text-destructive",
      custom: <HealthScoreRing score={healthScore} />,
    },
    {
      title: "Pages Scanned",
      value: totalPages,
      icon: Layers,
      color: "text-foreground",
      custom: null,
    },
    {
      title: "Broken Links",
      value: summary.brokenLinks,
      icon: Link2Off,
      color: summary.brokenLinks > 0 ? "text-destructive" : "text-foreground",
      custom: null,
    },
    {
      title: "UI / Form Issues",
      value: summary.uiIssues + summary.formIssues,
      icon: LayoutTemplate,
      color: (summary.uiIssues + summary.formIssues) > 0 ? "text-warning" : "text-foreground",
      custom: null,
    },
    ...(journeyIssues > 0 ? [{
      title: "Journey Issues",
      value: journeyIssues,
      icon: Route,
      color: journeyIssues > 0 ? "text-cyan-600" : "text-foreground",
      custom: null,
    }] : []),
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      {cards.map((card) => (
        <div key={card.title} className="cyber-card p-6 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">{card.title}</p>
                {card.custom ? (
                  card.custom
                ) : (
                  <p className={`text-3xl font-mono font-bold tracking-tight ${card.color} neon-text`}>
                    {card.value}
                  </p>
                )}
              </div>
              <div className="p-2 bg-white/5 border border-white/5 rounded">
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </div>
        </div>
      ))}
    </div>
  );
}
