// ---------------------------------------------------------------------------
// electron/licensing/license.ts
//
// The verification core of the licensing layer. verifyLicense() answers the
// single question the rest of the app cares about: "is this machine allowed to
// run the automation right now?" — returning a LicenseState exactly per the
// renderer contract (src/types/license.d.ts).
//
// Strategy (online-first, offline-tolerant, anti-tamper):
//   1. ONLINE: read licenses/{machineId} from Firestore with a hard timeout so
//      a hanging network never blocks app startup. On success we trust the
//      store, refresh the local cache (status, planType, expiresAt,
//      lastVerifiedAt, lastSeenClock), and return the derived state — after
//      locally enforcing expiresAt (the webhook may lag a renewal/lapse).
//   2. OFFLINE / error: fall back to the cached snapshot, but only within a
//      7-day grace window measured from the last SUCCESSFUL verification. If
//      the user has been offline longer than the grace, we downgrade to
//      inactive so an indefinitely-offline machine can't run forever on a
//      single past check.
//   3. CLOCK-ROLLBACK GUARD: the grace window is time-based, so a user could
//      set the system clock back to stay "inside" the window forever. We
//      persist the highest wall-clock time we have ever observed
//      (lastSeenClock); if the current clock is meaningfully BEHIND it, we
//      treat the offline grace as void (the clock was tampered with) and
//      downgrade to expired.
//
// All persistence is via electron-store 8.x (CommonJS-safe, synchronous),
// stored in userData/license-cache.json — separate from identity.json.
//
// Compiles to CommonJS (dist-electron/licensing/license.js).
// ---------------------------------------------------------------------------

import Store from "electron-store";

import { getStableMachineId } from "./identity";
import { getLicenseDoc, type LicenseDoc } from "./firebase";
import {
  OFFLINE_GRACE_DAYS,
  LICENSE_REQUEST_TIMEOUT_MS,
  isLicensingBypassed,
} from "./config";
import type { LicenseState, LicenseStatus, LicensePlan } from "./types";

// ---------------------------------------------------------------------------
// Tunables (single source of truth in config.ts)
// ---------------------------------------------------------------------------

/** Hard cap on the online Firestore read so startup never hangs (ms). */
const ONLINE_READ_TIMEOUT_MS = LICENSE_REQUEST_TIMEOUT_MS;

/** Offline grace period: how long a cached "active" license keeps working
 *  without a fresh successful verification. Default 7 days. */
const OFFLINE_GRACE_MS = OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000;

/** Allowed backwards clock drift before we consider the clock rolled back.
 *  A small slack avoids false positives from NTP corrections / DST. 5 min. */
const CLOCK_ROLLBACK_SLACK_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Cache shape (userData/license-cache.json)
// ---------------------------------------------------------------------------

interface LicenseCache {
  /** Last known lifecycle status from a successful verification. */
  status?: LicenseStatus;
  /** Last known plan. Stored under `planType` per the cache contract. */
  planType?: LicensePlan;
  /** Paddle customer id, cached so the portal works offline. */
  customerId?: string | null;
  /** Paddle subscription id, cached for the cancel deep link. */
  subscriptionId?: string | null;
  /** ISO entitlement expiry (monthly period end); null/absent for lifetime. */
  expiresAt?: string | null;
  /** Epoch millis of the last SUCCESSFUL online verification. */
  lastVerifiedAt?: number;
  /** Highest wall-clock (epoch millis) ever observed — clock-rollback guard. */
  lastSeenClock?: number;
}

const cache = new Store<LicenseCache>({ name: "license-cache" });

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Coerce an arbitrary stored status into the typed union, defaulting safely. */
function normalizeStatus(value: unknown): LicenseStatus {
  return value === "active" || value === "expired" || value === "inactive"
    ? value
    : "inactive";
}

/** Coerce an arbitrary stored plan into the typed union, defaulting to none. */
function normalizePlan(value: unknown): LicensePlan {
  return value === "monthly" || value === "lifetime" ? value : "none";
}

/**
 * Returns true if `expiresAt` is in the past relative to `now`. Lifetime plans
 * have no expiry (null/absent) and therefore never expire. An unparseable date
 * is treated as NOT expired (we don't want a malformed field to lock out a
 * paying user; the server status remains the primary signal).
 */
function isExpired(expiresAt: string | null | undefined, now: number): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  return t <= now;
}

/**
 * Wraps a promise with a timeout. Rejects with a tagged error if the inner
 * promise does not settle in time, so verifyLicense() can fall back to cache.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`license read timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Updates lastSeenClock to the max of its current value and `now`, so the
 * watermark only ever moves forward. Returns the watermark that was in effect
 * BEFORE this call (used to detect a rollback).
 */
function advanceClockWatermark(now: number): number {
  const prev = cache.get("lastSeenClock") ?? 0;
  if (now > prev) {
    cache.set("lastSeenClock", now);
  }
  return prev;
}

// ---------------------------------------------------------------------------
// Online path
// ---------------------------------------------------------------------------

/**
 * Persists a fresh, successful verification into the cache and derives the
 * outward LicenseState, enforcing expiresAt locally so a lapsed monthly plan
 * is reflected even if the webhook hasn't flipped `status` yet.
 */
