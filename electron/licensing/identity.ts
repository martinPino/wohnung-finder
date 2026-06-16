// ---------------------------------------------------------------------------
// electron/licensing/identity.ts
//
// Produces a STABLE, privacy-preserving machineId used to key the license
// document in Firestore (`licenses/{machineId}`) and to stamp the Paddle
// checkout's custom_data on the backend.
//
// Strategy:
//   1. Read the raw OS install UUID via node-machine-id (machineIdSync(true)),
//      then SHA-256 it together with an app-specific salt so the value is not
//      correlatable across other apps that use the same library, and so the
//      raw OS UUID (PII) never leaves the device.
//   2. If node-machine-id throws (sandbox / missing dbus on Linux / locked
//      registry), fall back to a one-time random UUID persisted in
//      electron-store, so the install still has a stable identity.
//
// Dependency pins (CommonJS-safe for this dist-electron/main.js build):
//   node-machine-id@1.1.12  (ships its own types)
//   electron-store@8.2.0    (8.x is the last CommonJS/require()-compatible
//                            release; 9+/10/11 are ESM-only and throw
//                            ERR_REQUIRE_ESM under require())
//
// Compiles to CommonJS (dist-electron/licensing/identity.js).
// ---------------------------------------------------------------------------

import { machineIdSync } from "node-machine-id";
import Store from "electron-store";
import { createHash, randomUUID } from "crypto";
import { MACHINE_ID_SALT } from "./config";

type IdentityStore = { fallbackId?: string };

// App-specific salt so hash(rawOsUuid) cannot be correlated across apps.
// Single source of truth lives in config.ts (MACHINE_ID_SALT), overridable
// via the MACHINE_ID_SALT env var.
const APP_SALT = MACHINE_ID_SALT;

// userData/identity.json — synchronous, composes cleanly with machineIdSync.
const store = new Store<IdentityStore>({ name: "identity" });

// Cache the computed id for the process lifetime; it never changes at runtime.
let cachedMachineId: string | null = null;

/**
 * Returns a stable, salted SHA-256 machineId for this install.
 * Never throws; falls back to a persisted random UUID on any failure.
 */
export function getStableMachineId(): string {
  if (cachedMachineId) return cachedMachineId;

  try {
    // original=true -> raw OS UUID. We hash it with our salt and never persist
    // or transmit the raw value.
    const raw = machineIdSync(true);
    cachedMachineId = createHash("sha256")
      .update(raw + APP_SALT)
      .digest("hex");
  } catch {
    // node-machine-id failed: use / create a one-time persisted UUID.
    let id = store.get("fallbackId");
    if (!id) {
      id = randomUUID();
      store.set("fallbackId", id);
    }
    cachedMachineId = createHash("sha256")
      .update(id + APP_SALT)
      .digest("hex");
  }

  return cachedMachineId;
}
