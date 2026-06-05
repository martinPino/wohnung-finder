import { useEffect, useState } from "react";
import type { ContactedListing } from "@/types";
import type { T } from "@/lib/i18n";

interface ContactedListProps { t: T; }

export default function ContactedList({ t }: ContactedListProps) {
  const [listings, setListings] = useState<ContactedListing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contacted-listings");
      setListings(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchListings(); }, []);

  if (loading) return <p className="text-sm text-gray-400 py-4 text-center">…</p>;

  if (listings.length === 0) {
    return (
      <div className="py-8 text-center">
        <svg className="mx-auto h-10 w-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="mt-2 text-sm text-gray-400">{t.noContacted}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">
          {t.contactedTitle}
          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {listings.length}
          </span>
        </h2>
        <button onClick={fetchListings} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t.refresh}
        </button>
      </div>
      <div className="divide-y rounded-lg border bg-white overflow-hidden">
        {listings.map((l) => (
          <div key={l.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className="mt-0.5 flex-shrink-0 rounded-full bg-green-100 p-1.5">
              <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              {l.url ? (
                <a href={l.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 hover:underline truncate block">
                  {l.title || l.url}
                </a>
              ) : (
                <p className="text-sm font-medium text-gray-700 truncate">{l.title || l.id}</p>
              )}
              {l.url && <p className="text-xs text-gray-400 truncate mt-0.5">{l.url}</p>}
            </div>
            {l.sentAt && (
              <span className="flex-shrink-0 text-xs text-gray-400 mt-0.5">
                {new Date(l.sentAt).toLocaleDateString("de-DE", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
