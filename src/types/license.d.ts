// ---------------------------------------------------------------------------
// License bridge types
//
// The Electron preload script exposes a `window.license` object (via
// contextBridge) that the renderer uses to read the current license state,
// subscribe to changes, start a Paddle checkout, and open the Paddle customer
// portal. This file declares the global `Window.license` shape so the renderer
// (Next.js/React/TS) is fully typed.
//
// In a plain web/dev build (no Electron preload), `window.license` is simply
// `undefined`; the renderer hook (src/hooks/useLicense.ts) must handle that
// gracefully and no-op.
// ---------------------------------------------------------------------------

/** Lifecycle status of the device-bound license. */
export type LicenseStatus =
  /** No valid purchase found for this machine yet. */
  | "inactive"
  /** Paid and currently valid (monthly subscription active, or lifetime). */
  | "active"
  /** Was active but the monthly subscription lapsed / payment failed. */
  | "expired"
  /** Bridge is still resolving the initial state (first read in flight). */
  | "loading";

/** Which plan the user purchased. */
export type LicensePlan =
  /** 9 €/month recurring subscription (Paddle subscription). */
  | "monthly"
  /** 29 € one-time lifetime purchase. */
  | "lifetime"
  /** Unknown / not purchased. */
  | "none";

/** The two purchasable plans surfaced in the license gate. */
export type BuyablePlan = "monthly" | "lifetime";

/**
 * Snapshot of the current license, as delivered by the main process.
 * Mirrors the Firestore `licenses/{machineId}` document the Paddle webhook
 * writes, plus the locally-derived `machineId`.
 */
export interface LicenseState {
  /** Current lifecycle status. */
  status: LicenseStatus;
  /** Which plan is (or was) active. */
  plan: LicensePlan;
  /** Salted hash of the machine id this license is bound to. */
  machineId: string;
  /**
   * Paddle customer id (`ctm_...`) once a purchase exists. Needed to open the
   * customer portal for subscription management/cancellation. Null until known.
   */
  customerId: string | null;
  /**
   * Paddle subscription id (`sub_...`) for monthly plans. Null for lifetime
   * or before any purchase. Used to deep-link the cancellation form.
   */
  subscriptionId: string | null;
  /**
   * ISO timestamp of the last successful sync with the license store, or null
   * if it has never synced (e.g. offline on first launch).
   */
  lastCheckedAt: string | null;
}

/**
 * The API surface exposed on `window.license` by the Electron preload script.
 * All methods are async and safe to call repeatedly.
 */
export interface LicenseBridge {
  /** Read the current license snapshot. */
  getState(): Promise<LicenseState>;
  /**
   * Subscribe to license changes (after a purchase, a refresh, or a webhook
   * propagating to the store). The listener is invoked with each new snapshot.
   * Returns an unsubscribe function.
   */
  onChange(listener: (state: LicenseState) => void): () => void;
  /**
   * Start a Paddle checkout for the given plan. The main process creates the
   * transaction (with `custom_data.machineId`) and opens the system browser.
   */
  buy(plan: BuyablePlan): Promise<void>;
  /**
   * Open the Paddle customer portal in the system browser so monthly
   * subscribers can manage or cancel ("Abo kündigen"). No-op without an
   * active subscription/customer.
   */
  openPortal(): Promise<void>;
  /**
   * Force an immediate re-check against the license store. Resolves with the
   * freshly-fetched snapshot. Used by the "Lizenz wiederherstellen" button.
   */
  refresh(): Promise<LicenseState>;
}

declare global {
  interface Window {
    /**
     * Present only inside the Electron shell (injected by the preload script).
     * `undefined` in a plain browser / `next dev` web build.
     */
    license?: LicenseBridge;
  }
}

// Ensure this file is treated as a module so the `declare global` augmentation
// applies project-wide rather than shadowing the global scope.
export {};
