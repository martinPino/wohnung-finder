import { useState } from "react";
import Head from "next/head";
import FilterForm from "@/components/FilterForm";
import CredentialsForm from "@/components/CredentialsForm";
import MessageForm from "@/components/MessageForm";
import StatusPanel from "@/components/StatusPanel";
import ContactedList from "@/components/ContactedList";
import ScheduleForm from "@/components/ScheduleForm";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useLang } from "@/hooks/useLang";
import { type Lang } from "@/lib/i18n";
import {
  DEFAULT_FILTERS, DEFAULT_FILTER_TOGGLES,
  DEFAULT_CREDENTIALS, DEFAULT_CONTACT_MESSAGE, STORAGE_KEYS,
} from "@/utils/storage";
import type { AutomationState, RunAutomationRequest } from "@/types";

const INITIAL_STATE: AutomationState = { status: "idle", listingsFound: 0, requestsSent: 0, logs: [] };
type Tab = "filters" | "account" | "message" | "contacted" | "schedule";

const LANG_FLAGS: Record<Lang, string> = { de: "🇩🇪", en: "🇬🇧", es: "🇪🇸" };
const LANG_LABELS: Record<Lang, string> = { de: "DE", en: "EN", es: "ES" };

export default function Home() {
  const { lang, setLang, t } = useLang();
  const [activeTab, setActiveTab] = useState<Tab>("filters");
  const [automationState, setAutomationState] = useState<AutomationState>(INITIAL_STATE);

  const [filters, setFilters] = useLocalStorage(STORAGE_KEYS.FILTERS, DEFAULT_FILTERS);
  const [filterToggles, setFilterToggles] = useLocalStorage(STORAGE_KEYS.FILTER_TOGGLES, DEFAULT_FILTER_TOGGLES);
  const [credentials, setCredentials] = useLocalStorage(STORAGE_KEYS.CREDENTIALS, DEFAULT_CREDENTIALS);
  const [contactMessage, setContactMessage] = useLocalStorage(STORAGE_KEYS.CONTACT_MESSAGE, DEFAULT_CONTACT_MESSAGE);

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
    { id: "account",   label: t.tabAccount   },
    { id: "message",   label: t.tabMessage   },
    { id: "contacted", label: t.tabContacted },
    { id: "schedule",  label: t.tabSchedule  },
  ];

  return (
    <>
      <Head>
        <title>{t.appTitle}</title>
      </Head>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t.appTitle}</h1>
              <p className="mt-1 text-sm text-gray-500">{t.appSubtitle}</p>
            </div>

            {/* Language switcher */}
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
                  {activeTab === "filters"   && <FilterForm   filters={filters} toggles={filterToggles} onFiltersChange={setFilters} onTogglesChange={setFilterToggles} t={t} />}
                  {activeTab === "account"   && <CredentialsForm credentials={credentials} onChange={setCredentials} t={t} />}
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