function applyOnlineResult(
  machineId: string,
  docData: LicenseDoc | null,
  now: number
): LicenseState {
  // No document => no purchase recorded for this machine yet.
  // Canonical field names written by the webhook: licenseStatus / planType.
  let status = normalizeStatus(docData?.licenseStatus);
  const plan = normalizePlan(docData?.planType);
  const customerId = docData?.customerId ?? null;
  const subscriptionId = docData?.subscriptionId ?? null;
  const expiresAt = docData?.expiresAt ?? null;

  // Local expiry enforcement: an "active" doc whose period has ended is treated
  // as expired regardless of the stored status (webhook lag / failed renewal).
  if (status === "active" && isExpired(expiresAt, now)) {
    status = "expired";
  }

  // Refresh the cache with this verified snapshot.
  cache.set("status", status);
  cache.set("planType", plan);
  cache.set("customerId", customerId);
  cache.set("subscriptionId", subscriptionId);
  cache.set("expiresAt", expiresAt);
  cache.set("lastVerifiedAt", now);
  advanceClockWatermark(now);

  return {
    status,
    plan,
    machineId,
    customerId,
    subscriptionId,
    lastCheckedAt: new Date(now).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Offline / fallback path
// ---------------------------------------------------------------------------

/**
 * Builds a LicenseState from the cached snapshot when the online read failed.
 * Applies, in order:
 *   - clock-rollback guard (downgrade to "expired" if the clock moved back),
 *   - 7-day offline grace (downgrade to "inactive" once grace elapses),
 *   - local expiresAt enforcement.
 */
function buildOfflineState(machineId: string, now: number): LicenseState {
  const cachedStatus = normalizeStatus(cache.get("status"));
  const plan = normalizePlan(cache.get("planType"));
  const customerId = cache.get("customerId") ?? null;
  const subscriptionId = cache.get("subscriptionId") ?? null;
  const expiresAt = cache.get("expiresAt") ?? null;
  const lastVerifiedAt = cache.get("lastVerifiedAt");

  // The most recent successful sync we can report to the renderer. Null if we
  // have never verified online (fresh install that booted offline).
  const lastCheckedAt =
    typeof lastVerifiedAt === "number"
      ? new Date(lastVerifiedAt).toISOString()
      : null;

  // Advance (and read the previous) clock watermark. Do this BEFORE the grace
  // math so a rollback can't help the user re-enter the window.
  const prevWatermark = advanceClockWatermark(now);

  // If we never had a successful verification, there is nothing to grant.
  if (typeof lastVerifiedAt !== "number") {
    return {
      status: cachedStatus === "active" ? "inactive" : cachedStatus,
      plan,
      machineId,
      customerId,
      subscriptionId,
      lastCheckedAt,
    };
  }

  // --- Clock-rollback guard -------------------------------------------------
  // If the current clock is meaningfully behind the highest value we have ever
  // seen, the system clock was set backwards. A time-based grace window is then
  // untrustworthy, so we void the offline grace and report expired.
  const clockRolledBack = now < prevWatermark - CLOCK_ROLLBACK_SLACK_MS;
  if (clockRolledBack) {
    return {
      status: "expired",
      plan,
      machineId,
      customerId,
      subscriptionId,
      lastCheckedAt,
    };
  }

  // --- 7-day offline grace --------------------------------------------------
  // Measure elapsed time from the last successful verification. We clamp to >=0
  // so a forward clock jump never produces a negative age.
  const offlineAge = Math.max(0, now - lastVerifiedAt);
  if (offlineAge > OFFLINE_GRACE_MS) {
    // Grace exhausted: stop honoring a stale "active" cache.
    return {
      status: "inactive",
      plan,
      machineId,
      customerId,
      subscriptionId,
      lastCheckedAt,
    };
  }

  // --- Within grace: honor the cache, but still enforce expiresAt -----------
  let status = cachedStatus;
  if (status === "active" && isExpired(expiresAt, now)) {
    status = "expired";
  }

  return {
    status,
    plan,
    machineId,
    customerId,
    subscriptionId,
    lastCheckedAt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verifies the current machine's license and returns its state.
 *
 * Never throws: any failure (offline, timeout, SDK error) is handled by
 * falling back to the cached snapshot under the offline-grace + clock-rollback
 * rules. The returned object matches the renderer LicenseState contract
 * exactly.
 *
 * @returns The resolved {@link LicenseState} for this machine.
 */
export async function verifyLicense(): Promise<LicenseState> {
  const machineId = getStableMachineId();
  const now = Date.now();

  // Fail-open while unprovisioned (placeholder Firebase config) or when
  // LICENSE_DEV_BYPASS=1. Keeps `npm run electron:dev` and pre-setup builds
  // usable instead of paywalled against a non-existent backend.
  if (isLicensingBypassed()) {
    return {
      status: "active",
      plan: "lifetime",
      machineId,
      customerId: null,
      subscriptionId: null,
      lastCheckedAt: new Date(now).toISOString(),
    };
  }

  try {
    // Online read with a hard timeout so startup can't hang on the network.
    const docData = await withTimeout(
      getLicenseDoc(machineId),
      ONLINE_READ_TIMEOUT_MS
    );
    return applyOnlineResult(machineId, docData, now);
  } catch (err) {
    // Offline or read failed — fall back to the cached snapshot under grace.
    // eslint-disable-next-line no-console
    console.warn(
      "[license] online verification failed, using cached state:",
      err instanceof Error ? err.message : err
    );
    return buildOfflineState(machineId, now);
  }
}
