import { useState, useRef, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Droplets, Activity, Zap, IndianRupee, Download, Play, Loader2,
  AlertCircle, CheckCircle2, ArrowRight, Beaker, Filter, Sparkles, Recycle,
  ChevronDown, FlaskConical, Waves, Bug, Atom,
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
const SOURCES: { id: Source; icon: any; label: string }[] = [
  { id: "Municipal Sewage", icon: Droplets, label: "Municipal" },
  { id: "Industrial Effluent", icon: FlaskConical, label: "Industrial" },
  { id: "Agricultural Runoff", icon: Waves, label: "Agriculture" },
  { id: "Stormwater", icon: Recycle, label: "Stormwater" },
  { id: "Greywater", icon: Filter, label: "Greywater" },
];

const STAGE_COST = { primary: 8, secondary: 18, tertiary: 35 };

type Tone = "success" | "warning" | "destructive";
const phStatus = (ph: number): Tone => {
  if (ph < 6 || ph > 9) return "destructive";
  if (ph < 6.5 || ph > 8.5) return "warning";
  return "success";
};
const turbidityStatus = (v: number): Tone => (v <= 5 ? "success" : v <= 50 ? "warning" : "destructive");
const tdsStatus = (v: number): Tone => (v <= 500 ? "success" : v <= 1000 ? "warning" : "destructive");
const bodStatus = (v: number): Tone => (v <= 3 ? "success" : v <= 30 ? "warning" : "destructive");

const toneToStatus = (t: Tone): Status => (t === "success" ? "PASS" : t === "warning" ? "WARN" : "FAIL");
const toneClass = (t: Tone) =>
  t === "success" ? "text-success bg-success/15"
  : t === "warning" ? "text-warning bg-warning/15"
  : "text-destructive bg-destructive/15";
const toneSlider = (t: Tone) => (t === "warning" ? "tone-warn" : t === "destructive" ? "tone-fail" : "");

const scoreColor = (s: number) =>
  s < 40 ? "hsl(var(--destructive))" : s < 70 ? "hsl(var(--warning))" : "hsl(var(--primary))";

function computeAfter(inp: SampleInputs, stages: { primary: boolean; secondary: boolean; tertiary: boolean }) {
  let { turbidity, tds, bod } = inp;
  if (stages.primary) { turbidity *= 0.4; bod *= 0.75; tds *= 0.9; }
  if (stages.secondary) { turbidity *= 0.8; bod *= 0.3; tds *= 0.85; }
  if (stages.tertiary) { turbidity *= 0.1; bod *= 0.5; tds *= 0.2; }
  return {
    turbidity: Math.max(0.1, +turbidity.toFixed(1)),
    tds: Math.max(1, +tds.toFixed(0)),
    bod: Math.max(0.1, +bod.toFixed(1)),
  };
}

// Composite contamination index 0–100 from inputs
function contaminationIndex(inp: SampleInputs): number {
  const tw = Math.min(inp.turbidity / 400, 1);
  const tdw = Math.min(inp.tds / 2000, 1);
  const bw = Math.min(inp.bod / 400, 1);
  const ph = Math.min(Math.abs(inp.ph - 7.5) / 4, 1);
  return Math.round((tw * 0.3 + tdw * 0.25 + bw * 0.35 + ph * 0.1) * 100);
}
const indexLabel = (i: number) =>
  i < 20 ? "CLEAN" : i < 40 ? "LOW" : i < 60 ? "MODERATE" : i < 80 ? "HIGH" : "CRITICAL";
const indexColor = (i: number) =>
  i < 40 ? "hsl(var(--success))" : i < 70 ? "hsl(var(--warning))" : "hsl(var(--destructive))";

// Inline SVG droplet logo
const DropletLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M12 2.5 L5.5 11.5 C3 15.5 5.5 21 12 21 C18.5 21 21 15.5 18.5 11.5 Z" fill="currentColor" fillOpacity="0.15" />
  </svg>
);

