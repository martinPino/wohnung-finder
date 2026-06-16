// ---------------------------------------------------------------------------
// electron/licensing/types.ts
//
// License types shared inside the Electron MAIN process (identity / verify /
// IPC). Kept LOCAL to the electron/ tree on purpose: the electron tsconfig has
// rootDir ".", so importing the renderer copy (src/types/license.d.ts) would
// trip TS "file is not under rootDir". The renderer keeps its own structurally
// identical copy in src/types/license.d.ts — keep the two in sync.
//
// Compiles to CommonJS (dist-electron/licensing/types.js).
// ---------------------------------------------------------------------------

export type LicenseStatus = "inactive" | "active" | "trial" | "expired" | "loading";
export type LicensePlan = "monthly" | "lifetime" | "none";
export type BuyablePlan = "monthly" | "lifetime";

export interface LicenseState {
  status: LicenseStatus;
  plan: LicensePlan;
  machineId: string;
  customerId: string | null;
  subscriptionId: string | null;
  lastCheckedAt: string | null;
  /** Free-trial contact requests already used (server-tracked). */
  trialUsed: number;
  /** Free-trial contact-request limit (TRIAL_LIMIT). */
  trialLimit: number;
}
