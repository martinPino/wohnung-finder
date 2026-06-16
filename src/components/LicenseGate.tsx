import { useState } from "react";
import { useLicense } from "@/hooks/useLicense";
import type { BuyablePlan } from "@/types/license";

// ---------------------------------------------------------------------------
// LicenseGate — full-screen paywall.
//
// Wrap the app with it: when the license is active (monthly or lifetime) it
// renders nothing and lets `children` through. When the license is inactive or
// expired it covers the screen with the two purchase plans, a license-restore
// button, and (for active monthly users — shown via the small footer link) an
// "Abo verwalten/kündigen" link that opens the Paddle customer portal.
//
// German copy throughout, to match the rest of the app.
// ---------------------------------------------------------------------------

interface LicenseGateProps {
  children: React.ReactNode;
}

/** Static plan descriptors rendered as the two purchase cards. */
const PLANS: {
  id: BuyablePlan;
  name: string;
  price: string;
  cadence: string;
  highlight: boolean;
  badge?: string;
  features: string[];
}[] = [
  {
    id: "monthly",
    name: "Monatlich",
    price: "9 €",
    cadence: "/ Monat",
    highlight: false,
    features: [
      "Voller Funktionsumfang",
      "Automatische Überwachung 24/7",
      "Jederzeit kündbar",
    ],
  },
  {
    id: "lifetime",
    name: "Lifetime",
    price: "29 €",
    cadence: "einmalig",
    highlight: true,
    badge: "Beliebt",
    features: [
      "Einmal zahlen, für immer nutzen",
      "Alle zukünftigen Updates inklusive",
      "Kein Abo, keine Kündigung nötig",
    ],
  },
];

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 flex-shrink-0 text-blue-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function LicenseGate({ children }: LicenseGateProps) {
  const { state, loading, hasBridge, isActive, buy, openPortal, refresh } = useLicense();
  const [busyPlan, setBusyPlan] = useState<BuyablePlan | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  // The paywall is a non-blocking OVERLAY: children ALWAYS render, so the web
  // build / `next dev` (no bridge) never flashes a license screen, and the gate
  // only covers the app inside Electron when the license is missing/expired.
  // While the first verification is still in flight (loading) we don't gate yet.
  const showGate = hasBridge && !loading && !isActive;
  const isExpired = state.status === "expired";

  const handleBuy = async (plan: BuyablePlan) => {
    setBusyPlan(plan);
    try {
      await buy(plan);
    } finally {
      // Re-enable the button; completion arrives later via onChange.
      setBusyPlan(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handlePortal = async () => {
    setPortalBusy(true);
    try {
      await openPortal();
    } finally {
      setPortalBusy(false);
    }
  };

  return (
    <>
      {children}
      {showGate && (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Lizenz aktivieren, um WohnungFinder zu nutzen
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">
            Wähle einen Plan, um die automatische Wohnungssuche freizuschalten.
            Die Lizenz ist an dieses Gerät gebunden.
          </p>
        </div>

        {/* Expired notice */}
        {isExpired && (
          <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-center text-sm text-yellow-800">
            Dein Abo ist abgelaufen oder wurde nicht verlängert. Bitte erneuere
            deine Lizenz, um WohnungFinder weiter zu nutzen.
          </div>
        )}

        {/* Plans */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {PLANS.map((plan) => {
            const isBusy = busyPlan === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${
                  plan.highlight ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200"
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 right-6 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-semibold text-white shadow-sm">
                    {plan.badge}
                  </span>
                )}

                <h2 className="text-lg font-semibold text-gray-900">{plan.name}</h2>

                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-sm font-medium text-gray-400">{plan.cadence}</span>
                </div>

                <ul className="mt-4 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckIcon />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => handleBuy(plan.id)}
                  disabled={busyPlan !== null}
                  className={`mt-6 w-full rounded-xl px-6 py-3 text-sm font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                    plan.highlight
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "border border-blue-600 bg-white text-blue-600 hover:bg-blue-50"
                  }`}
                >
                  {isBusy ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Weiterleitung…
                    </span>
                  ) : (
                    `${plan.name} kaufen`
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Restore / refresh */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            Bereits gekauft? Stelle deine Lizenz auf diesem Gerät wieder her.
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="mt-2 inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? "Wird geprüft…" : "Lizenz wiederherstellen/aktualisieren"}
          </button>
        </div>

        {/* Manage subscription — only meaningful for an existing monthly sub
            whose entitlement has lapsed (status expired) but who may still want
            to update payment / cancel. Shown when we have a customer/sub on file. */}
        {(state.customerId || state.subscriptionId) && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handlePortal}
              disabled={portalBusy}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-60"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {portalBusy ? "Wird geöffnet…" : "Abo verwalten/kündigen"}
            </button>
          </div>
        )}
      </div>
      </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ManageSubscriptionLink — small inline link for ACTIVE monthly subscribers to
// open the Paddle customer portal (manage / cancel). Mount this somewhere in
// the main app (e.g. the header) since LicenseGate hides itself when active.
// Renders nothing for lifetime users or when there is no subscription/bridge.
// ---------------------------------------------------------------------------

export function ManageSubscriptionLink({ className = "" }: { className?: string }) {
  const { state, isActive, hasBridge, openPortal } = useLicense();
  const [busy, setBusy] = useState(false);

  // Only monthly subscribers can manage/cancel; lifetime has no subscription.
  if (!hasBridge || !isActive || state.plan !== "monthly") return null;

  const handleClick = async () => {
    setBusy(true);
    try {
      await openPortal();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title="Abo verwalten oder kündigen"
      className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-700 disabled:opacity-60 ${className}`}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      </svg>
      {busy ? "Wird geöffnet…" : "Abo verwalten/kündigen"}
    </button>
  );
}
