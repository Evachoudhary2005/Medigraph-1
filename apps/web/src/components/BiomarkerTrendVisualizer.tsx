"use client";
import { useState, useMemo } from "react";

export type BiomarkerPoint = {
  date: string;
  value?: number;
  systolic?: number;
  diastolic?: number;
  status: string;
  notes?: string;
};

export type BiomarkerCategory = {
  id: string;
  title_en: string;
  title_hi: string;
  unit: string;
  icon: string;
  points: BiomarkerPoint[];
  latest: string;
  baseline: string;
  delta: string;
  trajectory: "rising" | "falling" | "stable" | "fluctuating";
  alert_level: "urgent" | "caution" | "controlled" | "optimal";
  reference: {
    optimal_max: number;
    caution_max: number;
    danger_min: number;
    label_en: string;
    label_hi: string;
  };
  interpretation_en: string;
  interpretation_hi: string;
  recommendation_en: string;
  recommendation_hi: string;
};

type Props = {
  categories: BiomarkerCategory[];
  lang?: "en" | "hi";
  patientId?: string;
};

export default function BiomarkerTrendVisualizer({
  categories,
  lang = "en",
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(
    categories[0]?.id || "blood_pressure"
  );
  const [hoveredPoint, setHoveredPoint] = useState<{
    index: number;
    x: number;
    y: number;
    data: BiomarkerPoint;
    type?: "systolic" | "diastolic" | "single";
  } | null>(null);

  const activeCategory = useMemo(() => {
    return (
      categories.find((c) => c.id === selectedId) ||
      categories[0] ||
      null
    );
  }, [categories, selectedId]);

  if (!activeCategory || activeCategory.points.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-slate-400">
        <span className="text-3xl block mb-2">📈</span>
        <p className="text-sm">
          {lang === "en"
            ? "No biomarker trend data available."
            : "बायोमार्कर ट्रेंड डेटा उपलब्ध नहीं है।"}
        </p>
      </div>
    );
  }

  const isBP = activeCategory.id === "blood_pressure";

  // Calculate SVG scales
  const chartWidth = 640;
  const chartHeight = 220;
  const padding = { top: 25, right: 30, bottom: 35, left: 45 };

  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Determine Y-axis min/max
  const { yMin, yMax } = useMemo(() => {
    if (isBP) {
      const allVals = activeCategory.points.flatMap((p) => [
        p.systolic || 0,
        p.diastolic || 0,
      ]);
      const min = Math.min(...allVals, 60);
      const max = Math.max(...allVals, 160);
      return { yMin: Math.floor(min / 10) * 10 - 10, yMax: Math.ceil(max / 10) * 10 + 10 };
    } else {
      const allVals = activeCategory.points.map((p) => p.value || 0);
      const min = Math.min(...allVals, activeCategory.reference.optimal_max * 0.7);
      const max = Math.max(...allVals, activeCategory.reference.danger_min * 1.15);
      return { yMin: Math.max(0, Math.floor(min * 0.85)), yMax: Math.ceil(max * 1.1) };
    }
  }, [activeCategory, isBP]);

  const getY = (val: number) => {
    const range = yMax - yMin || 1;
    return padding.top + innerHeight - ((val - yMin) / range) * innerHeight;
  };

  const getX = (index: number) => {
    const total = activeCategory.points.length;
    if (total <= 1) return padding.left + innerWidth / 2;
    return padding.left + (index / (total - 1)) * innerWidth;
  };

  // Generate SVG paths
  const systolicCoords = useMemo(() => {
    return activeCategory.points.map((p, i) => ({
      x: getX(i),
      y: getY(isBP ? p.systolic || 0 : p.value || 0),
      point: p,
    }));
  }, [activeCategory, isBP, yMin, yMax]);

  const diastolicCoords = useMemo(() => {
    if (!isBP) return [];
    return activeCategory.points.map((p, i) => ({
      x: getX(i),
      y: getY(p.diastolic || 0),
      point: p,
    }));
  }, [activeCategory, isBP, yMin, yMax]);

  const makeLinePath = (coords: Array<{ x: number; y: number }>) => {
    if (coords.length === 0) return "";
    return coords.reduce((acc, curr, idx) => {
      return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
    }, "");
  };

  const makeAreaPath = (coords: Array<{ x: number; y: number }>) => {
    if (coords.length === 0) return "";
    const bottom = padding.top + innerHeight;
    const line = coords.reduce((acc, curr, idx) => {
      return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
    }, "");
    return `${line} L ${coords[coords.length - 1].x} ${bottom} L ${coords[0].x} ${bottom} Z`;
  };

  // Y-axis ticks
  const yTicks = [yMin, Math.round((yMin + yMax) / 2), yMax];

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-6">
      {/* Category Pills Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {lang === "en" ? "Longitudinal Biomarker Trends" : "बायोमार्कर ट्रेंड विश्लेषण"}
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
              {lang === "en" ? "Multi-Visit Trajectory" : "मल्टी-विजिट ट्रेंड"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {lang === "en"
              ? "Longitudinal observations with clinical threshold analysis and anomaly detection."
              : "चिकित्सीय सीमा और परिवर्तन दर के साथ स्वास्थ्य रुझान।"}
          </p>
        </div>

        {/* Category switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 overflow-x-auto max-w-full">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setSelectedId(c.id);
                setHoveredPoint(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                selectedId === c.id
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>{c.icon}</span>
              <span>{lang === "en" ? c.title_en : c.title_hi}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {lang === "en" ? "Latest Value" : "वर्तमान मान"}
          </div>
          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {activeCategory.latest}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {lang === "en" ? "Initial Baseline" : "आरंभिक आधार"}
          </div>
          <div className="mt-1 text-lg font-bold text-slate-700 dark:text-slate-300">
            {activeCategory.baseline}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {lang === "en" ? "Net Change (Delta)" : "कुल बदलाव"}
          </div>
          <div
            className={`mt-1 text-lg font-bold ${
              activeCategory.trajectory === "falling"
                ? "text-emerald-600 dark:text-emerald-400"
                : activeCategory.trajectory === "rising"
                ? "text-amber-600 dark:text-amber-400"
                : "text-slate-700 dark:text-slate-300"
            }`}
          >
            {activeCategory.delta}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {lang === "en" ? "Clinical Status" : "क्लिनिकल स्थिति"}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                activeCategory.alert_level === "controlled" || activeCategory.alert_level === "optimal"
                  ? "bg-emerald-500"
                  : activeCategory.alert_level === "caution"
                  ? "bg-amber-500"
                  : "bg-rose-500 animate-pulse"
              }`}
            />
            <span className="text-sm font-bold text-slate-900 dark:text-white capitalize">
              {activeCategory.alert_level}
            </span>
          </div>
        </div>
      </div>

      {/* The Interactive SVG Chart */}
      <div className="relative rounded-2xl bg-slate-50/70 dark:bg-slate-950/70 border border-slate-100 dark:border-slate-800/80 p-2 sm:p-4 overflow-hidden">
        {/* Legend */}
        <div className="flex items-center justify-end gap-4 text-[11px] text-slate-500 mb-2 px-2">
          {isBP ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1 rounded-full bg-blue-600" />
                <span>Systolic (Max)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1 rounded-full bg-cyan-500" />
                <span>Diastolic (Min)</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded-full bg-blue-600" />
              <span>{activeCategory.title_en}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500/40" />
            <span>Target Zone</span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="cyanGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Shaded Target / Normal Clinical Band */}
          {activeCategory.reference && (
            <rect
              x={padding.left}
              y={getY(activeCategory.reference.optimal_max)}
              width={innerWidth}
              height={Math.max(
                4,
                getY(activeCategory.reference.optimal_max * 0.7) -
                  getY(activeCategory.reference.optimal_max)
              )}
              fill="rgba(16, 185, 129, 0.08)"
            />
          )}

          {/* Danger / Alert Threshold Line (Dashed) */}
          {activeCategory.reference?.danger_min && (
            <line
              x1={padding.left}
              y1={getY(activeCategory.reference.danger_min)}
              x2={padding.left + innerWidth}
              y2={getY(activeCategory.reference.danger_min)}
              stroke="#f43f5e"
              strokeDasharray="4 4"
              strokeWidth="1.2"
              opacity="0.6"
            />
          )}

          {/* Grid lines & Y-ticks */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                y1={getY(tick)}
                x2={padding.left + innerWidth}
                y2={getY(tick)}
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
                strokeDasharray="2 3"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={getY(tick) + 3}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono"
              >
                {tick}
              </text>
            </g>
          ))}

          {/* Area fill */}
          {isBP ? (
            <>
              <path d={makeAreaPath(systolicCoords)} fill="url(#blueGradient)" />
              <path d={makeAreaPath(diastolicCoords)} fill="url(#cyanGradient)" />
            </>
          ) : (
            <path d={makeAreaPath(systolicCoords)} fill="url(#blueGradient)" />
          )}

          {/* Primary Line */}
          <path
            d={makeLinePath(systolicCoords)}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Secondary Line (for Diastolic BP) */}
          {isBP && (
            <path
              d={makeLinePath(diastolicCoords)}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* X-axis date labels */}
          {activeCategory.points.map((p, idx) => {
            const x = getX(idx);
            const dateLabel = new Date(p.date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
            return (
              <text
                key={idx}
                x={x}
                y={padding.top + innerHeight + 18}
                textAnchor="middle"
                className="text-[10px] fill-slate-400 font-mono"
              >
                {dateLabel}
              </text>
            );
          })}

          {/* Interactive Data Point Markers */}
          {systolicCoords.map((coord, idx) => {
            const isHovered = hoveredPoint?.index === idx;
            return (
              <g
                key={`sys-${idx}`}
                className="cursor-pointer"
                onMouseEnter={() =>
                  setHoveredPoint({
                    index: idx,
                    x: coord.x,
                    y: coord.y,
                    data: coord.point,
                    type: isBP ? "systolic" : "single",
                  })
                }
                onMouseLeave={() => setHoveredPoint(null)}
              >
                {/* Outer halo */}
                <circle
                  cx={coord.x}
                  cy={coord.y}
                  r={isHovered ? 8 : 5}
                  className="fill-blue-600 transition-all duration-150"
                  opacity={isHovered ? 0.3 : 0}
                />
                {/* Node */}
                <circle
                  cx={coord.x}
                  cy={coord.y}
                  r={isHovered ? 5 : 3.5}
                  className="fill-blue-600 stroke-white dark:stroke-slate-900 stroke-2"
                />
              </g>
            );
          })}

          {isBP &&
            diastolicCoords.map((coord, idx) => {
              const isHovered = hoveredPoint?.index === idx;
              return (
                <g
                  key={`dia-${idx}`}
                  className="cursor-pointer"
                  onMouseEnter={() =>
                    setHoveredPoint({
                      index: idx,
                      x: coord.x,
                      y: coord.y,
                      data: coord.point,
                      type: "diastolic",
                    })
                  }
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  <circle
                    cx={coord.x}
                    cy={coord.y}
                    r={isHovered ? 8 : 5}
                    className="fill-cyan-500 transition-all duration-150"
                    opacity={isHovered ? 0.3 : 0}
                  />
                  <circle
                    cx={coord.x}
                    cy={coord.y}
                    r={isHovered ? 5 : 3.5}
                    className="fill-cyan-500 stroke-white dark:stroke-slate-900 stroke-2"
                  />
                </g>
              );
            })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="absolute pointer-events-none z-20 px-3 py-2 rounded-xl bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 shadow-xl text-xs space-y-0.5 -translate-x-1/2 -translate-y-full transition-transform"
            style={{
              left: `${(hoveredPoint.x / chartWidth) * 100}%`,
              top: `${Math.max(10, (hoveredPoint.y / chartHeight) * 100 - 8)}%`,
            }}
          >
            <div className="font-mono text-[10px] text-slate-300 dark:text-slate-600">
              {new Date(hoveredPoint.data.date).toLocaleDateString()}
            </div>
            <div className="font-bold text-sm">
              {isBP
                ? `${hoveredPoint.data.systolic}/${hoveredPoint.data.diastolic} mmHg`
                : `${hoveredPoint.data.value} ${activeCategory.unit}`}
            </div>
            <div className="text-[10px] font-semibold text-emerald-400 dark:text-emerald-700">
              {hoveredPoint.data.status}
            </div>
            {hoveredPoint.data.notes && (
              <div className="text-[10px] opacity-75">{hoveredPoint.data.notes}</div>
            )}
          </div>
        )}
      </div>

      {/* Clinical Interpretation & Recommendations */}
      <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-sm shrink-0">
            💡
          </span>
          <div className="flex-1">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {lang === "en" ? "Clinical Trajectory Insights" : "चिकित्सीय रुझान विश्लेषण"}
            </h4>
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {lang === "en"
                ? activeCategory.interpretation_en
                : activeCategory.interpretation_hi}
            </p>

            <div className="mt-2.5 flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-slate-900 dark:text-white">
                {lang === "en" ? "Action Plan:" : "कार्य योजना:"}
              </span>
              <span className="text-slate-600 dark:text-slate-400">
                {lang === "en"
                  ? activeCategory.recommendation_en
                  : activeCategory.recommendation_hi}
              </span>
            </div>
          </div>
        </div>

        {/* Reference Range Bar */}
        <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-2">
          <span>
            <strong>{lang === "en" ? "Threshold Guidelines" : "मानक दिशानिर्देश"}:</strong>{" "}
            {lang === "en"
              ? activeCategory.reference.label_en
              : activeCategory.reference.label_hi}
          </span>
          <span className="font-mono text-[10px]">
            Unit: {activeCategory.unit}
          </span>
        </div>
      </div>
    </div>
  );
}

