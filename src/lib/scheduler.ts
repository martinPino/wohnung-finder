/**
 * Singleton scheduler — survives Next.js hot-module-reload by storing
 * all mutable state on `globalThis`. Without this, each hot-reload creates
 * a new setInterval while the old one keeps firing, causing multiple
 * concurrent automation runs even after the schedule is disabled.
 */
import * as fs from "fs";
import * as path from "path";
import type { ScheduleStatus } from "@/types";

const DATA_DIR = process.env.IMMOSCOUT_DATA_DIR || process.cwd();
const SCHEDULE_FILE = path.join(DATA_DIR, "schedule.json");

// ---------------------------------------------------------------------------
// Global state — persists across Next.js HMR re-imports
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __scheduler: {
    timer: ReturnType<typeof setInterval> | null;
    nextRunAt: Date | null;
    lastRunAt: string | null;
    lastRunResult: string | null;
    lastRunRequestsSent: number | null;
    runSeq: number;
    isRunning: boolean;
    config: { enabled: boolean; intervalMinutes: number };
  } | undefined;
}

function getGlobal() {
  if (!globalThis.__scheduler) {
    const persisted = readPersistedSchedule();
    globalThis.__scheduler = {
      timer: null,
      nextRunAt: null,
      lastRunAt: null,
      lastRunResult: null,
      lastRunRequestsSent: null,
      runSeq: 0,
      isRunning: false,
      config: { ...persisted },
    };
  }
  return globalThis.__scheduler;
}

// ---------------------------------------------------------------------------
// Persistent file helpers
// ---------------------------------------------------------------------------

function readPersistedSchedule(): { enabled: boolean; intervalMinutes: number } {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf-8"));
    }
  } catch { /* ignore */ }
  return { enabled: false, intervalMinutes: 60 };
}

function writePersistedSchedule(s: { enabled: boolean; intervalMinutes: number }) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(s, null, 2));
}

// ---------------------------------------------------------------------------
// Automation trigger (mutex protected)
// ---------------------------------------------------------------------------

async function triggerAutomation(): Promise<void> {
  const g = getGlobal();
  if (g.isRunning) {
    console.log("[scheduler] Already running — skipping.");
    return;
  }
  // Double-check: if schedule was disabled between timer fire and now, skip
  if (!g.config.enabled) {
    console.log("[scheduler] Schedule disabled — skipping timer fire.");
    return;
  }

  g.isRunning = true;
  g.lastRunAt = new Date().toISOString();
  g.lastRunResult = "running…";
  g.lastRunRequestsSent = 0;
  scheduleNextRun();

  try {
    const configPath = path.join(DATA_DIR, "automation-config.json");
    if (!fs.existsSync(configPath)) {
      g.lastRunResult = "Error: automation-config.json not found. Save config from the Schedule tab first.";
      return;
    }

    const { runAutomation, launchChromeWithDebugging, isCDPAvailable } =
      await import("../automation/immoscout") as {
        runAutomation: (c: unknown, d: boolean) => Promise<{ listingsFound: number; requestsSent: number }>;
        launchChromeWithDebugging: () => Promise<void>;
        isCDPAvailable?: () => Promise<boolean>;
      };

    if (isCDPAvailable && !(await isCDPAvailable())) {
      await launchChromeWithDebugging();
      await new Promise((r) => setTimeout(r, 5000));
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const result = await runAutomation(config, false);
    g.lastRunResult = `Found ${result.listingsFound}, sent ${result.requestsSent}.`;
    g.lastRunRequestsSent = result.requestsSent;
  } catch (err) {
    g.lastRunResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
    console.error("[scheduler] error:", err);
  } finally {
    g.isRunning = false;
    // Signal completion so the renderer can refresh the UI and advance the
    // free-trial counter (it watches runSeq via GET /api/schedule).
    g.runSeq++;
  }
}

// ---------------------------------------------------------------------------
// Timer management
// ---------------------------------------------------------------------------

function scheduleNextRun() {
  const g = getGlobal();
  g.nextRunAt = g.config.enabled
    ? new Date(Date.now() + g.config.intervalMinutes * 60_000)
    : null;
}

function stopTimer() {
  const g = getGlobal();
  if (g.timer) {
    clearInterval(g.timer);
    g.timer = null;
  }
  g.nextRunAt = null;
}

function startTimer() {
  const g = getGlobal();
  stopTimer(); // always clear existing timer first
  if (!g.config.enabled || g.config.intervalMinutes <= 0) return;

  const ms = g.config.intervalMinutes * 60_000;
  scheduleNextRun();
  g.timer = setInterval(() => { triggerAutomation().catch(console.error); }, ms);
  console.log(`[scheduler] Timer started — every ${g.config.intervalMinutes} min.`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getScheduleStatus(): ScheduleStatus {
  const g = getGlobal();
  return {
    enabled: g.config.enabled,
    intervalMinutes: g.config.intervalMinutes,
    nextRunAt: g.nextRunAt?.toISOString() ?? null,
    lastRunAt: g.lastRunAt,
    lastRunResult: g.isRunning ? "running…" : g.lastRunResult,
    lastRunRequestsSent: g.lastRunRequestsSent,
    runSeq: g.runSeq,
  };
}

export function updateSchedule(config: { enabled: boolean; intervalMinutes: number }): ScheduleStatus {
  const g = getGlobal();

  // Always stop any existing timer first, regardless of new enabled state
  stopTimer();

  g.config = { ...config };
  writePersistedSchedule(g.config);

  if (g.config.enabled) {
    startTimer();
    console.log(`[scheduler] Schedule enabled — every ${g.config.intervalMinutes} min.`);
  } else {
    // Also cancel any running automation
    import("@/lib/cancellation").then(({ requestCancellation }) => requestCancellation()).catch(() => {});
    console.log("[scheduler] Schedule disabled — all timers cleared.");
  }

  return getScheduleStatus();
}

export function runNow(): void {
  triggerAutomation().catch(console.error);
}

// ---------------------------------------------------------------------------
// NO auto-start on module load.
// The timer only starts when updateSchedule() is explicitly called via the API.
// This prevents phantom timers after Next.js HMR or server restarts.
// If the server restarts while a schedule was active, the user just needs to
// re-click "Save" in the Schedule tab to reactivate it.
// ---------------------------------------------------------------------------