const SliderRow = ({
  icon: Icon, label, unit, value, min, max, step, onChange, tone, limit,
}: {
  icon: any; label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; tone: Tone; limit: string;
}) => {
  const status = toneToStatus(tone);
  return (
    <div className={`instrument-card p-4 ${tone !== "success" ? "is-active" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-[13px] text-muted-foreground">{label}</span>
        </div>
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-wide ${toneClass(tone)}`}>
          {status}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`aqua-range w-full ${toneSlider(tone)}`}
      />
      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-baseline gap-1">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
            className="w-20 bg-transparent border-0 p-0 font-mono text-[15px] font-bold text-foreground focus:outline-none focus:ring-0"
          />
          <span className="text-[11px] text-muted-foreground font-mono">{unit}</span>
        </div>
        <span className="text-[11px] font-mono" style={{ color: "hsl(var(--text-muted))" }}>Limit: {limit}</span>
      </div>
    </div>
  );
};

// Vertical pipeline stage node
const StageNode = ({ active, label, sub, idx, expanded, onToggle, detail }: {
  active: boolean; label: string; sub: string; idx: number;
  expanded: boolean; onToggle: () => void; detail: string;
}) => (
  <div className="relative flex gap-4">
    {/* Node */}
    <div className="relative z-10 flex flex-col items-center">
      <div className={`w-14 h-14 rounded-full border flex items-center justify-center transition-all duration-500 ${
        active
          ? "bg-elevated border-emphasis"
          : "bg-elevated border-default opacity-40 grayscale"
      }`}
        style={active ? { boxShadow: "0 0 0 8px hsl(var(--primary) / 0.1), 0 0 0 16px hsl(var(--primary) / 0.05)" } : {}}
      >
        <span className="font-display text-lg font-bold" style={{ color: active ? "hsl(var(--primary))" : "hsl(var(--text-muted))" }}>
          {idx}
        </span>
        {active && (
          <svg className="absolute inset-0 animate-spin-slow" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="27" fill="none" stroke="hsl(var(--primary))" strokeWidth="1" strokeDasharray="4 6" opacity="0.6" />
          </svg>
        )}
      </div>
    </div>
    {/* Card */}
    <div className={`flex-1 rounded-2xl border transition-all ${
      active ? "bg-surface border-emphasis" : "bg-surface/60 border-subtle opacity-60"
    }`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 text-left">
        <div>
          <div className="font-display text-[15px] font-semibold text-foreground">{label}</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">{sub}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-mono tracking-wider ${active ? "text-primary" : "text-muted-foreground"}`}>
            {active ? "● ACTIVE" : "○ SKIPPED"}
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 -mt-1 text-[12px] leading-relaxed text-muted-foreground border-t border-subtle pt-3">
          {detail}
        </div>
      )}
    </div>
  </div>
);

// Animated count-up
function useCountUp(target: number, duration = 600) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    let raf: number;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

const QualityRing = ({ score }: { score: number }) => {
  const r = 60;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = scoreColor(score);
  const animated = Math.round(useCountUp(score, 800));
  return (
    <div className="relative w-[140px] h-[140px]">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(var(--bg-elevated))" strokeWidth="8" />
        <circle
          cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1), stroke 0.4s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-baseline">
          <span className="font-display text-[36px] font-bold leading-none" style={{ color }}>{animated}</span>
          <span className="text-[14px] text-muted-foreground ml-0.5">/ 100</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">Quality Index</div>
      </div>
    </div>
  );
};

const reuseStyle = (c: ReuseClass) => {
  if (c === "POTABLE") return "bg-primary/15 text-primary border-primary/35";
  if (c === "INDUSTRIAL") return "bg-accent/15 text-accent border-accent/35";
  if (c === "IRRIGATION") return "bg-warning/15 text-warning border-warning/35";
  return "bg-destructive/15 text-destructive border-destructive/35";
};

