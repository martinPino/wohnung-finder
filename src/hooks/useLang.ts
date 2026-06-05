import { useState, useEffect } from "react";
import { translations, type Lang, type T } from "@/lib/i18n";

const LANG_KEY = "immoscout:lang";

export function useLang(): { lang: Lang; setLang: (l: Lang) => void; t: T } {
  const [lang, setLangState] = useState<Lang>("de");

  useEffect(() => {
    const stored = localStorage.getItem(LANG_KEY) as Lang | null;
    if (stored && stored in translations) setLangState(stored);
  }, []);

  const setLang = (l: Lang) => {
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  };

  return { lang, setLang, t: translations[lang] };
}
