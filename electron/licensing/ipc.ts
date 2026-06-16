// ---------------------------------------------------------------------------
// electron/licensing/ipc.ts
//
// Main-process IPC surface for licensing. Registers handlers for the channels
// the preload bridge exposes on `window.license`, and pushes a `license:changed`
// event to every renderer whenever the cached license state is updated.
//
// Channels (must match electron/preload.ts and src/types/license.d.ts):
//   invoke  "license:getState"    -> LicenseState   (cached; verifies once if cold)
//   invoke  "license:refresh"     -> LicenseState   (force re-fetch from Firestore)
//   invoke  "license:buy"         (plan: BuyablePlan) -> void  (opens browser)
//   invoke  "license:openPortal"  -> void           (opens system browser)
//   emit    "license:changed"     (state: LicenseState)  main -> renderer
//
// Compiles to CommonJS (dist-electron/licensing/ipc.js).
// ---------------------------------------------------------------------------

import { ipcMain, webContents, type IpcMain } from "electron";
// Canonical verification core (online-first, offline-grace, clock-rollback
// guard). Returns a LicenseState per the renderer contract.
import { verifyLicense, recordTrialUsage } from "./license";
import type { LicenseState } from "./types";
import { buy, openPortal, type BuyablePlan } from "./paddle";

// IPC channel names — single source of truth, reused by preload.
export const LICENSE_CHANNELS = {
  getState: "license:getState",
  refresh: "license:refresh",
  buy: "license:buy",
  openPortal: "license:openPortal",
  recordUsage: "license:recordUsage",
  changed: "license:changed",
} as const;

// Last known license state, shared across the main process. `null` until the
// first verification completes.
let currentState: LicenseState | null = null;

// Guard so we don't register handlers twice (e.g. on re-init).
let registered = false;

/** Broadcast the current license state to every live renderer. */
function broadcast(state: LicenseState): void {
  for (const wc of webContents.getAllWebContents()) {
    if (!wc.isDestroyed()) {
      wc.send(LICENSE_CHANNELS.changed, state);
    }
  }
}

/**
 * Re-fetch the license from Firestore, cache it, and broadcast `license:changed`
 * if anything meaningful changed. Returns the fresh state.
 */
export async function refreshLicense(): Promise<LicenseState> {
  const next = await verifyLicense();
  const changed =
    !currentState ||
    currentState.status !== next.status ||
    currentState.plan !== next.plan ||
    currentState.subscriptionId !== next.subscriptionId ||
    currentState.customerId !== next.customerId ||
    currentState.trialUsed !== next.trialUsed;

  currentState = next;
  if (changed) broadcast(next);
  return next;
}

/**
 * Report `count` consumed free-trial contacts to the backend, refresh the
 * cached state, and broadcast the change (so the trial counter / paywall in
 * the renderer update immediately).
 */
export async function reportTrialUsage(count: number): Promise<LicenseState> {
  const next = await recordTrialUsage(count);
  currentState = next;
  broadcast(next);
  return next;
}

/**
 * Run an initial license verification at startup so the renderer has state
 * ready (and so `license:getState` is warm). Safe to call before any window
 * exists — the result is cached and broadcast once renderers are alive.
 */
export async function verifyLicenseOnStartup(): Promise<LicenseState> {
  return refreshLicense();
}

/**
 * Register all licensing IPC handlers on the given ipcMain instance.
 * Call once during app startup (after app.whenReady()).
 */
export function registerLicenseIpc(ipc: IpcMain = ipcMain): void {
  if (registered) return;
  registered = true;

  // Return the cached state, verifying once lazily if we're still cold.
  ipc.handle(LICENSE_CHANNELS.getState, async (): Promise<LicenseState> => {
    if (!currentState) return refreshLicense();
    return currentState;
  });

  // Force a fresh read from Firestore.
  ipc.handle(LICENSE_CHANNELS.refresh, async (): Promise<LicenseState> => {
    return refreshLicense();
  });

  // Open the Paddle checkout for `plan` in the system browser.
  ipc.handle(
    LICENSE_CHANNELS.buy,
    async (_event, plan: BuyablePlan): Promise<void> => {
      await buy(plan);
    }
  );

  // Open the Paddle customer portal / cancel deep link in the system browser.
  ipc.handle(LICENSE_CHANNELS.openPortal, async (): Promise<void> => {
    await openPortal();
  });

  // Report consumed free-trial contacts (server-authoritative counter).
  ipc.handle(
    LICENSE_CHANNELS.recordUsage,
    async (_event, count: number): Promise<LicenseState> => {
      return reportTrialUsage(typeof count === "number" ? count : 0);
    }
  );
}
