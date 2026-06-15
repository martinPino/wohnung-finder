import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { AutomationState, ContactedListing } from "@/types";
import type { T } from "@/lib/i18n";

interface StatusPanelProps {
  state: AutomationState;
  onStop: () => void;
  onSeeAll: () => void;
  t: T;
}

type Range = "week" | "month" | "all";

interface DayPoint {
  date: Date;
  value: number;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Aggregate contacted listings into a per-day series for the selected range. */
function buildSeries(items: ContactedListing[], range: Range): DayPoint[] {
  const dates = items
    .filter((i) => i.sentAt)
    .map((i) => new Date(i.sentAt))
    .filter((d) => !isNaN(d.getTime()));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let start: Date;
  if (range === "week") {
    start = new Date(today);
    start.setDate(today.getDate() - 6);
  } else if (range === "month") {
    start = new Date(today);
    start.setDate(today.getDate() - 29);
  } else {
    if (dates.length === 0) {
      start = new Date(today);
    } else {
      start = new Date(Math.min(...dates.map((d) => d.getTime())));
      start.setHours(0, 0, 0, 0);
    }
  }

  const days: DayPoint[] = [];
  const index = new Map<string, number>();
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    index.set(dayKey(date), days.length);
    days.push({ date, value: 0 });
  }
  for (const d of dates) {
    const i = index.get(dayKey(d));
    if (i != null) days[i].value++;
  }
  return days;
}

function DayChart({ series, t }: { series: DayPoint[]; t: T }) {
  const W = 320;
  const H = 120;
  const padX = 8;
  const padTop = 12;
  const padBottom = 22;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const total = series.reduce((a, s) => a + s.value, 0);
  const maxV = Math.max(1, ...series.map((s) => s.value));
  const n = series.length;

  const x = (i: number) => (n <= 1 ? padX + innerW / 2 : padX + (i / (n - 1)) * innerW);
  const y = (v: number) => padTop + innerH - (v / maxV) * innerH;

  const linePts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(" ");
  const areaPts = `${padX.toFixed(1)},${(padTop + innerH).toFixed(1)} ${linePts} ${(padX + innerW).toFixed(1)},${(padTop + innerH).toFixed(1)}`;

  const fmt = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  const fmtFull = (d: Date) => d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" });

  if (total === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-lg border bg-gray-50">
        <p className="text-xs text-gray-400">{t.chartNoData}</p>
      </div>
    );
  }

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width; // 0..1 across the element
    const vbX = fx * W;
    let i = n <= 1 ? 0 : Math.round(((vbX - padX) / innerW) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    setHover(i);
  };

  const hovered = hover != null ? series[hover] : null;

  return (
    <div
      ref={wrapRef}
      className="relative rounded-lg border bg-gray-50 p-2"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 120 }}>
        <defs>
          <linearGradient id="wfChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* max gridline */}
        <line x1={padX} y1={y(maxV)} x2={padX + innerW} y2={y(maxV)} stroke="#e5e7eb" strokeWidth="1" />
        <text x={padX} y={y(maxV) - 3} fontSize="9" fill="#9ca3af">{maxV}</text>
        {/* area + line */}
        <polygon points={areaPts} fill="url(#wfChartFill)" />
        <polyline
          points={linePts}
          fill="none"
          stroke="#2563eb"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* endpoint dots */}
        {series.map((s, i) =>
          s.value > 0 ? (
            <circle key={i} cx={x(i)} cy={y(s.value)} r="2" fill="#2563eb" />
          ) : null
        )}
        {/* hover guide + highlighted point */}
        {hovered && (
          <>
            <line x1={x(hover!)} y1={padTop} x2={x(hover!)} y2={padTop + innerH} stroke="#93c5fd" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(hover!)} cy={y(hovered.value)} r="3.5" fill="#2563eb" stroke="#fff" strokeWidth="1.5" />
          </>
        )}
        {/* x labels: first & last */}
        <text x={padX} y={H - 6} fontSize="9" fill="#9ca3af">{fmt(series[0].date)}</text>
        <text x={padX + innerW} y={H - 6} fontSize="9" fill="#9ca3af" textAnchor="end">{fmt(series[n - 1].date)}</text>
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-center text-[11px] leading-tight text-white shadow-lg"
          style={{ left: `${(x(hover!) / W) * 100}%`, top: `${y(hovered.value)}px`, marginTop: -8 }}
        >
          <span className="block font-semibold">{hovered.value} {hovered.value === 1 ? t.chartTooltipOne : t.chartTooltipMany}</span>
          <span className="block text-gray-300">{fmtFull(hovered.date)}</span>
        </div>
      )}
    </div>
  );
}

