import { useEffect, useRef } from "react";
import type { AutomationState } from "@/types";
import type { T } from "@/lib/i18n";

interface StatusPanelProps {
  state: AutomationState;
  onStop: () => void;
  t: T;
}

export default function StatusPanel({ state, onStop, t }: StatusPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.logs]);

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">{t.statusTitle}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[state.status]}`}>
          {STATUS_LABELS[state.status]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-gray-50 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-800">{state.listingsFound}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t.listingsFound}</p>
        </div>
        <div className="rounded-lg border bg-gray-50 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{state.requestsSent}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t.requestsSent}</p>
        </div>
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
    </div>
  );
}
