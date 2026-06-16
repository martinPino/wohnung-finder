import { useEffect, useMemo, useRef, useState } from "react";
import type { AutomationState, ContactedListing, ScheduleStatus } from "@/types";
import type { T } from "@/lib/i18n";

interface StatusPanelProps {
  state: AutomationState;
  onStop: () => void;
  onSeeAll: () => void;
  /** Bump to force an immediate re-fetch of contacted listings (e.g. a
   *  background scheduled run just finished). */
  refreshKey?: number;
  /** Latest scheduler status, so background runs are reflected here instead of
   *  the idle "waiting to start" placeholder. */
  schedule?: ScheduleStatus | null;
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
  const PLOT_H = 104; // px height of the plotting area
  const [hover, setHover] = useState<number | null>(null);

  const total = series.reduce((a, s) => a + s.value, 0);
  const maxV = Math.max(1, ...series.map((s) => s.value));
  const n = series.length;

  const fmt = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  const fmtFull = (d: Date) => d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" });

  if (total === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-lg border bg-gray-50">
        <p className="text-xs text-gray-400">{t.chartNoData}</p>
      </div>
    );
  }

  const hovered = hover != null ? series[hover] : null;

  // Bar-center position as a 0..1 fraction of the plot width.
  const pos = (i: number) => (i + 0.5) / n;

  // X-axis labels: first, last, and every day with activity — dropping any
  // that would overlap a previously kept label (min gap as a width fraction).
  const minGapFrac = 0.13;
  const labelIdx: number[] = [];
  {
    const candidates = Array.from(
      new Set([0, n - 1, ...series.flatMap((s, i) => (s.value > 0 ? [i] : []))])
    ).sort((a, b) => a - b);
    let lastP = -Infinity;
    for (const i of candidates) {
      if (i === 0) { labelIdx.push(i); lastP = pos(i); continue; }
      if (i === n - 1) { labelIdx.push(i); continue; } // always keep last
      const p = pos(i);
      if (p - lastP >= minGapFrac && pos(n - 1) - p >= minGapFrac) { labelIdx.push(i); lastP = p; }
    }
  }

  const midV = Math.round(maxV / 2);

  return (
    <div className="rounded-lg border bg-gray-50 px-3 pb-2 pt-4">
      <div className="flex">
        {/* Y-axis gutter (keeps labels off the bars) */}
        <div className="relative mr-1.5 w-5 flex-shrink-0" style={{ height: PLOT_H }}>
          <span className="absolute right-0 top-0 -translate-y-1/2 text-[10px] tabular-nums text-gray-400">{maxV}</span>
          {midV > 0 && midV < maxV && (
            <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-gray-300">{midV}</span>
          )}
          <span className="absolute bottom-0 right-0 translate-y-1/2 text-[10px] tabular-nums text-gray-400">0</span>
        </div>

        {/* Plot area */}
        <div className="relative flex-1" style={{ height: PLOT_H }} onMouseLeave={() => setHover(null)}>
          {/* gridlines */}
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-gray-200" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-gray-100" />

          {/* Bars (x-axis = bottom border) */}
          <div className="absolute inset-0 flex items-end gap-[3px] border-b border-gray-300">
            {series.map((s, i) => (
              <div
                key={i}
                className="flex h-full flex-1 cursor-default items-end"
                onMouseEnter={() => setHover(i)}
              >
                <div
                  className="w-full rounded-t-[2px] transition-colors"
                  style={{
                    height: `${(s.value / maxV) * 100}%`,
                    minHeight: s.value > 0 ? 3 : 0,
                    backgroundColor: hover === i ? "#1d4ed8" : "#3b82f6",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Tooltip */}
          {hovered && (
            <div
              className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-center text-[11px] leading-tight text-white shadow-lg"
              style={{
                left: `${pos(hover!) * 100}%`,
                top: `${(1 - hovered.value / maxV) * 100}%`,
                transform: "translate(-50%, -118%)",
              }}
            >
              <span className="block font-semibold">
                {hovered.value} {hovered.value === 1 ? t.chartTooltipOne : t.chartTooltipMany}
              </span>
              <span className="block text-gray-300">{fmtFull(hovered.date)}</span>
            </div>
          )}
        </div>
      </div>

      {/* X-axis labels (aligned under the plot, past the gutter) */}
      <div className="relative ml-[26px] mt-1.5 h-3">
        {labelIdx.map((i) => (
          <span
            key={i}
            className="absolute top-0 text-[10px] tabular-nums text-gray-400"
            style={
              i === 0
                ? { left: 0 }
                : i === n - 1
                ? { right: 0 }
                : { left: `${pos(i) * 100}%`, transform: "translateX(-50%)" }
            }
          >
            {fmt(series[i].date)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function StatusPanel({ state, onStop, onSeeAll, refreshKey = 0, schedule, t }: StatusPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const [contacted, setContacted] = useState<ContactedListing[]>([]);
  const [range, setRange] = useState<Range>("week");

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.logs]);

  // Load contacted listings, refresh whenever a run finishes (manual status
  // change or a background scheduled run via refreshKey), and poll on an
  // interval so contacts made by the scheduler appear without a manual reload.
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
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [state.status, refreshKey]);

  const recent = contacted.slice(0, 3);
  const series = useMemo(() => buildSeries(contacted, range), [contacted, range]);

  // A scheduled run reports server-side; reflect it here when no manual run is
  // active so the panel doesn't show the idle "waiting to start" placeholder.
  const scheduleRunning = schedule?.lastRunResult === "running…";
  const effectiveStatus: AutomationState["status"] =
    state.status !== "idle" ? state.status : scheduleRunning ? "running" : "idle";
  const lastScheduledResult =
    schedule?.lastRunResult && schedule.lastRunResult !== "running…"
      ? schedule.lastRunResult
      : null;

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
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[effectiveStatus]}`}>
          {STATUS_LABELS[effectiveStatus]}
        </span>
      </div>

      <div ref={logRef} className="h-48 overflow-y-auto rounded-md bg-gray-900 p-3 font-mono text-xs leading-relaxed">
        {state.logs.length === 0 ? (
          scheduleRunning ? (
            <span className="text-blue-400">{t.statusScheduleRunning}</span>
          ) : schedule?.enabled ? (
            <div className="space-y-1">
              <div className="text-green-400">{t.statusScheduleWaiting}</div>
              {lastScheduledResult && (
                <div className="text-gray-400">
                  <span className="text-gray-500 select-none">{t.lastResult}: </span>
                  {lastScheduledResult}
                </div>
              )}
            </div>
          ) : (
            <span className="text-gray-500">{t.waitingToStart}</span>
          )
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

      {/* Contacted-per-day chart */}
      <div className="space-y-2 pt-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t.chartTitle}</p>
        <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`flex-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                range === r.id ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <DayChart series={series} t={t} />
      </div>
    </div>
  );
}
