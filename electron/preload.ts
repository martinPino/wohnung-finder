// ---------------------------------------------------------------------------
// electron/preload.ts
//
// Context-isolated bridge. Exposes a minimal, typed `window.license` API to the
// renderer (the Next.js UI) without leaking Node/Electron internals. Runs with
// contextIsolation: true (set in main.ts webPreferences).
//
// The exposed surface MUST match the renderer contract in src/types/license.d.ts
// (LicenseBridge / LicenseState / BuyablePlan), because src/hooks/useLicense.ts
// consumes it directly.
//
// Channels mirror electron/licensing/ipc.ts (LICENSE_CHANNELS):
//   window.license.getState()      -> Promise<LicenseState>
//   window.license.refresh()       -> Promise<LicenseState>
//   window.license.buy(plan)       -> Promise<void>
//   window.license.openPortal()    -> Promise<void>
//   window.license.onChange(cb)    -> unsubscribe fn; cb(state) on license:changed
//
// Compiles to CommonJS (dist-electron/preload.js).
// ---------------------------------------------------------------------------

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

// Keep these strings in sync with LICENSE_CHANNELS in licensing/ipc.ts.
const CH = {
  getState: "license:getState",
  refresh: "license:refresh",
  buy: "license:buy",
  openPortal: "license:openPortal",
  changed: "license:changed",
} as const;

// --- Types (structurally identical to src/types/license.d.ts) --------------

type LicenseStatus = "inactive" | "active" | "expired" | "loading";
type LicensePlan = "monthly" | "lifetime" | "none";
type BuyablePlan = "monthly" | "lifetime";

interface LicenseState {
  status: LicenseStatus;
  plan: LicensePlan;
  machineId: string;
  customerId: string | null;
  subscriptionId: string | null;
  lastCheckedAt: string | null;
}

interface LicenseBridge {
  /** Read the current license snapshot. */
  getState(): Promise<LicenseState>;
  /** Force a fresh re-fetch from the backend; resolves with the latest snapshot. */
  refresh(): Promise<LicenseState>;
  /** Start a Paddle checkout for `plan`; opens the system browser. */
  buy(plan: BuyablePlan): Promise<void>;
  /** Open the Paddle customer portal / cancel page in the system browser. */
  openPortal(): Promise<void>;
  /**
   * Subscribe to license changes pushed from the main process.
   * Returns an unsubscribe function.
   */
  onChange(listener: (state: LicenseState) => void): () => void;
}

// --- Bridge implementation --------------------------------------------------

const licenseBridge: LicenseBridge = {
  getState: () => ipcRenderer.invoke(CH.getState),
  refresh: () => ipcRenderer.invoke(CH.refresh),
  buy: (plan: BuyablePlan) => ipcRenderer.invoke(CH.buy, plan),
  openPortal: () => ipcRenderer.invoke(CH.openPortal),
  onChange: (listener) => {
    // Wrap so we don't leak the raw IpcRendererEvent to the renderer.
    const wrapped = (_event: IpcRendererEvent, state: LicenseState) =>
      listener(state);
    ipcRenderer.on(CH.changed, wrapped);
    return () => ipcRenderer.removeListener(CH.changed, wrapped);
  },
};

contextBridge.exposeInMainWorld("license", licenseBridge);
