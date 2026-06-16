import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BuyablePlan,
  LicenseBridge,
  LicenseState,
} from "@/types/license";

// ---------------------------------------------------------------------------
// useLicense — renderer-side access to the Electron `window.license` bridge.
//
// Responsibilities:
//   - Read the initial license snapshot from window.license.getState().
//   - Subscribe to onChange so the UI updates live after a purchase / refresh.
//   - Expose buy / openPortal / refresh action wrappers.
//   - Degrade gracefully in a plain web/dev build where window.license is
//     undefined: in that case it reports a stable "inactive" state and the
//     action wrappers no-op (so the gate renders without crashing in `next dev`).
// ---------------------------------------------------------------------------

/**
 * Fallback state used when there is no Electron bridge (plain web / `next dev`).
 * Treated as "inactive" so the LicenseGate is visible during web preview, but
 * the buy/portal actions are inert because no bridge exists.
 */
const WEB_FALLBACK_STATE: LicenseState = {
  status: "inactive",
  plan: "none",
  machineId: "",
  customerId: null,
  subscriptionId: null,
  lastCheckedAt: null,
  trialUsed: 0,
  trialLimit: 20,
};

/** Initial state shown before the first async getState() resolves. */
const LOADING_STATE: LicenseState = {
  ...WEB_FALLBACK_STATE,
  status: "loading",
};

export interface UseLicense {
  /** Current license snapshot. */
  state: LicenseState;
  /** True while the initial getState() call is still in flight. */
  loading: boolean;
  /**
   * True when running inside the Electron shell (bridge present). When false,
   * buy/openPortal/refresh are no-ops — useful to hide purchase UI in dev.
   */
  hasBridge: boolean;
  /** Convenience flag: license is active (monthly or lifetime). */
  isActive: boolean;
  /** Paid & valid (status active). */
  isPaid: boolean;
  /** In the free trial (status trial, contacts still left). */
  isTrial: boolean;
  /** Entitled to use the app: paid OR trial with contacts left. */
  entitled: boolean;
  /** Free-trial contacts left (trialLimit - trialUsed, clamped >= 0). */
  trialRemaining: number;
  /** Start a Paddle checkout for the chosen plan (no-op without a bridge). */
  buy: (plan: BuyablePlan) => Promise<void>;
  /** Open the Paddle customer portal (no-op without a bridge). */
  openPortal: () => Promise<void>;
  /** Re-check the license store; resolves with the latest snapshot. */
  refresh: () => Promise<LicenseState>;
  /** Report consumed free-trial contacts; resolves with the latest snapshot. */
  recordUsage: (count: number) => Promise<LicenseState>;
}

/** Safely grab the bridge, guarding SSR (no `window` during prerender). */
function getBridge(): LicenseBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return window.license;
}

export function useLicense(): UseLicense {
  const [state, setState] = useState<LicenseState>(LOADING_STATE);
  const [loading, setLoading] = useState(true);
  // Resolved once on the client; SSR/first render reports false.
  const [hasBridge, setHasBridge] = useState(false);

  // Keep the latest state available to refresh() without stale-closure issues.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Initial read + live subscription. Runs once after mount (client only).
  useEffect(() => {
    const bridge = getBridge();

    // Plain web / dev: no bridge. Report the inactive fallback and stop.
    if (!bridge) {
      setHasBridge(false);
      setState(WEB_FALLBACK_STATE);
      setLoading(false);
      return;
    }

    setHasBridge(true);
    let cancelled = false;

    // 1) Pull the current snapshot.
    bridge
      .getState()
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch((err) => {
        console.warn("[useLicense] getState failed:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // 2) Subscribe to live updates (purchase completed, refresh, webhook sync).
    const unsubscribe = bridge.onChange((s) => {
      if (!cancelled) setState(s);
    });

    return () => {
      cancelled = true;
      try {
        unsubscribe();
      } catch {
        /* ignore — bridge may already be torn down */
      }
    };
  }, []);

  // Re-check when the window regains focus (e.g. returning from the external
  // browser checkout) so the paywall unlocks automatically after a purchase.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocus = () => {
      const b = getBridge();
      if (!b) return;
      b.refresh().then((s) => setState(s)).catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const buy = useCallback(async (plan: BuyablePlan) => {
    const bridge = getBridge();
    if (!bridge) {
      console.info("[useLicense] buy() called without a bridge — no-op (web/dev).");
      return;
    }
    try {
      await bridge.buy(plan);
    } catch (err) {
      console.warn("[useLicense] buy failed:", err);
    }
  }, []);

  const openPortal = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) {
      console.info("[useLicense] openPortal() called without a bridge — no-op (web/dev).");
      return;
    }
    try {
      await bridge.openPortal();
    } catch (err) {
      console.warn("[useLicense] openPortal failed:", err);
    }
  }, []);

  const refresh = useCallback(async (): Promise<LicenseState> => {
    const bridge = getBridge();
    if (!bridge) {
      console.info("[useLicense] refresh() called without a bridge — no-op (web/dev).");
      return stateRef.current;
    }
    try {
      const next = await bridge.refresh();
      setState(next);
      return next;
    } catch (err) {
      console.warn("[useLicense] refresh failed:", err);
      return stateRef.current;
    }
  }, []);

  const recordUsage = useCallback(async (count: number): Promise<LicenseState> => {
    const bridge = getBridge();
    if (!bridge) return stateRef.current;
    try {
      const next = await bridge.recordUsage(count);
      setState(next);
      return next;
    } catch (err) {
      console.warn("[useLicense] recordUsage failed:", err);
      return stateRef.current;
    }
  }, []);

  const isPaid = state.status === "active";
  const isTrial = state.status === "trial";
  const isActive = isPaid; // legacy alias
  const entitled = isPaid || isTrial;
  const trialRemaining = Math.max(0, state.trialLimit - state.trialUsed);

  return {
    state,
    loading,
    hasBridge,
    isActive,
    isPaid,
    isTrial,
    entitled,
    trialRemaining,
    buy,
    openPortal,
    refresh,
    recordUsage,
  };
}
