// ---------------------------------------------------------------------------
// electron/licensing/paddle.ts
//
// Desktop-side launchers for the two Paddle Billing flows. Neither talks to
// Paddle directly — they call our Firebase Cloud Functions, which hold the
// secret Paddle API key and stamp the AUTHORITATIVE machineId into the
// transaction's custom_data. The desktop app only ever opens the resulting URL
// in the SYSTEM browser via shell.openExternal.
//
//   buy(plan):    POST {machineId, plan} -> createCheckout Cloud Function,
//                 receive {url} (a Paddle checkout.url, i.e. the default
//                 payment link + ?_ptxn=<txn_id>), then shell.openExternal(url).
//
//   openPortal(): POST {machineId} -> customerPortal Cloud Function, receive
//                 {url} (a freshly minted, authenticated Paddle Customer Portal
//                 / "easy cancel" / Kündigungsbutton deep link), then
//                 shell.openExternal(url). Never cache this URL — it carries a
//                 short-lived auth token.
//
// `plan` is the renderer's BuyablePlan ("monthly" | "lifetime"); it is passed
// through to the backend, which maps it to the correct Paddle price id.
//
// Compiles to CommonJS (dist-electron/licensing/paddle.js).
// ---------------------------------------------------------------------------

import { shell } from "electron";
import { createCheckoutUrl, customerPortalUrl } from "./config";
import { getStableMachineId } from "./identity";

/** Purchasable plan ids — mirrors BuyablePlan in src/types/license.d.ts. */
export type BuyablePlan = "monthly" | "lifetime";

/** POST JSON to a Cloud Function and return the parsed JSON body. */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Request to ${url} failed: ${res.status} ${res.statusText}${
        text ? ` — ${text}` : ""
      }`
    );
  }

  return (await res.json()) as T;
}

/**
 * Start a checkout for `plan`. Asks the backend to create a Paddle transaction
 * (with this machine's id authoritatively stamped into custom_data), then opens
 * the returned checkout URL in the user's default browser.
 *
 * Resolves once the browser has been asked to open; purchase completion arrives
 * later via the webhook -> Firestore -> license:changed path.
 */
export async function buy(plan: BuyablePlan): Promise<void> {
  const machineId = getStableMachineId();

  const { url } = await postJson<{ url: string }>(createCheckoutUrl, {
    machineId,
    plan,
  });

  if (!url) {
    throw new Error(
      "createCheckout did not return a checkout URL. Ensure a Paddle default " +
        "payment link is configured and its domain is approved."
    );
  }

  await shell.openExternal(url);
}

/**
 * Open the Paddle Customer Portal for this machine's customer — used for the
 * German "easy cancel" (Kündigungsbutton) flow and payment-method changes.
 * The backend mints a fresh authenticated session each time.
 */
export async function openPortal(): Promise<void> {
  const machineId = getStableMachineId();

  const { url } = await postJson<{ url: string }>(customerPortalUrl, {
    machineId,
  });

  if (!url) {
    throw new Error(
      "customerPortal did not return a URL. The machine may have no associated " +
        "Paddle customer/subscription yet."
    );
  }

  await shell.openExternal(url);
}
