import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type Source = "Municipal Sewage" | "Industrial Effluent" | "Agricultural Runoff" | "Stormwater" | "Greywater";
type Status = "PASS" | "WARN" | "FAIL";
type ReuseClass = "POTABLE" | "INDUSTRIAL" | "IRRIGATION" | "RESTRICTED";

interface Analysis {
  qualityScore: number;
  reuseClass: ReuseClass;
  treatmentStages: { primary: boolean; secondary: boolean; tertiary: boolean };
  costPerKL: number;
  energyKWh: number;
  efficiencyPercent: number;
  parameterStatus: { ph: Status; turbidity: Status; tds: Status; bod: Status };
  narrative: string;
}

interface SampleInputs {
  ph: number;
  turbidity: number;
  tds: number;
  bod: number;
  source: Source;
}

interface HistoryEntry {
  ts: number;
  source: Source;
  score: number;
  reuseClass: ReuseClass;
}

const PRESETS: Record<string, SampleInputs> = {
  "Severely Polluted": { ph: 5.2, turbidity: 380, tds: 1650, bod: 320, source: "Industrial Effluent" },
  "Industrial Effluent": { ph: 8.7, turbidity: 180, tds: 1200, bod: 180, source: "Industrial Effluent" },
  "Greywater": { ph: 7.2, turbidity: 60, tds: 450, bod: 80, source: "Greywater" },
  "Near Clean": { ph: 7.4, turbidity: 8, tds: 220, bod: 5, source: "Municipal Sewage" },
};

const STANDARDS = {
  ph: "6.5 – 8.5",
  turbidity: "≤ 5 NTU",
  tds: "≤ 500 mg/L",
  bod: "≤ 3 mg/L",
};

const SOURCES: Source[] = ["Municipal Sewage", "Industrial Effluent", "Agricultural Runoff", "Stormwater", "Greywater"];

const phColor = (ph: number) => {
  if (ph < 6 || ph > 9) return "destructive";
  if (ph < 6.5 || ph > 8.5) return "warning";
  return "success";
};

const scoreColor = (s: number) => (s < 40 ? "hsl(var(--destructive))" : s < 70 ? "hsl(var(--warning))" : "hsl(var(--success))");

const StatusIcon = ({ s }: { s: Status }) => {
  if (s === "PASS") return <span className="text-success font-mono">✓</span>;
  if (s === "WARN") return <span className="text-warning font-mono">⚠</span>;
  return <span className="text-destructive font-mono">✗</span>;
};

const SliderRow = ({
  label, unit, value, min, max, step, onChange, indicator,
}: {
  label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; indicator?: "destructive" | "warning" | "success";
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        {indicator && (
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: `hsl(var(--${indicator}))`, boxShadow: `0 0 6px hsl(var(--${indicator}))` }}
          />
        )}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
          className="w-20 bg-input border border-border px-2 py-1 text-right font-mono text-sm text-primary focus:outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground font-mono w-10">{unit}</span>
      </div>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="aqua-range w-full"
    />
    <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
      <span>{min}</span>
      <span>{max}</span>
    </div>
  </div>
);

