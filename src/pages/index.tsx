import { useState, useEffect } from "react";
import Head from "next/head";
import FilterForm from "@/components/FilterForm";
import MessageForm from "@/components/MessageForm";
import StatusPanel from "@/components/StatusPanel";
import ContactedList from "@/components/ContactedList";
import ScheduleForm from "@/components/ScheduleForm";
import Onboarding, { useOnboarding } from "@/components/Onboarding";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useLang } from "@/hooks/useLang";
import { type Lang } from "@/lib/i18n";
import {
  DEFAULT_FILTERS, DEFAULT_FILTER_TOGGLES,
  DEFAULT_CREDENTIALS, DEFAULT_CONTACT_MESSAGE, STORAGE_KEYS,
} from "@/utils/storage";
import type { AutomationState, RunAutomationRequest } from "@/types";

const INITIAL_STATE: AutomationState = { status: "idle", listingsFound: 0, requestsSent: 0, logs: [] };
type Tab = "filters" | "message" | "contacted" | "schedule";

const LANG_FLAGS: Record<Lang, string> = { de: "🇩🇪", en: "🇬🇧", es: "🇪🇸" };
const LANG_LABELS: Record<Lang, string> = { de: "DE", en: "EN", es: "ES" };

export default function Home() {
  const { lang, setLang, t } = useLang();
  const { show: showOnboarding, complete: completeOnboarding, reopen: reopenOnboarding } = useOnboarding();
  const [activeTab, setActiveTab] = useState<Tab>("filters");
  const [automationState, setAutomationState] = useState<AutomationState>(INITIAL_STATE);

  const [filters, setFilters] = useLocalStorage(STORAGE_KEYS.FILTERS, DEFAULT_FILTERS);
  const [filterToggles, setFilterToggles] = useLocalStorage(STORAGE_KEYS.FILTER_TOGGLES, DEFAULT_FILTER_TOGGLES);
  const [credentials, setCredentials] = useLocalStorage(STORAGE_KEYS.CREDENTIALS, DEFAULT_CREDENTIALS);
  const [contactMessage, setContactMessage] = useLocalStorage(STORAGE_KEYS.CONTACT_MESSAGE, DEFAULT_CONTACT_MESSAGE);

  // One-time migration: drop legacy email/password fields that older versions
  // stored in localStorage; only isPremiumAccount is used now.
  useEffect(() => {
    setCredentials((prev) => ({ isPremiumAccount: prev.isPremiumAccount }));
  }, [setCredentials]);

  const addLog = (level: AutomationState["logs"][number]["level"], message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setAutomationState((prev) => ({ ...prev, logs: [...prev.logs, { timestamp, level, message }] }));
  };

  const handleStart = async () => {
    if (!filters.location.trim()) { alert(t.locationLabel + "?"); return; }
    setAutomationState({ ...INITIAL_STATE, status: "running" });
    addLog("info", t.running);
    const body: RunAutomationRequest = { config: { filters, filterToggles, credentials, contactMessage } };
    try {
      const res = await fetch("/api/run-automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      addLog(res.ok ? "info" : "error", data.message);
      setAutomationState((prev) => ({ ...prev, status: res.ok ? "done" : "error" }));
    } catch (err) {
      addLog("error", String(err));
      setAutomationState((prev) => ({ ...prev, status: "error" }));
    }
  };

  const handleStop = async () => {
    addLog("warn", "Stop angefordert…");
    setAutomationState((prev) => ({ ...prev, status: "paused" }));
    try {
      await fetch("/api/stop-automation", { method: "POST" });
    } catch { /* ignore */ }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "filters",   label: t.tabFilters   },
    { id: "message",   label: t.tabMessage   },
    { id: "contacted", label: t.tabContacted },
    { id: "schedule",  label: t.tabSchedule  },
  ];

  return (
    <>
      <Head>
        <title>{t.appTitle}</title>
      </Head>
      {showOnboarding && <Onboarding t={t} onComplete={completeOnboarding} />}
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{t.heroTitle}</h1>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                {t.compatibleBadge}
              </span>
              <p className="mt-2 text-sm text-gray-500 max-w-xl">{t.appSubtitle}</p>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {([t.heroBullet1, t.heroBullet2, t.heroBullet3, t.heroBullet4] as string[]).map((b) => (
                  <li key={b} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <svg className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            {/* Setup guide + Language switcher */}
            <div className="flex items-center gap-2">
            <button
              onClick={reopenOnboarding}
              className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-gray-500 shadow-sm hover:text-gray-700 hover:bg-gray-50"
              title={t.onboardingOpenGuide}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Setup
            </button>
            <div className="flex items-center gap-1 rounded-lg border bg-white p-1 shadow-sm">
              {(["de", "en", "es"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  title={l.toUpperCase()}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    lang === l
                      ? "bg-blue-600 text-white"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <span>{LANG_FLAGS[l]}</span>
                  <span>{LANG_LABELS[l]}</span>
                </button>
              ))}
            </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left — config */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b overflow-x-auto">
                  {tabs.map((tab) => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 py-3 text-xs font-medium whitespace-nowrap px-2 transition-colors ${
                        activeTab === tab.id
                          ? "border-b-2 border-blue-600 text-blue-600"
                          : "text-gray-500 hover:text-gray-700"
                      }`}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Panels */}
                <div className="p-5">
                  {activeTab === "filters"   && <FilterForm   filters={filters} toggles={filterToggles} onFiltersChange={setFilters} onTogglesChange={setFilterToggles} isPremiumAccount={credentials.isPremiumAccount} onPremiumChange={(v) => setCredentials({ ...credentials, isPremiumAccount: v })} t={t} />}
                  {activeTab === "message"   && <MessageForm message={contactMessage} onChange={setContactMessage} t={t} />}
                  {activeTab === "contacted" && <ContactedList t={t} />}
                  {activeTab === "schedule"  && <ScheduleForm t={t} appConfig={{ filters, filterToggles, credentials, contactMessage }} />}
                </div>
              </div>

              {/* Start button */}
              <button type="button" onClick={handleStart}
                disabled={automationState.status === "running"}
                className="w-full rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
                {automationState.status === "running" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t.running}
                  </span>
                ) : t.startBtn}
              </button>
            </div>

            {/* Right — status */}
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <StatusPanel state={automationState} onStop={handleStop} t={t} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
