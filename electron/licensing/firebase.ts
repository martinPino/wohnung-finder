// ---------------------------------------------------------------------------
// electron/licensing/firebase.ts
//
// Initializes the Firebase JS CLIENT SDK inside the Electron MAIN (Node)
// process and exposes a single read-only helper, getLicenseDoc(machineId),
// that fetches the `licenses/{machineId}` document.
//
// WHY THE CLIENT SDK (and NOT firebase-admin):
//   - The desktop app only needs READ access to one document by id, which the
//     Firestore security rules already grant (`allow get: if true`).
//   - The Admin SDK requires a service-account private key that bypasses all
//     security rules. Shipping that key inside an Electron app (the asar is
//     trivially unpacked) would leak a project-wide credential. We must NOT do
//     that. The public web config (apiKey/projectId/appId) is an identifier,
//     not a secret, and is safe to bundle.
//
// The Firebase JS client SDK (modular v9+) officially supports Cloud Firestore
// on Node.js 18+ (Electron 31 ships a new-enough Node). Offline persistence is
// the only Firestore feature unavailable in Node, and we don't need it — a
// single getDoc is all we do here. The offline grace period is handled one
// level up in license.ts via an electron-store cache.
//
// Compiles to CommonJS (dist-electron/licensing/firebase.js).
// ---------------------------------------------------------------------------

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  type Firestore,
} from "firebase/firestore";

import { firebaseConfig, LICENSES_COLLECTION } from "./config";

// ---------------------------------------------------------------------------
// Firestore document shape
// ---------------------------------------------------------------------------

/**
 * Raw shape of a `licenses/{machineId}` document as written by the Paddle
 * webhook Cloud Function (firebase-admin, server-side). All fields are
 * optional/nullable because the document may be partially written, may not
 * exist at all (no purchase yet), or may originate from an older schema.
 *
 * CANONICAL field names — these must match exactly what the Paddle webhook
 * Cloud Function writes (firebase/functions/index.js -> buildLicenseFields):
 *   - licenseStatus:  "active" | "expired"  (entitlement lifecycle)
 *   - planType:       "monthly" | "lifetime"
 *   - customerId:     Paddle customer id ("ctm_...")     — for the portal
 *   - customerEmail:  buyer email (best effort)
 *   - subscriptionId: Paddle subscription id ("sub_...") — monthly only
 *   - expiresAt:      ISO timestamp the entitlement is valid until. For
 *                     monthly plans this is the current period end; for
 *                     lifetime it is null/absent (never expires).
 *   - updatedAt:      Firestore server timestamp of the last write (unused here).
 */
export interface LicenseDoc {
  licenseStatus?: string | null;
  planType?: string | null;
  customerId?: string | null;
  customerEmail?: string | null;
  subscriptionId?: string | null;
  expiresAt?: string | null;
  updatedAt?: unknown;
}

// ---------------------------------------------------------------------------
// Lazy singleton initialization
// ---------------------------------------------------------------------------

let firestore: Firestore | null = null;

/**
 * Returns a memoized Firestore handle, initializing the Firebase app exactly
 * once. Reuses an already-initialized default app if one exists (defensive —
 * the main process should only ever create one).
 */
function getDb(): Firestore {
  if (firestore) return firestore;

  const existing = getApps();
  const app: FirebaseApp =
    existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);

  firestore = getFirestore(app);
  return firestore;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads the license document for the given machineId from Firestore.
 *
 * @param machineId Salted-hash machine id (document id under `licenses/`).
 * @returns The parsed {@link LicenseDoc}, or `null` if no document exists for
 *          this machine (i.e. no purchase has been recorded yet).
 * @throws  Re-throws any network/SDK error so the caller (license.ts) can fall
 *          back to its cached state. This function deliberately does NOT
 *          swallow errors — distinguishing "offline" from "no purchase" is the
 *          caller's responsibility for the offline-grace logic.
 */
export async function getLicenseDoc(
  machineId: string
): Promise<LicenseDoc | null> {
  const db = getDb();
  const ref = doc(db, LICENSES_COLLECTION, machineId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return null;
  }

  return snap.data() as LicenseDoc;
}
