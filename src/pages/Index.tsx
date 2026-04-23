import { useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from "recharts";
import {
  Droplets, Activity, Zap, IndianRupee, Download, Play, Loader2,
  AlertCircle, CheckCircle2, ArrowRight, Beaker, Filter, Sparkles, Recycle,
} from "lucide-react";

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

const STANDARDS = { ph: "6.5 – 8.5", turbidity: "≤ 5 NTU", tds: "≤ 500 mg/L", bod: "≤ 3 mg/L" };
const SOURCES: Source[] = ["Municipal Sewage", "Industrial Effluent", "Agricultural Runoff", "Stormwater", "Greywater"];

// Treatment cost table (₹/kL)
const STAGE_COST = { primary: 8, secondary: 18, tertiary: 35 };

const phStatusColor = (ph: number) => {
  if (ph < 6 || ph > 9) return "destructive";
  if (ph < 6.5 || ph > 8.5) return "warning";
  return "success";
};

const scoreHsl = (s: number) =>
  s < 40 ? "hsl(var(--destructive))" : s < 70 ? "hsl(var(--warning))" : "hsl(var(--success))";

// Compute "after treatment" estimates from raw inputs + active stages.
// Primary: turbidity -60%, BOD -25%, TDS -10%
// Secondary: BOD -70%, turbidity -20% (additional), TDS -15%
// Tertiary: TDS -80%, turbidity -90% (additional), BOD -50% (additional)
function computeAfter(inp: SampleInputs, stages: { primary: boolean; secondary: boolean; tertiary: boolean }) {
  let { turbidity, tds, bod } = inp;
  if (stages.primary) {
    turbidity *= 0.4;
    bod *= 0.75;
    tds *= 0.9;
  }
  if (stages.secondary) {
    turbidity *= 0.8;
    bod *= 0.3;
    tds *= 0.85;
  }
  if (stages.tertiary) {
    turbidity *= 0.1;
    bod *= 0.5;
    tds *= 0.2;
  }
  return {
    turbidity: Math.max(0.1, +turbidity.toFixed(1)),
    tds: Math.max(1, +tds.toFixed(0)),
    bod: Math.max(0.1, +bod.toFixed(1)),
  };
}

const SliderRow = ({
  icon: Icon, label, unit, value, min, max, step, onChange, indicator,
}: {
  icon: any; label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; indicator?: "destructive" | "warning" | "success";
}) => (
  <div className="space-y-2.5">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <label className="text-sm font-medium text-foreground">{label}</label>
        {indicator && (
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: `hsl(var(--${indicator}))`, boxShadow: `0 0 6px hsl(var(--${indicator}))` }}
          />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
          className="w-20 bg-secondary/60 border border-border rounded-lg px-2 py-1 text-right font-mono text-sm text-primary font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
        />
        <span className="text-xs text-muted-foreground font-mono w-12">{unit}</span>
      </div>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="aqua-range w-full"
    />
  </div>
);

const StageCard = ({
  active, idx, label, sub, icon: Icon,
}: { active: boolean; idx: number; label: string; sub: string; icon: any }) => (
  <div
    className={`relative flex-1 rounded-2xl p-4 border transition-all duration-500 ${
      active
        ? "bg-gradient-to-br from-primary/10 to-accent/5 border-primary/40 shadow-lg shadow-primary/10 scale-105"
        : "bg-secondary/40 border-border opacity-60"
    }`}
  >
    <div className="flex items-center gap-3 mb-2">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
          active ? "bg-gradient-primary text-white animate-pulse-soft" : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Stage {idx}</div>
        <div className="font-semibold text-sm text-foreground">{label}</div>
      </div>
    </div>
    <div className="text-xs text-muted-foreground">{sub}</div>
    <div className={`mt-2 inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
      active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
    }`}>
      {active ? "● ACTIVE" : "○ SKIPPED"}
    </div>
  </div>
);

const QualityRing = ({ score }: { score: number }) => {
  const r = 70;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = scoreHsl(score);
  return (
    <div className="relative w-44 h-44 animate-scale-in">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="10" />
        <circle
          cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1), stroke 0.4s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-5xl font-bold" style={{ color }}>{score}</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Quality / 100</div>
      </div>
    </div>
  );
};

