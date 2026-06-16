import { useSyncExternalStore } from "react";
import { translations, type Lang, type T } from "@/lib/i18n";

const LANG_KEY = "immoscout:lang";

// ---------------------------------------------------------------------------
// Shared language store.
//
// Every component that calls useLang() must observe the SAME current language,
// so switching it in one place (header switcher, in-gate switcher) updates the
// whole UI — including components that call useLang() themselves rather than
// receiving `t` as a prop (LicenseGate, ManageSubscriptionLink). A per-hook
// useState does not do that; a tiny module-level store subscribed via
// useSyncExternalStore does.
// ---------------------------------------------------------------------------

let current: Lang = "de";
const listeners = new Set<() => void>();

function readStored(): Lang {
  if (typeof window === "undefined") return current;
  const stored = localStorage.getItem(LANG_KEY) as Lang | null;
  return stored && stored in translations ? stored : current;
}

// Initialise from storage as soon as this module loads on the client.
if (typeof window !== "undefined") {
  current = readStored();
}

function setLang(l: Lang): void {
  if (!(l in translations)) return;
  if (typeof window !== "undefined") localStorage.setItem(LANG_KEY, l);
  if (l === current) return;
  current = l;
  listeners.forEach((fn) => fn());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Keep tabs/windows in sync when the language is changed elsewhere.
  const onStorage = (e: StorageEvent) => {
    if (e.key === LANG_KEY) {
      current = readStored();
      cb();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function useLang(): { lang: Lang; setLang: (l: Lang) => void; t: T } {
  const lang = useSyncExternalStore(
    subscribe,
    () => current,
    () => "de" as Lang // server snapshot — deterministic for SSR/hydration
  );
  return { lang, setLang, t: translations[lang] };
}
