import type { SearchFilters, FilterToggles } from "@/types";
import type { T } from "@/lib/i18n";

interface FilterFormProps {
  filters: SearchFilters;
  toggles: FilterToggles;
  onFiltersChange: (filters: SearchFilters) => void;
  onTogglesChange: (toggles: FilterToggles) => void;
  t: T;
}

type ToggleKey = keyof FilterToggles;

// Radius slider values
const RADIUS_VALUES = [5, 15, 25, 50, 100, 200];

function radiusIndexToValue(idx: number): number {
  return RADIUS_VALUES[Math.min(idx, RADIUS_VALUES.length - 1)];
}

function radiusValueToIndex(val: number): number {
  const closest = RADIUS_VALUES.reduce((prev, curr) =>
    Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev
  );
  return RADIUS_VALUES.indexOf(closest);
}

interface NumericField {
  key: ToggleKey;
  labelKey: keyof T;
  min?: number;
  unit?: string;
}

const NUMERIC_FIELDS: NumericField[] = [
  { key: "maxPriceEur",       labelKey: "priceLabel",   min: 0,  unit: "€/mo" },
  { key: "minSizeM2",         labelKey: "sizeLabel",    min: 1,  unit: "m²"   },
  { key: "minRooms",          labelKey: "roomsLabel",   min: 1               },
  { key: "maxListingAgeDays", labelKey: "ageLabel",     min: 1,  unit: "days" },
];

// Search summary pill
function SearchSummary({ filters, toggles, t }: { filters: SearchFilters; toggles: FilterToggles; t: T }) {
  const parts: string[] = [];
  if (filters.location) parts.push(filters.location);
  if (toggles.radiusKm) parts.push(`${filters.radiusKm} km`);
  if (toggles.maxPriceEur) parts.push(`Max €${filters.maxPriceEur.toLocaleString()}`);
  if (toggles.minRooms) parts.push(`${filters.minRooms}+ Zi.`);
  if (toggles.minSizeM2) parts.push(`${filters.minSizeM2}m²+`);

  if (parts.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <span className="font-medium">{t.searchSummary}:</span>
      <span>{parts.join(" · ")}</span>
    </div>
  );
}

export default function FilterForm({ filters, toggles, onFiltersChange, onTogglesChange, t }: FilterFormProps) {
  const setFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    onFiltersChange({ ...filters, [key]: value });

  const setToggle = (key: ToggleKey, value: boolean) =>
    onTogglesChange({ ...toggles, [key]: value });

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-gray-800">{t.filterTitle}</h2>

      {/* Search summary */}
      <SearchSummary filters={filters} toggles={toggles} t={t} />

      {/* Location */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t.locationLabel} <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={filters.location}
          onChange={(e) => setFilter("location", e.target.value)}
          placeholder={t.locationPlaceholder}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
        />
      </div>

      {/* Radius slider */}
      <div className={`space-y-2 rounded-xl border p-3 transition-all ${toggles.radiusKm ? "border-blue-100 bg-blue-50/50" : "border-gray-100 bg-gray-50 opacity-50"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={toggles.radiusKm}
              onClick={() => setToggle("radiusKm", !toggles.radiusKm)}
              className={`relative inline-flex h-4 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${toggles.radiusKm ? "bg-blue-600" : "bg-gray-300"}`}
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-200 ${toggles.radiusKm ? "translate-x-4" : "translate-x-0"}`} />
            </button>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t.radiusLabel}
              <span className="ml-1 text-gray-400 normal-case font-normal" title={t.radiusTooltip}>ⓘ</span>
            </span>
          </div>
          <span className="text-sm font-semibold text-blue-700 tabular-nums">
            {filters.radiusKm} km
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={RADIUS_VALUES.length - 1}
          step={1}
          disabled={!toggles.radiusKm}
          value={radiusValueToIndex(filters.radiusKm)}
          onChange={(e) => setFilter("radiusKm", radiusIndexToValue(Number(e.target.value)))}
          className="w-full accent-blue-600 disabled:opacity-40"
        />
        <div className="flex justify-between text-xs text-gray-400">
          {RADIUS_VALUES.map(v => <span key={v}>{v}</span>)}
        </div>
      </div>

      {/* Numeric filters */}
      <div className="space-y-2">
        {NUMERIC_FIELDS.map(({ key, labelKey, min, unit }) => (
          <div
            key={key}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
              toggles[key] ? "border-blue-100 bg-blue-50/50" : "border-gray-100 bg-gray-50 opacity-50"
            }`}
          >
            <button
              type="button"
              role="switch"
              aria-checked={toggles[key]}
              onClick={() => setToggle(key, !toggles[key])}
              className={`relative inline-flex h-4 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${toggles[key] ? "bg-blue-600" : "bg-gray-300"}`}
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-200 ${toggles[key] ? "translate-x-4" : "translate-x-0"}`} />
            </button>
            <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t[labelKey] as string}
            </span>
            <div className="relative">
              <input
                type="number"
                min={min}
                disabled={!toggles[key]}
                value={filters[key] as number}
                onChange={(e) => setFilter(key as keyof SearchFilters, Number(e.target.value) as SearchFilters[typeof key])}
                className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1 pr-7 text-sm text-right tabular-nums focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
              />
              {unit && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                  {unit}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Exclusion filters */}
      <div className="space-y-2 pt-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t.excludeSection}</p>
        <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
          {([
            { key: "excludeSwapApartments" as const, labelKey: "excludeSwap"     as keyof T },
            { key: "excludeNewBuildings"   as const, labelKey: "excludeNew"      as keyof T },
            { key: "exclusiveOnIS24"       as const, labelKey: "exclusiveOnIS24" as keyof T },
          ]).map(({ key, labelKey }) => (
            <label key={key} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters[key]}
                onChange={(e) => setFilter(key, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{t[labelKey] as string}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Max requests per run */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t.maxRequestsLabel}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t.maxRequestsHint}</p>
          </div>
          <input
            type="number"
            min={1}
            max={50}
            value={filters.maxRequestsPerRun}
            onChange={(e) => setFilter("maxRequestsPerRun", Math.max(1, Number(e.target.value)))}
            className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-center font-semibold focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
