import { useEffect, useState, useRef } from "react";
import type { ScheduleStatus } from "@/types";
import type { T } from "@/lib/i18n";

import type { AppConfig } from "@/types";
interface ScheduleFormProps { t: T; appConfig: AppConfig; }

const PRESET_MINUTES = [2, 30, 60, 120, 240, 360, 720, 1440];

function presetLabel(m: number, t: T): string {
  if (m < 60) return `${m} min`;
  if (m === 60) return `1 Std`;
  if (m % 60 === 0) return `${m / 60} Std`;
  return `${m} min`;
}

export default function ScheduleForm({ t, appConfig }: ScheduleFormProps) {
  const [status, setStatus] = useState<ScheduleStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [saving, setSaving] = useState(false);
  const [countdown, setCountdown] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const initializedRef = useRef(false); // only sync intervalMinutes on first load

  const fetchStatus = async (isInitial = false) => {
    try {
      const res = await fetch("/api/schedule");
      const data: ScheduleStatus = await res.json();
      setStatus(data);
      setEnabled(data.enabled);
      // Only update intervalMinutes on initial load — don't overwrite user input
      if (isInitial || !initializedRef.current) {
        setIntervalMinutes(data.intervalMinutes);
        initializedRef.current = true;
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchStatus(true);
    pollRef.current = setInterval(() => fetchStatus(false), 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (!status?.nextRunAt) { setCountdown(""); return; }
    const tick = () => {
      const diff = new Date(status.nextRunAt!).getTime() - Date.now();
      if (diff <= 0) { setCountdown("…"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setCountdown(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [status?.nextRunAt]);

  const post = async (body: object) => {
    setSaving(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, appConfig }),  // always send current config
      });
      setStatus(await res.json());
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-800">{t.scheduleTitle}</h2>

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-xl border bg-gray-50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-800">{t.scheduleToggleLabel}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t.scheduleToggleHint}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={() => { const next = !enabled; setEnabled(next); post({ enabled: next, intervalMinutes }); }}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${enabled ? "bg-blue-600" : "bg-gray-300"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${enabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {/* Interval */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">{t.intervalLabel}</p>
        <div className="grid grid-cols-4 gap-2">
          {PRESET_MINUTES.map((m) => (
            <button key={m} type="button" onClick={() => setIntervalMinutes(m)}
              className={`rounded-lg border py-2 text-sm font-medium transition-colors ${intervalMinutes === m ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
              {presetLabel(m, t)}
            </button>
          ))}
          <div className="col-span-4 flex items-center gap-2 mt-1">
            <label className="text-xs text-gray-500 whitespace-nowrap">{t.customInterval}</label>
            <input type="number" min={1} value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value)))}
              className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500">{t.minutes}</span>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button type="button" onClick={() => post({ enabled, intervalMinutes })} disabled={saving}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {saving ? "…" : t.saveBtn}
        </button>
        <button type="button" onClick={() => post({ enabled, intervalMinutes, runImmediately: true })} disabled={saving}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {t.saveAndRunBtn}
        </button>
      </div>

      {/* Status */}
      {status && (
        <div className="rounded-xl border bg-gray-50 divide-y text-sm">
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-gray-500">Status</span>
            <span className={`font-medium ${status.enabled ? "text-green-600" : "text-gray-400"}`}>
              {status.enabled ? t.statusActive : t.statusInactive}
            </span>
          </div>
          {status.enabled && status.nextRunAt && (
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-gray-500">{t.nextRun}</span>
              <span className="font-medium text-blue-600 tabular-nums">{countdown || "–"}</span>
            </div>
          )}
          {status.lastRunAt && (
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-gray-500">{t.lastRun}</span>
              <span className="text-gray-700">{new Date(status.lastRunAt).toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" })}</span>
            </div>
          )}
          {status.lastRunResult && (
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-gray-500">{t.lastResult}</span>
              <span className={`text-right max-w-[60%] ${status.lastRunResult.startsWith("Error") ? "text-red-500" : "text-gray-700"}`}>
                {status.lastRunResult}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
