// ---------------------------------------------------------------------------
// electron/licensing/config.ts
//
// Central, single-source-of-truth configuration for the licensing layer:
//   - the public Firebase web config (safe to ship — it is an identifier,
//     NOT a secret; authorization is enforced by Firestore security rules)
//   - the Cloud Function endpoints used to START a checkout and to OPEN the
//     Paddle customer portal / cancel flow
//
// IMPORTANT: nothing in this file is a secret. The Paddle secret API key and
// the Paddle webhook signing secret live ONLY in the Firebase Functions
// backend (Google Secret Manager). The desktop app never sees them.
//
// Compiles to CommonJS (dist-electron/licensing/config.js).
// ---------------------------------------------------------------------------

/**
 * Public Firebase web config. These values are identifiers, not secrets, and
 * are safe to bundle into the shipped Electron app. Read-only access to the
 * `licenses/{machineId}` document is granted by Firestore security rules.
 *
 * Each value can be overridden at runtime via an environment variable so the
 * same build can target a staging project without a recompile.
 */
export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBHw9KamMXIH-PHMCj1P00NxKYn3wMk9XY",
  authDomain:
    process.env.FIREBASE_AUTH_DOMAIN || "wohnung-finder-c0972.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "wohnung-finder-c0972",
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET || "wohnung-finder-c0972.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "776531525408",
  appId:
    process.env.FIREBASE_APP_ID || "1:776531525408:web:17a8967ca64158dd3b6145",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-G2EBSF0G94",
} as const;

/**
 * Base URL of the deployed Cloud Functions (the `https` trigger region/host).
 * For Firebase Cloud Functions v2 this typically looks like:
 *   https://<region>-<project-id>.cloudfunctions.net
 * or a custom domain if you put the functions behind Hosting rewrites.
 */
export const functionsBaseUrl =
  process.env.LICENSE_FUNCTIONS_BASE_URL ||
  "https://us-central1-wohnung-finder-c0972.cloudfunctions.net";

/**
 * Cloud Function that creates a Paddle transaction (server-side, with the
 * machineId stamped into `custom_data`) and returns its `checkout.url`.
 * The desktop app opens that URL in the SYSTEM browser via shell.openExternal.
 */
export const createCheckoutUrl = `${functionsBaseUrl}/createCheckout`;

/**
 * Cloud Function that mints a fresh, authenticated Paddle Customer Portal
 * session for this machine's customer and returns a deep link (overview or the
 * "easy cancel" cancellation form). Never cache the returned URL.
 */
export const customerPortalUrl = `${functionsBaseUrl}/customerPortal`;

/**
 * Cloud Function that increments this machine's free-trial contact counter
 * (server-authoritative, so it can't be reset by clearing local data).
 */
export const recordTrialUsageUrl = `${functionsBaseUrl}/recordTrialUsage`;

/**
 * The Firestore collection holding one license document per machineId.
 * The document id is the machineId; the doc is publicly readable by id.
 */
export const LICENSES_COLLECTION = "licenses";

/**
 * Free-trial limit: number of contact requests allowed before the paywall.
 * MUST match TRIAL_LIMIT in firebase/functions/index.js.
 */
export const TRIAL_LIMIT = 20;

// ---------------------------------------------------------------------------
// Paddle public identifiers (price IDs + client token). NOT secrets.
// ---------------------------------------------------------------------------

/**
 * Paddle Billing price IDs (pri_...). Public catalogue identifiers passed to the
 * `createCheckout` Cloud Function (or used to build a hosted-checkout deep link).
 * Overridable per-environment via env so one build can target sandbox/staging.
 *
 * - `monthly`   -> recurring subscription price
 * - `lifetime`  -> one-time purchase price
 * These map onto the LicensePlan values ("monthly" | "lifetime") used elsewhere.
 */
export const PADDLE_PRICE_IDS = {
  monthly: process.env.PADDLE_PRICE_ID_MONTHLY || "<<PADDLE_PRICE_ID_MONTHLY>>",
  lifetime: process.env.PADDLE_PRICE_ID_LIFETIME || "<<PADDLE_PRICE_ID_LIFETIME>>",
} as const;

/**
 * Paddle client-side token (test_.../live_...). Public and safe to ship; used by
 * Paddle.js on the hosted checkout page. This is NOT the secret API key (that
 * lives only in the Firebase Functions backend / Secret Manager).
 */
export const PADDLE_CLIENT_TOKEN =
  process.env.PADDLE_CLIENT_TOKEN || "<<PADDLE_CLIENT_TOKEN>>";

// ---------------------------------------------------------------------------
// Licensing behaviour constants
// ---------------------------------------------------------------------------

/**
 * Reads a non-negative-integer env var, falling back to `fallback` when unset,
 * empty, or not a finite non-negative integer.
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * How many days the app keeps working offline (without a successful license
 * refresh from Firestore) before it locks. Covers transient network/outage
 * conditions so a paying user is never abruptly locked out. The offline-grace
 * logic itself lives in the verify/state layer; this is the single source for
 * the threshold.
 */
export const OFFLINE_GRACE_DAYS = envInt("OFFLINE_GRACE_DAYS", 7);

/**
 * How often (in milliseconds) the app re-checks the license document while
 * running. Defaults to 6 hours.
 */
export const LICENSE_REFRESH_INTERVAL_MS = envInt(
  "LICENSE_REFRESH_INTERVAL_MS",
  6 * 60 * 60 * 1000,
);

/**
 * Per-request timeout (in milliseconds) for license reads and backend calls so
 * a hung network request cannot block app startup indefinitely.
 */
export const LICENSE_REQUEST_TIMEOUT_MS = envInt(
  "LICENSE_REQUEST_TIMEOUT_MS",
  15 * 1000,
);

/**
 * Salt mixed into the machineId hash so the value cannot be correlated across
 * other apps that use node-machine-id. Bump the suffix on a breaking change.
 * Consumed by identity.ts (getStableMachineId).
 */
export const MACHINE_ID_SALT =
  process.env.MACHINE_ID_SALT || "immoscout-automation:v1";

// ---------------------------------------------------------------------------
// Fail-open guard
// ---------------------------------------------------------------------------

/**
 * Returns true when the licensing gate should be BYPASSED (treated as active):
 *   - explicitly via LICENSE_DEV_BYPASS=1 (local development), or
 *   - because the app is not provisioned yet (placeholder Firebase config still
 *     in place) — so `npm run electron:dev` and pre-setup builds are never
 *     locked behind a paywall pointing at a non-existent backend.
 *
 * Once you bake the real firebaseConfig (apiKey no longer starts with "<<"),
 * the gate activates automatically.
 */
export function isLicensingBypassed(): boolean {
  if (process.env.LICENSE_DEV_BYPASS === "1") return true;
  // Not fully provisioned yet: Firebase config OR the Cloud Functions URL still
  // contains a placeholder. The gate only activates once BOTH are real, so
  // setting the Firebase config alone (before deploying functions) does not
  // lock the desktop app.
  if (firebaseConfig.apiKey.startsWith("<<")) return true;
  if (functionsBaseUrl.includes("<<")) return true;
  return false;
}