const PipelineStage = ({
  label, sub, active, idx,
}: { label: string; sub: string; active: boolean; idx: number }) => (
  <div
    className={`relative panel p-4 transition-all ${active ? "border-primary animate-pulse-ring" : "opacity-40"}`}
  >
    <div className="flex items-center gap-3">
      <div
        className={`w-8 h-8 flex items-center justify-center font-mono text-sm border ${
          active ? "border-primary text-primary" : "border-border text-muted-foreground"
        }`}
      >
        {idx}
      </div>
      <div className="flex-1">
        <div className={`text-sm font-bold uppercase tracking-wider ${active ? "text-foreground" : "text-muted-foreground"}`}>
          {label}
        </div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{sub}</div>
      </div>
      <div className={`text-[10px] font-mono px-2 py-1 border ${active ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
        {active ? "ACTIVE" : "SKIP"}
      </div>
    </div>
  </div>
);

const Arrow = ({ active, vertical = true }: { active: boolean; vertical?: boolean }) => (
  <div className={`flex items-center justify-center ${vertical ? "h-6" : "w-6"}`}>
    <div
      className={`relative ${vertical ? "w-0.5 h-full" : "h-0.5 w-full"} overflow-hidden ${
        active ? "bg-primary/30" : "bg-border"
      }`}
    >
      {active && (
        <div
          className={`absolute ${vertical ? "left-0 right-0 h-3 bg-primary animate-flow" : "top-0 bottom-0 w-3 bg-primary"}`}
          style={!vertical ? { animation: "flow 1.5s linear infinite" } : {}}
        />
      )}
    </div>
  </div>
);

const QualityRing = ({ score }: { score: number }) => {
  const r = 70;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = scoreColor(score);
  return (
    <div className="relative w-44 h-44">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
        <circle
          cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease, stroke 0.4s", filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono text-4xl font-bold" style={{ color }}>{score}</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Quality / 100</div>
      </div>
    </div>
  );
};

const reuseBadgeColor = (c: ReuseClass) => {
  if (c === "POTABLE") return "success";
  if (c === "INDUSTRIAL") return "primary";
  if (c === "IRRIGATION") return "warning";
  return "destructive";
};

const MetricCard = ({ label, value, unit }: { label: string; value: string; unit: string }) => (
  <div className="panel p-3">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="flex items-baseline gap-1 mt-1">
      <span className="font-mono text-2xl text-primary font-bold">{value}</span>
      <span className="font-mono text-[10px] text-muted-foreground">{unit}</span>
    </div>
  </div>
);

const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`skeleton ${className}`} />
);

export default function Index() {
  const [inputs, setInputs] = useState<SampleInputs>({
    ph: 7.0, turbidity: 50, tds: 300, bod: 30, source: "Municipal Sewage",
  });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const reportRef = useRef<HTMLDivElement>(null);

  const update = (k: keyof SampleInputs, v: number | string) =>
    setInputs((p) => ({ ...p, [k]: v as never }));

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-water", {
        body: inputs,
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      const result = data as Analysis;
      if (typeof result.qualityScore !== "number") throw new Error("Malformed response");
      setAnalysis(result);
      setHistory((h) => [
        { ts: Date.now(), source: inputs.source, score: result.qualityScore, reuseClass: result.reuseClass },
        ...h,
      ].slice(0, 5));
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    } catch (e: any) {
      setError(e?.message || "Failed to analyze sample");
    } finally {
      setLoading(false);
    }
  };

  const loadPreset = (k: string) => setInputs(PRESETS[k]);

  const exportReport = () => {
    if (!analysis) return;
    const ts = new Date().toISOString();
    const text = `AQUAIQ — WATER ANALYSIS REPORT
Generated: ${ts}
================================================

INPUT
  Source:     ${inputs.source}
  pH:         ${inputs.ph}
  Turbidity:  ${inputs.turbidity} NTU
  TDS:        ${inputs.tds} mg/L
  BOD:        ${inputs.bod} mg/L

RESULT
  Quality Score:        ${analysis.qualityScore}/100
  Reuse Classification: ${analysis.reuseClass}

TREATMENT PIPELINE
  Primary:    ${analysis.treatmentStages.primary ? "ACTIVE" : "SKIP"}
  Secondary:  ${analysis.treatmentStages.secondary ? "ACTIVE" : "SKIP"}
  Tertiary:   ${analysis.treatmentStages.tertiary ? "ACTIVE" : "SKIP"}

METRICS
  Cost:       ₹${analysis.costPerKL}/kL
  Energy:     ${analysis.energyKWh} kWh/kL
  Efficiency: ${analysis.efficiencyPercent}%

PARAMETER STATUS (vs Indian Standards)
  pH:         ${analysis.parameterStatus.ph}   (std: ${STANDARDS.ph})
  Turbidity:  ${analysis.parameterStatus.turbidity}   (std: ${STANDARDS.turbidity})
  TDS:        ${analysis.parameterStatus.tds}   (std: ${STANDARDS.tds})
  BOD:        ${analysis.parameterStatus.bod}   (std: ${STANDARDS.bod})

AI ANALYSIS
${analysis.narrative}
`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aquaiq-report-${ts.replace(/[:.]/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const phInd = phColor(inputs.ph);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 border border-primary flex items-center justify-center text-primary glow">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2 L18 12 a6 6 0 1 1 -12 0 Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wider">AQUA<span className="text-primary">IQ</span></h1>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Wastewater Treatment & Reuse Decision System</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              SYS_ONLINE
            </div>
            <div>v1.0 / IS-10500</div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mr-2">Presets:</span>
          {Object.keys(PRESETS).map((k) => (
            <button
              key={k}
              onClick={() => loadPreset(k)}
              className="px-3 py-1.5 border border-border bg-secondary hover:border-primary hover:text-primary text-xs uppercase tracking-wider transition-colors"
            >
              {k}
            </button>
          ))}
        </div>

        {/* 3-panel layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Panel 1: Input */}
          <section className="panel p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold uppercase tracking-widest">Water Sample Input</h2>
              <span className="font-mono text-[10px] text-muted-foreground">P-01</span>
            </div>

            <SliderRow
              label="pH Level" unit="" value={inputs.ph}
              min={0} max={14} step={0.1}
              onChange={(v) => update("ph", v)}
              indicator={phInd}
            />
            <SliderRow
              label="Turbidity" unit="NTU" value={inputs.turbidity}
              min={0} max={500} step={1}
              onChange={(v) => update("turbidity", v)}
            />
            <SliderRow
              label="TDS" unit="mg/L" value={inputs.tds}
              min={0} max={2000} step={1}
              onChange={(v) => update("tds", v)}
            />
            <SliderRow
              label="BOD" unit="mg/L" value={inputs.bod}
              min={0} max={500} step={1}
              onChange={(v) => update("bod", v)}
            />

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Wastewater Source</label>
              <select
                value={inputs.source}
                onChange={(e) => update("source", e.target.value)}
                className="w-full bg-input border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary"
              >
                {SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>

            <button
              onClick={runAnalysis}
              disabled={loading}
              className="w-full bg-primary text-primary-foreground py-3 font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity glow"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Analyzing
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                    <path d="M12 2 L18 12 a6 6 0 1 1 -12 0 Z" />
                  </svg>
                  Analyze Sample
                </>
              )}
            </button>
          </section>

          {/* Panel 2: Pipeline */}
          <section className="panel p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold uppercase tracking-widest">Treatment Pipeline</h2>
              <span className="font-mono text-[10px] text-muted-foreground">P-02</span>
            </div>

            {/* Vertical on desktop, horizontal on mobile */}
            <div className="flex flex-row md:flex-col lg:flex-col gap-0 md:gap-0">
              <div className="flex flex-col md:flex-row lg:flex-col items-stretch w-full">
                <div className="flex-1">
                  <PipelineStage
                    idx={1} label="Primary" sub="Solid Removal"
                    active={analysis?.treatmentStages.primary ?? false}
                  />
                </div>
                <Arrow active={analysis?.treatmentStages.primary ?? false} />
                <div className="flex-1">
                  <PipelineStage
                    idx={2} label="Secondary" sub="Biological / Organic"
                    active={analysis?.treatmentStages.secondary ?? false}
                  />
                </div>
                <Arrow active={analysis?.treatmentStages.secondary ?? false} />
                <div className="flex-1">
                  <PipelineStage
                    idx={3} label="Tertiary" sub="RO / Filtration / UV"
                    active={analysis?.treatmentStages.tertiary ?? false}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              {loading ? (
                <>
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </>
              ) : (
                <>
                  <MetricCard label="Cost" value={analysis ? `₹${analysis.costPerKL}` : "—"} unit="/kL" />
                  <MetricCard label="Energy" value={analysis ? `${analysis.energyKWh}` : "—"} unit="kWh/kL" />
                  <MetricCard label="Efficiency" value={analysis ? `${analysis.efficiencyPercent}` : "—"} unit="%" />
                </>
              )}
            </div>
          </section>

          {/* Panel 3: AI Analysis */}
          <section className="panel p-5 space-y-5" ref={reportRef}>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold uppercase tracking-widest">AI Analysis</h2>
              <span className="font-mono text-[10px] text-muted-foreground">P-03</span>
            </div>

            {error && (
              <div className="border border-destructive bg-destructive/10 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-destructive font-mono">✗</span>
                  <span className="text-sm font-bold uppercase tracking-wider text-destructive">Analysis Error</span>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{error}</p>
                <button
                  onClick={runAnalysis}
                  className="px-3 py-1.5 border border-destructive text-destructive text-xs uppercase tracking-wider hover:bg-destructive hover:text-destructive-foreground transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {loading && !error && (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <Skeleton className="w-44 h-44 rounded-full" />
                </div>
                <Skeleton className="h-6 w-32 mx-auto" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}

            {!loading && !error && !analysis && (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="w-16 h-16 border border-border flex items-center justify-center text-muted-foreground">
                  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2 L18 12 a6 6 0 1 1 -12 0 Z" />
                  </svg>
                </div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Awaiting sample analysis</p>
              </div>
            )}

            {!loading && !error && analysis && (
              <>
                <div className="flex flex-col items-center gap-3">
                  <QualityRing score={analysis.qualityScore} />
                  <div
                    className="px-4 py-1.5 border font-mono text-xs uppercase tracking-widest"
                    style={{
                      color: `hsl(var(--${reuseBadgeColor(analysis.reuseClass)}))`,
                      borderColor: `hsl(var(--${reuseBadgeColor(analysis.reuseClass)}))`,
                      boxShadow: `0 0 12px hsl(var(--${reuseBadgeColor(analysis.reuseClass)}) / 0.4)`,
                    }}
                  >
                    {analysis.reuseClass}
                  </div>
                </div>

                <div className="border border-border">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 border-b border-border bg-secondary text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
                    <span>Param</span><span>Value</span><span>Std</span><span>Status</span>
                  </div>
                  {[
                    { k: "ph", label: "pH", v: inputs.ph, std: STANDARDS.ph },
                    { k: "turbidity", label: "Turbidity", v: `${inputs.turbidity} NTU`, std: STANDARDS.turbidity },
                    { k: "tds", label: "TDS", v: `${inputs.tds} mg/L`, std: STANDARDS.tds },
                    { k: "bod", label: "BOD", v: `${inputs.bod} mg/L`, std: STANDARDS.bod },
                  ].map((row) => (
                    <div key={row.k} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 border-b border-border last:border-0 items-center text-xs">
                      <span className="uppercase tracking-wider text-muted-foreground">{row.label}</span>
                      <span className="font-mono text-foreground">{row.v}</span>
                      <span className="font-mono text-muted-foreground text-[10px]">{row.std}</span>
                      <StatusIcon s={analysis.parameterStatus[row.k as keyof typeof analysis.parameterStatus]} />
                    </div>
                  ))}
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-mono">// AI Report</div>
                  <div className="border-l-2 border-primary pl-3 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap font-mono">
                    {analysis.narrative}
                  </div>
                </div>

                <button
                  onClick={exportReport}
                  className="w-full border border-border bg-secondary py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
                >
                  ↓ Export Report (.txt)
                </button>
              </>
            )}
          </section>
        </div>

        {/* History */}
        <section className="panel p-5">
          <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
            <h2 className="text-sm font-bold uppercase tracking-widest">Analysis History</h2>
            <span className="font-mono text-[10px] text-muted-foreground">LAST 5</span>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground font-mono py-4">// No analyses yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono border-b border-border">
                    <th className="text-left py-2 font-normal">Timestamp</th>
                    <th className="text-left py-2 font-normal">Source</th>
                    <th className="text-right py-2 font-normal">Score</th>
                    <th className="text-right py-2 font-normal">Class</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {history.map((h, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-2 text-muted-foreground">{new Date(h.ts).toLocaleString()}</td>
                      <td className="py-2">{h.source}</td>
                      <td className="py-2 text-right" style={{ color: scoreColor(h.score) }}>{h.score}</td>
                      <td className="py-2 text-right" style={{ color: `hsl(var(--${reuseBadgeColor(h.reuseClass)}))` }}>
                        {h.reuseClass}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="text-center text-[10px] uppercase tracking-widest text-muted-foreground font-mono py-4">
          AquaIQ © 2026 — IS-10500 / CPCB Reference Standards
        </footer>
      </main>
    </div>
  );
}