const StatusBadge = ({ s }: { s: Status }) => {
  const t: Tone = s === "PASS" ? "success" : s === "WARN" ? "warning" : "destructive";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-wide ${toneClass(t)}`}>
      {s}
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
  const [now, setNow] = useState(new Date());
  const [expandedStage, setExpandedStage] = useState<number | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const phT = phStatus(inputs.ph);
  const turbT = turbidityStatus(inputs.turbidity);
  const tdsT = tdsStatus(inputs.tds);
  const bodT = bodStatus(inputs.bod);
  const stages = analysis?.treatmentStages;
  const cIndex = contaminationIndex(inputs);
  const animatedIndex = useCountUp(cIndex, 400);

  // Live metric count-ups
  const costAnim = Math.round(useCountUp(analysis?.costPerKL ?? 0, 600));
  const energyAnim = useCountUp(analysis?.energyKWh ?? 0, 600);
  const effAnim = Math.round(useCountUp(analysis?.efficiencyPercent ?? 0, 600));

  const istTime = now.toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" });

  return (
    <div className="min-h-screen bg-base">
      {/* Header */}
      <header className="sticky top-0 z-30 h-[60px] border-b border-subtle backdrop-blur-xl"
        style={{ background: "hsl(var(--bg-base) / 0.85)" }}>
        <div className="max-w-[1600px] mx-auto h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-primary"
              style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.25)" }}>
              <DropletLogo />
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-lg font-bold tracking-tight text-foreground">AquaIQ</h1>
              <span className="text-muted-foreground text-sm">/</span>
              <span className="text-[13px] text-muted-foreground">Smart Treatment System</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-sonar" />
              <span className="text-[11px] text-success font-medium">System Online</span>
            </div>
            <span className="px-2 py-1 rounded-md text-[10px] font-mono font-bold border border-default text-muted-foreground">v2.0</span>
            <span className="font-mono text-[12px] text-muted-foreground tabular-nums">{istTime} IST</span>
          </div>
        </div>
      </header>

      {/* Hero breadcrumb */}
      <div className="border-b border-subtle bg-surface/40">
        <div className="max-w-[1600px] mx-auto h-10 px-6 flex items-center gap-3 text-[11px] font-mono uppercase tracking-wider">
          {[
            { icon: Beaker, label: "Input", active: true },
            { icon: Filter, label: "Treatment", active: !!stages },
            { icon: Sparkles, label: "Output", active: !!analysis },
            { icon: Recycle, label: "Reuse", active: !!analysis },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 ${s.active ? "text-primary" : "text-muted-foreground"}`}>
                <s.icon className="w-3 h-3" />
                <span>{s.label}</span>
              </div>
              {i < arr.length - 1 && <span className="w-8 h-px bg-default" />}
            </div>
          ))}
        </div>
      </div>

      {/* Quick presets */}
      <div className="border-b border-subtle">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-1 overflow-x-auto whitespace-nowrap">
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mr-3">Presets:</span>
          {Object.keys(PRESETS).map((k) => (
            <button
              key={k}
              onClick={() => loadPreset(k)}
              className="group relative px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              {k}
              <span className="absolute left-3 right-3 -bottom-0.5 h-px bg-primary scale-x-0 group-hover:scale-x-100 origin-left transition-transform" />
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-6 py-5">
        {/* 3-column grid: 320 / 1fr / 380 */}
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_380px] gap-5">

          {/* LEFT: Sample Input */}
          <section className="panel p-5 space-y-4 animate-fade-in-up" style={{ animationDelay: "0ms" }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-[18px] font-semibold text-foreground">Sample Input</h2>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-live" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-destructive">Live</span>
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Adjust parameters · IS-10500 reference</p>
              </div>
            </div>

            {/* Contamination meter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Contamination Index</span>
                <span className="font-display text-[13px] font-bold tracking-wider" style={{ color: indexColor(cIndex) }}>
                  {indexLabel(cIndex)}
                </span>
              </div>
              <div className="relative h-12 rounded-xl overflow-hidden border border-subtle"
                style={{
                  background: "linear-gradient(90deg, hsl(var(--success)) 0%, hsl(var(--warning)) 50%, hsl(var(--destructive)) 100%)",
                }}>
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-foreground"
                  style={{
                    left: `${animatedIndex}%`,
                    transition: "left 0.4s ease",
                    boxShadow: "0 0 8px hsl(var(--foreground) / 0.5)",
                  }}
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0"
                    style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "6px solid hsl(var(--foreground))" }} />
                </div>
              </div>
            </div>

            {/* Parameter cards */}
            <div className="space-y-3">
              <SliderRow icon={FlaskConical} label="pH Level" unit="" value={inputs.ph}
                min={0} max={14} step={0.1} onChange={(v) => update("ph", v)} tone={phT} limit="6.5–8.5" />
              <SliderRow icon={Atom} label="Turbidity" unit="NTU" value={inputs.turbidity}
                min={0} max={500} step={1} onChange={(v) => update("turbidity", v)} tone={turbT} limit="5 NTU" />
              <SliderRow icon={Droplets} label="TDS" unit="mg/L" value={inputs.tds}
                min={0} max={2000} step={1} onChange={(v) => update("tds", v)} tone={tdsT} limit="500 mg/L" />
              <SliderRow icon={Bug} label="BOD" unit="mg/L" value={inputs.bod}
                min={0} max={500} step={1} onChange={(v) => update("bod", v)} tone={bodT} limit="3 mg/L" />
            </div>

            {/* Source selector */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Source Type</span>
              <div className="grid grid-cols-3 gap-2">
                {SOURCES.map((s) => {
                  const sel = inputs.source === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => update("source", s.id)}
                      className={`flex flex-col items-center justify-center gap-1 h-14 rounded-xl border transition-all ${
                        sel
                          ? "bg-primary/8 border-primary"
                          : "bg-surface border-subtle hover:-translate-y-0.5 hover:border-default"
                      }`}
                      style={sel ? { background: "hsl(var(--primary) / 0.08)", borderColor: "hsl(var(--primary))" } : {}}
                    >
                      <s.icon className={`w-4 h-4 ${sel ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-[10px] font-medium ${sel ? "text-primary" : "text-muted-foreground"}`}>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Analyze button */}
            <button
              onClick={runAnalysis}
              disabled={loading}
              className="relative w-full h-[52px] rounded-xl font-display font-semibold text-[15px] overflow-hidden transition-all hover:shadow-glow-teal disabled:opacity-90"
              style={{ background: "hsl(var(--primary))", color: "hsl(var(--bg-base))" }}
            >
              <span className="relative z-10 inline-flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                {loading ? "Scanning sample…" : "Analyze Sample"}
              </span>
              {loading && (
                <span className="absolute inset-0 overflow-hidden">
                  <span className="absolute inset-y-0 w-1/3 animate-scan-sweep"
                    style={{ background: "linear-gradient(90deg, transparent, hsl(var(--bg-base) / 0.35), transparent)" }} />
                </span>
              )}
            </button>
          </section>

          {/* CENTER: Pipeline + metrics + charts */}
          <div className="space-y-5" ref={reportRef}>
            <section className="panel p-5 animate-fade-in-up" style={{ animationDelay: "80ms" }}>
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="font-display text-[18px] font-semibold text-foreground">Treatment Pipeline</h2>
                  <p className="text-[11px] text-muted-foreground mt-1">AI-selected stages · Minimum necessary treatment</p>
                </div>
              </div>

              {/* Vertical pipeline */}
              <div className="relative pl-0">
                {/* Vertical line */}
                <div className="absolute left-7 top-7 bottom-7 w-1 rounded-full" style={{ background: "hsl(0 0% 100% / 0.1)" }} />
                {/* Flow dots between active stages */}
                {stages?.primary && stages?.secondary && (
                  <div className="absolute left-[26px] top-[60px] w-2 h-2 rounded-full bg-primary animate-flow-down"
                    style={{ animationDelay: "0s" }} />
                )}
                {stages?.secondary && stages?.tertiary && (
                  <div className="absolute left-[26px] top-[160px] w-2 h-2 rounded-full bg-primary animate-flow-down"
                    style={{ animationDelay: "0.5s" }} />
                )}

                <div className="space-y-4">
                  <StageNode idx={1} label="Primary Treatment" sub="Screening · Sedimentation · Grit removal"
                    detail="Removes large solids, grit, oils, and floatable debris through bar screens and settling tanks. Reduces turbidity by ~60% and BOD by ~25%."
                    active={stages?.primary ?? false}
                    expanded={expandedStage === 1} onToggle={() => setExpandedStage(expandedStage === 1 ? null : 1)} />
                  <StageNode idx={2} label="Secondary Treatment" sub="Activated sludge · Biological breakdown"
                    detail="Microorganisms degrade dissolved organic matter in aeration tanks, followed by clarification. Targets BOD reduction up to 70% and additional turbidity removal."
                    active={stages?.secondary ?? false}
                    expanded={expandedStage === 2} onToggle={() => setExpandedStage(expandedStage === 2 ? null : 2)} />
                  <StageNode idx={3} label="Tertiary Treatment" sub="RO · UV disinfection · Fine filtration"
                    detail="Reverse osmosis removes dissolved solids, UV disinfects pathogens, and activated carbon polishes residual contaminants. Achieves up to 80% TDS reduction."
                    active={stages?.tertiary ?? false}
                    expanded={expandedStage === 3} onToggle={() => setExpandedStage(expandedStage === 3 ? null : 3)} />
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3 mt-5">
                {loading ? (
                  <><Skeleton className="h-[88px]" /><Skeleton className="h-[88px]" /><Skeleton className="h-[88px]" /></>
                ) : (
                  <>
                    <MetricTile icon={IndianRupee} label="Cost" value={analysis ? `₹${costAnim}` : "—"} sub="per kL" />
                    <MetricTile icon={Zap} label="Energy" value={analysis ? energyAnim.toFixed(2) : "—"} sub="kWh/kL" />
                    <MetricTile icon={CheckCircle2} label="Efficiency" value={analysis ? `${effAnim}%` : "—"} sub="removal" />
                  </>
                )}
              </div>
            </section>

            {/* Charts */}
            <section className="panel p-5 animate-fade-in-up" style={{ animationDelay: "160ms" }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-[15px] font-semibold text-foreground">Before vs After Treatment</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Pollutant reduction across selected stages</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(var(--destructive) / 0.7)" }} />Before</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary" />After</span>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%" key={chartKey}>
                  <BarChart data={beforeAfterData} barGap={6}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 100% / 0.06)" vertical={false} />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={{ stroke: "hsl(0 0% 100% / 0.06)" }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(0 0% 100% / 0.03)" }}
                      contentStyle={{
                        background: "hsl(var(--bg-overlay))",
                        border: "1px solid hsl(0 0% 100% / 0.1)",
                        borderRadius: 12,
                        boxShadow: "var(--shadow-elevated)",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="before" name="Before" fill="hsl(var(--destructive) / 0.75)" radius={[6, 6, 0, 0]} animationDuration={900} />
                    <Bar dataKey="after" name="After" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} animationDuration={1100} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel p-5 animate-fade-in-up" style={{ animationDelay: "240ms" }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-[15px] font-semibold text-foreground">Cost vs Treatment Level</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {analysis
                      ? <>Total: <span className="text-primary font-semibold font-mono">₹{totalCost}/kL</span> · Saved: <span className="text-success font-semibold font-mono">₹{costSaved}/kL</span></>
                      : "Run analysis to highlight selected path"}
                  </p>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%" key={chartKey}>
                  <BarChart data={costData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 100% / 0.06)" vertical={false} />
                    <XAxis dataKey="stage" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={{ stroke: "hsl(0 0% 100% / 0.06)" }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(0 0% 100% / 0.03)" }}
                      contentStyle={{
                        background: "hsl(var(--bg-overlay))",
                        border: "1px solid hsl(0 0% 100% / 0.1)",
                        borderRadius: 12,
                        boxShadow: "var(--shadow-elevated)",
                        fontSize: 12,
                      }}
                      formatter={(v: any) => [`₹${v}/kL`, "Cost"]}
                    />
                    <Bar dataKey="cost" radius={[6, 6, 0, 0]} animationDuration={900}>
                      {costData.map((d, i) => (
                        <Cell key={i} fill={d.active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.25)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* RIGHT: AI Assessment */}
          <section className="panel p-5 space-y-5 animate-fade-in-up" style={{ animationDelay: "120ms" }}>
            <div>
              <h2 className="font-display text-[18px] font-semibold text-foreground">AI Assessment</h2>
              <p className="text-[11px] text-muted-foreground mt-1">Quality scoring · Reuse classification</p>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3 animate-shake">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  <span className="font-display font-semibold text-destructive text-[13px]">Analysis Error</span>
                </div>
                <p className="text-[12px] text-muted-foreground">{error}</p>
                <button onClick={runAnalysis}
                  className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-[11px] font-mono font-bold hover:opacity-90 transition">
                  RETRY
                </button>
              </div>
            )}

            {loading && !error && (
              <div className="space-y-4">
                <div className="flex justify-center"><Skeleton className="w-[140px] h-[140px] rounded-full" /></div>
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}

            {!loading && !error && !analysis && (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-elevated flex items-center justify-center text-primary">
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="text-[12px] text-muted-foreground max-w-[240px]">
                  Adjust parameters and click <span className="text-foreground font-semibold">Analyze Sample</span> to begin
                </p>
              </div>
            )}

            {!loading && !error && analysis && (
              <div className="space-y-5 animate-scale-in">
                <div className="flex flex-col items-center gap-4">
                  <QualityRing score={analysis.qualityScore} />
                  <div className={`px-4 h-9 inline-flex items-center rounded-full border font-display font-semibold text-[12px] tracking-widest ${reuseStyle(analysis.reuseClass)}`}>
                    ✦ {analysis.reuseClass}
                  </div>
                </div>

                {/* Param table */}
                <div>
                  <div className="text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Parameter Status</div>
                  <div className="rounded-xl bg-surface border border-subtle overflow-hidden">
                    {[
                      { k: "ph" as const, label: "pH", v: String(inputs.ph), std: STANDARDS.ph, t: phT },
                      { k: "turbidity" as const, label: "Turbidity", v: `${inputs.turbidity}`, std: STANDARDS.turbidity, t: turbT },
                      { k: "tds" as const, label: "TDS", v: `${inputs.tds}`, std: STANDARDS.tds, t: tdsT },
                      { k: "bod" as const, label: "BOD", v: `${inputs.bod}`, std: STANDARDS.bod, t: bodT },
                    ].map((row, i, arr) => {
                      const colorVar = row.t === "success" ? "var(--success)" : row.t === "warning" ? "var(--warning)" : "var(--destructive)";
                      return (
                        <div key={row.k}
                          className={`grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2.5 hover:bg-elevated transition-colors ${i < arr.length - 1 ? "border-b border-subtle" : ""}`}>
                          <div>
                            <div className="text-[13px] text-foreground">{row.label}</div>
                            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">std {row.std}</div>
                          </div>
                          <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: `hsl(${colorVar})` }}>{row.v}</span>
                          <StatusBadge s={analysis.parameterStatus[row.k]} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* AI Report */}
                <div>
                  <div className="text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">AI Report</div>
                  <div className="rounded-r-xl p-5 text-[13px] leading-[1.8] text-muted-foreground"
                    style={{ background: "hsl(var(--accent) / 0.05)", borderLeft: "3px solid hsl(var(--accent))" }}>
                    <div className="whitespace-pre-wrap">{analysis.narrative}</div>
                    <div className="mt-3 pt-3 border-t border-subtle flex items-center justify-end gap-1.5 text-[10px] font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                      <Sparkles className="w-3 h-3" />
                      Generated by Gemini · AquaIQ AI
                    </div>
                  </div>
                </div>

                <button
                  onClick={exportReport}
                  className="group w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-transparent border border-default text-[12px] font-display font-medium text-muted-foreground hover:border-primary hover:text-foreground transition-all"
                >
                  <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                  Export Report
                </button>
              </div>
            )}
          </section>
        </div>

        {/* History */}
        <section className="panel p-5 mt-5 animate-fade-in-up" style={{ animationDelay: "320ms" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-[16px] font-semibold text-foreground">Analysis History</h2>
            <span className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">Last 5 runs</span>
          </div>
          {history.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-6 text-center">No analyses yet — run your first sample to populate history.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[10px] font-display font-semibold uppercase tracking-[0.15em] text-muted-foreground border-b border-subtle">
                    <th className="text-left py-2">Timestamp</th>
                    <th className="text-left py-2">Source</th>
                    <th className="text-right py-2">Score</th>
                    <th className="text-right py-2">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i} className={`h-12 transition-colors hover:bg-elevated ${i % 2 === 0 ? "bg-surface" : ""}`}>
                      <td className="py-2 px-2 text-muted-foreground font-mono text-[11px]">{new Date(h.ts).toLocaleString()}</td>
                      <td className="py-2 px-2 text-foreground">{h.source}</td>
                      <td className="py-2 px-2 text-right">
                        <span className="relative inline-block px-2 font-mono font-bold tabular-nums" style={{ color: scoreColor(h.score) }}>
                          <span className="absolute inset-0 rounded opacity-15" style={{ background: scoreColor(h.score), width: `${h.score}%` }} />
                          <span className="relative">{h.score}</span>
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold ${reuseStyle(h.reuseClass)}`}>
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

        <footer className="text-center text-[11px] font-mono uppercase tracking-wider py-6" style={{ color: "hsl(var(--text-muted))" }}>
          AquaIQ © 2026 · IS-10500 / CPCB Reference
        </footer>
      </main>
    </div>
  );
}

function MetricTile({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string; }) {
  return (
    <div className="rounded-xl bg-elevated border border-subtle p-3 hover:border-default transition-colors">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-display font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-mono text-[28px] font-bold text-foreground leading-none tabular-nums">{value}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{sub}</span>
      </div>
    </div>
  );
}