export default function StatusPanel({ state, onStop, onSeeAll, t }: StatusPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const [contacted, setContacted] = useState<ContactedListing[]>([]);
  const [range, setRange] = useState<Range>("week");

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.logs]);

  // Load contacted listings, and refresh whenever a run finishes (status change).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/contacted-listings");
        const data = (await res.json()) as ContactedListing[];
        if (!cancelled) setContacted(data); // API returns newest first
      } catch { /* ignore */ }
    };
    load();
    return () => { cancelled = true; };
  }, [state.status]);

  const recent = contacted.slice(0, 3);
  const series = useMemo(() => buildSeries(contacted, range), [contacted, range]);

  const STATUS_LABELS: Record<AutomationState["status"], string> = {
    idle:    t.statusIdle,
    running: t.statusRunning,
    paused:  t.statusPaused,
    done:    t.statusDone,
    error:   t.statusError,
  };

  const STATUS_COLORS: Record<AutomationState["status"], string> = {
    idle:    "bg-gray-100 text-gray-600",
    running: "bg-blue-100 text-blue-700",
    paused:  "bg-yellow-100 text-yellow-700",
    done:    "bg-green-100 text-green-700",
    error:   "bg-red-100 text-red-700",
  };

  const LOG_COLORS: Record<AutomationState["logs"][number]["level"], string> = {
    info:  "text-gray-300",
    warn:  "text-yellow-400",
    error: "text-red-400",
  };

  const RANGES: { id: Range; label: string }[] = [
    { id: "week",  label: t.rangeWeek  },
    { id: "month", label: t.rangeMonth },
    { id: "all",   label: t.rangeAll   },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">{t.statusTitle}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[state.status]}`}>
          {STATUS_LABELS[state.status]}
        </span>
      </div>

      {/* Contacted-per-day chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t.chartTitle}</p>
          <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  range === r.id ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <DayChart series={series} t={t} />
      </div>

      <div ref={logRef} className="h-48 overflow-y-auto rounded-md bg-gray-900 p-3 font-mono text-xs leading-relaxed">
        {state.logs.length === 0 ? (
          <span className="text-gray-500">{t.waitingToStart}</span>
        ) : (
          state.logs.map((entry, i) => (
            <div key={i} className={LOG_COLORS[entry.level]}>
              <span className="text-gray-500 select-none">{entry.timestamp} </span>
              {entry.message}
            </div>
          ))
        )}
      </div>

      {state.status === "running" && (
        <button
          type="button"
          onClick={onStop}
          className="w-full rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
        >
          {t.stopAutomation}
        </button>
      )}

      {recent.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t.recentlyContacted}</p>
          <div className="divide-y rounded-lg border bg-white overflow-hidden">
            {recent.map((l) => (
              <div key={l.id} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-shrink-0 rounded-full bg-green-100 p-1">
                  <svg className="h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  {l.url ? (
                    <a href={l.url} target="_blank" rel="noopener noreferrer"
                      className="block truncate text-xs font-medium text-blue-600 hover:underline">
                      {l.title || l.url}
                    </a>
                  ) : (
                    <p className="truncate text-xs font-medium text-gray-700">{l.title || l.id}</p>
                  )}
                </div>
                {l.sentAt && (
                  <span className="flex-shrink-0 text-[10px] text-gray-400">
                    {new Date(l.sentAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onSeeAll}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
          >
            {t.seeAll}
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