const reuseStyle = (c: ReuseClass) => {
  if (c === "POTABLE") return "bg-success/10 text-success border-success/30";
  if (c === "INDUSTRIAL") return "bg-primary/10 text-primary border-primary/30";
  if (c === "IRRIGATION") return "bg-warning/10 text-warning border-warning/30";
  return "bg-destructive/10 text-destructive border-destructive/30";
};

const StatusPill = ({ s }: { s: Status }) => {
  const styles = s === "PASS"
    ? "bg-success/10 text-success"
    : s === "WARN"
    ? "bg-warning/10 text-warning"
    : "bg-destructive/10 text-destructive";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${styles}`}>
      {s === "PASS" ? "✓" : s === "WARN" ? "⚠" : "✗"} {s}
    </span>
  );
};

const Skeleton = ({ className = "" }: { className?: string }) => <div className={`skeleton ${className}`} />;

export default function Index() {
  const [inputs, setInputs] = useState<SampleInputs>({
    ph: 7.0, turbidity: 50, tds: 300, bod: 30, source: "Municipal Sewage",
  });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [chartKey, setChartKey] = useState(0);
  const reportRef = useRef<HTMLDivElement>(null);

  const update = (k: keyof SampleInputs, v: number | string) =>
    setInputs((p) => ({ ...p, [k]: v as never }));

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-water", { body: inputs });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      const result = data as Analysis;
      if (typeof result.qualityScore !== "number") throw new Error("Malformed response");
      setAnalysis(result);
      setChartKey((k) => k + 1);
      setHistory((h) => [
        { ts: Date.now(), source: inputs.source, score: result.qualityScore, reuseClass: result.reuseClass },
        ...h,
      ].slice(0, 5));
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    } catch (e: any) {
      setError(e?.message || "Failed to analyze sample");
    } finally {
      setLoading(false);
    }
  };

  const loadPreset = (k: string) => setInputs(PRESETS[k]);

  // Derived: after-values & cost data — recompute live
  const after = useMemo(() => {
    const stages = analysis?.treatmentStages ?? { primary: false, secondary: false, tertiary: false };
    return computeAfter(inputs, stages);
  }, [inputs, analysis]);

  const beforeAfterData = useMemo(() => ([
    { name: "Turbidity", before: inputs.turbidity, after: after.turbidity, unit: "NTU" },
    { name: "TDS", before: inputs.tds, after: after.tds, unit: "mg/L" },
    { name: "BOD", before: inputs.bod, after: after.bod, unit: "mg/L" },
  ]), [inputs, after]);

  const totalCost = analysis
    ? (analysis.treatmentStages.primary ? STAGE_COST.primary : 0) +
      (analysis.treatmentStages.secondary ? STAGE_COST.secondary : 0) +
      (analysis.treatmentStages.tertiary ? STAGE_COST.tertiary : 0)
    : 0;
  const maxPossibleCost = STAGE_COST.primary + STAGE_COST.secondary + STAGE_COST.tertiary;
  const costSaved = analysis ? maxPossibleCost - totalCost : 0;

  const costData = useMemo(() => ([
    { stage: "Primary", cost: STAGE_COST.primary, active: analysis?.treatmentStages.primary ?? false },
    { stage: "Secondary", cost: STAGE_COST.secondary, active: analysis?.treatmentStages.secondary ?? false },
    { stage: "Tertiary", cost: STAGE_COST.tertiary, active: analysis?.treatmentStages.tertiary ?? false },
  ]), [analysis]);

  const exportReport = () => {
    if (!analysis) return;
    const ts = new Date().toISOString();
    const text = `AQUAIQ — WATER ANALYSIS REPORT
Generated: ${ts}
================================================

INPUT
  Source:     ${inputs.source}
  pH:         ${inputs.ph}
  Turbidity:  ${inputs.turbidity} NTU  →  After: ${after.turbidity} NTU
  TDS:        ${inputs.tds} mg/L  →  After: ${after.tds} mg/L
  BOD:        ${inputs.bod} mg/L  →  After: ${after.bod} mg/L

RESULT
  Quality Score:        ${analysis.qualityScore}/100
  Reuse Classification: ${analysis.reuseClass}

TREATMENT PIPELINE
  Primary:    ${analysis.treatmentStages.primary ? "ACTIVE" : "SKIP"}
  Secondary:  ${analysis.treatmentStages.secondary ? "ACTIVE" : "SKIP"}
  Tertiary:   ${analysis.treatmentStages.tertiary ? "ACTIVE" : "SKIP"}

METRICS
  Cost:       ₹${analysis.costPerKL}/kL  (Saved: ₹${costSaved}/kL vs full treatment)
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

  const phInd = phStatusColor(inputs.ph);
  const stages = analysis?.treatmentStages;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-card/80 border-b border-border">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-white shadow-lg shadow-primary/30">
              <Droplets className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">
                Aqua<span className="bg-gradient-primary bg-clip-text text-transparent">IQ</span>
              </h1>
              <div className="text-[11px] text-muted-foreground">Smart Wastewater Treatment & Reuse Decision System</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="font-medium">System Online</span>
            </div>
            <span className="font-mono">v2.0 · IS-10500</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">
        {/* Hero / Visual Flow */}
        <section className="card-soft bg-gradient-hero p-6 animate-fade-in-up">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-foreground">Treatment Decision Dashboard</h2>
              <p className="text-sm text-muted-foreground mt-1">Real-time analysis · AI-driven recommendations · Cost-optimized pipelines</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {[
                { icon: Beaker, label: "Input", active: true },
                { icon: Filter, label: "Treatment", active: !!stages },
                { icon: Sparkles, label: "Output", active: !!analysis },
                { icon: Recycle, label: "Reuse", active: !!analysis },
              ].map((s, i, arr) => (
                <div key={s.label} className="flex items-center gap-2">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                    s.active ? "bg-card border-primary/40 text-primary shadow-sm" : "bg-card/60 border-border text-muted-foreground"
                  }`}>
                    <s.icon className="w-4 h-4" />
                    <span className="font-medium">{s.label}</span>
                  </div>
                  {i < arr.length - 1 && <ArrowRight className={`w-4 h-4 ${s.active ? "text-primary" : "text-muted-foreground/50"}`} />}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium mr-1">Quick presets:</span>
          {Object.keys(PRESETS).map((k) => (
            <button
              key={k}
              onClick={() => loadPreset(k)}
              className="px-3 py-1.5 bg-card border border-border rounded-full text-xs font-medium hover:border-primary hover:text-primary hover:shadow-md transition-all"
            >
              {k}
            </button>
          ))}
        </div>

        {/* Layout: Input (left) + Results (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* INPUT PANEL */}
          <section className="lg:col-span-4 card-soft p-6 space-y-5 animate-fade-in-up">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h2 className="font-display text-lg font-bold">Sample Input</h2>
                <p className="text-xs text-muted-foreground">Adjust parameters to analyze</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Beaker className="w-5 h-5" />
              </div>
            </div>

            <SliderRow icon={Activity} label="pH Level" unit="" value={inputs.ph}
              min={0} max={14} step={0.1} onChange={(v) => update("ph", v)} indicator={phInd} />
            <SliderRow icon={Droplets} label="Turbidity" unit="NTU" value={inputs.turbidity}
              min={0} max={500} step={1} onChange={(v) => update("turbidity", v)} />
            <SliderRow icon={Filter} label="TDS" unit="mg/L" value={inputs.tds}
              min={0} max={2000} step={1} onChange={(v) => update("tds", v)} />
            <SliderRow icon={Zap} label="BOD" unit="mg/L" value={inputs.bod}
              min={0} max={500} step={1} onChange={(v) => update("bod", v)} />

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Wastewater Source</label>
              <select
                value={inputs.source}
                onChange={(e) => update("source", e.target.value)}
                className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              >
                {SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>

            <button
              onClick={runAnalysis}
              disabled={loading}
              className="w-full bg-gradient-primary text-primary-foreground py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/30 active:scale-100 disabled:opacity-60 disabled:scale-100 transition-all glow-ring"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing sample…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Analyze Sample
                </>
              )}
            </button>
          </section>

          {/* RESULTS AREA */}
          <div className="lg:col-span-8 space-y-6" ref={reportRef}>
            {/* Treatment Pipeline */}
            <section className="card-soft p-6 animate-fade-in-up">
              <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
                <div>
                  <h2 className="font-display text-lg font-bold">Treatment Pipeline</h2>
                  <p className="text-xs text-muted-foreground">Active stages selected by AI based on sample quality</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                  <Filter className="w-5 h-5" />
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-stretch gap-3">
                <StageCard idx={1} label="Primary" sub="Solid removal & screening"
                  icon={Filter} active={stages?.primary ?? false} />
                <div className="flex items-center justify-center md:px-1">
                  <ArrowRight className={`w-5 h-5 ${stages?.secondary ? "text-primary" : "text-muted-foreground/40"}`} />
                </div>
                <StageCard idx={2} label="Secondary" sub="Biological / organic breakdown"
                  icon={Activity} active={stages?.secondary ?? false} />
                <div className="flex items-center justify-center md:px-1">
                  <ArrowRight className={`w-5 h-5 ${stages?.tertiary ? "text-primary" : "text-muted-foreground/40"}`} />
                </div>
                <StageCard idx={3} label="Tertiary" sub="RO / UV / fine filtration"
                  icon={Sparkles} active={stages?.tertiary ?? false} />
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-3 gap-3 mt-5">
                {loading ? (
                  <><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></>
                ) : (
                  <>
                    <MetricTile icon={IndianRupee} label="Cost" value={analysis ? `₹${analysis.costPerKL}` : "—"} sub="per kL" tone="primary" />
                    <MetricTile icon={Zap} label="Energy" value={analysis ? `${analysis.energyKWh}` : "—"} sub="kWh/kL" tone="warning" />
                    <MetricTile icon={CheckCircle2} label="Efficiency" value={analysis ? `${analysis.efficiencyPercent}%` : "—"} sub="removal" tone="success" />
                  </>
                )}
              </div>
            </section>

            {/* GRAPHS ROW */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Before vs After */}
              <section className="card-soft p-6 animate-fade-in-up">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display text-base font-bold">Before vs After Treatment</h3>
                    <p className="text-xs text-muted-foreground">Pollutant reduction across selected stages</p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-mono">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-destructive/70" />Before</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-success" />After</span>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%" key={chartKey}>
                    <BarChart data={beforeAfterData} barGap={8}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 12,
                          boxShadow: "var(--shadow-elevated)",
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="before" name="Before" fill="hsl(var(--destructive) / 0.7)" radius={[8, 8, 0, 0]} animationDuration={900} />
                      <Bar dataKey="after" name="After" fill="hsl(var(--success))" radius={[8, 8, 0, 0]} animationDuration={1100} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Cost vs Treatment Level */}
              <section className="card-soft p-6 animate-fade-in-up">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display text-base font-bold">Cost vs Treatment Level</h3>
                    <p className="text-xs text-muted-foreground">
                      {analysis ? (
                        <>Total: <span className="text-primary font-semibold">₹{totalCost}/kL</span> · Saved: <span className="text-success font-semibold">₹{costSaved}/kL</span></>
                      ) : "Run analysis to highlight selected path"}
                    </p>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%" key={chartKey}>
                    <BarChart data={costData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="stage" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} unit="₹" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 12,
                          boxShadow: "var(--shadow-elevated)",
                          fontSize: 12,
                        }}
                        formatter={(v: any) => [`₹${v}/kL`, "Cost"]}
                      />
                      <Bar dataKey="cost" radius={[8, 8, 0, 0]} animationDuration={900}>
                        {costData.map((d, i) => (
                          <Cell key={i} fill={d.active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.3)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary" />Selected</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/30" />Skipped</span>
                </div>
              </section>
            </div>

            {/* AI Analysis */}
            <section className="card-soft p-6 animate-fade-in-up">
              <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
                <div>
                  <h2 className="font-display text-lg font-bold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-accent" />
                    AI Quality Assessment
                  </h2>
                  <p className="text-xs text-muted-foreground">Powered by Gemini · Instant decision intelligence</p>
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3 animate-scale-in">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                    <span className="font-semibold text-destructive">Analysis Error</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{error}</p>
                  <button onClick={runAnalysis} className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:opacity-90 transition">
                    Retry analysis
                  </button>
                </div>
              )}

              {loading && !error && (
                <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start">
                  <Skeleton className="w-44 h-44 rounded-full" />
                  <div className="space-y-3 w-full">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                </div>
              )}

              {!loading && !error && !analysis && (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-hero flex items-center justify-center text-primary">
                    <Droplets className="w-8 h-8" />
                  </div>
                  <p className="text-sm text-muted-foreground">Adjust parameters and click <span className="font-semibold text-foreground">Analyze Sample</span> to begin</p>
                </div>
              )}

              {!loading && !error && analysis && (
                <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start animate-scale-in">
                  <div className="flex flex-col items-center gap-3">
                    <QualityRing score={analysis.qualityScore} />
                    <div className={`px-4 py-1.5 rounded-full border font-mono text-xs font-semibold tracking-widest ${reuseStyle(analysis.reuseClass)}`}>
                      {analysis.reuseClass}
                    </div>
                  </div>

                  <div className="space-y-4 w-full">
                    {/* Param table */}
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 bg-secondary/60 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                        <span>Parameter</span><span>Value</span><span>Standard</span><span>Status</span>
                      </div>
                      {[
                        { k: "ph", label: "pH", v: inputs.ph, std: STANDARDS.ph },
                        { k: "turbidity", label: "Turbidity", v: `${inputs.turbidity} NTU`, std: STANDARDS.turbidity },
                        { k: "tds", label: "TDS", v: `${inputs.tds} mg/L`, std: STANDARDS.tds },
                        { k: "bod", label: "BOD", v: `${inputs.bod} mg/L`, std: STANDARDS.bod },
                      ].map((row) => (
                        <div key={row.k} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 border-t border-border items-center text-sm">
                          <span className="font-medium text-foreground">{row.label}</span>
                          <span className="font-mono text-foreground">{row.v}</span>
                          <span className="font-mono text-muted-foreground text-xs">{row.std}</span>
                          <StatusPill s={analysis.parameterStatus[row.k as keyof typeof analysis.parameterStatus]} />
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">AI Report</div>
                      <div className="rounded-xl bg-gradient-hero border border-border p-4 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {analysis.narrative}
                      </div>
                    </div>

                    <button
                      onClick={exportReport}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border text-sm font-medium hover:border-primary hover:text-primary hover:shadow-md transition"
                    >
                      <Download className="w-4 h-4" />
                      Export Report (.txt)
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* History */}
        <section className="card-soft p-6 animate-fade-in-up">
          <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
            <h2 className="font-display text-lg font-bold">Analysis History</h2>
            <span className="text-xs text-muted-foreground font-mono">Last 5 runs</span>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No analyses yet — run your first sample to populate history.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold border-b border-border">
                    <th className="text-left py-2.5 font-semibold">Timestamp</th>
                    <th className="text-left py-2.5 font-semibold">Source</th>
                    <th className="text-right py-2.5 font-semibold">Score</th>
                    <th className="text-right py-2.5 font-semibold">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/40 transition">
                      <td className="py-2.5 text-muted-foreground font-mono text-xs">{new Date(h.ts).toLocaleString()}</td>
                      <td className="py-2.5">{h.source}</td>
                      <td className="py-2.5 text-right font-mono font-semibold" style={{ color: scoreHsl(h.score) }}>{h.score}</td>
                      <td className="py-2.5 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-mono font-semibold ${reuseStyle(h.reuseClass)}`}>
                          {h.reuseClass}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="text-center text-xs text-muted-foreground py-6">
          AquaIQ © 2026 — IS-10500 / CPCB Reference Standards
        </footer>
      </main>
    </div>
  );
}

function MetricTile({
  icon: Icon, label, value, sub, tone,
}: { icon: any; label: string; value: string; sub: string; tone: "primary" | "warning" | "success" }) {
  const toneClass = tone === "primary"
    ? "bg-primary/10 text-primary"
    : tone === "warning"
    ? "bg-warning/10 text-warning"
    : "bg-success/10 text-success";
  return (
    <div className="rounded-xl bg-secondary/40 border border-border p-3 hover:shadow-md transition">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${toneClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold text-foreground">{value}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{sub}</span>
      </div>
    </div>
  );
}
