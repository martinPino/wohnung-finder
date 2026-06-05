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

interface FieldConfig {
  key: ToggleKey;
  labelKey: keyof T;
  min?: number;
  unit?: string;
}

const FIELDS: FieldConfig[] = [
  { key: "radiusKm",          labelKey: "radiusLabel",  min: 1,  unit: "km"   },
  { key: "maxPriceEur",       labelKey: "priceLabel",   min: 0,  unit: "€/mo" },
  { key: "minSizeM2",         labelKey: "sizeLabel",    min: 1,  unit: "m²"   },
  { key: "minRooms",          labelKey: "roomsLabel",   min: 1               },
  { key: "maxListingAgeDays", labelKey: "ageLabel",     min: 1,  unit: "Tage" },
];

export default function FilterForm({ filters, toggles, onFiltersChange, onTogglesChange, t }: FilterFormProps) {
  const setFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    onFiltersChange({ ...filters, [key]: value });

  const setToggle = (key: ToggleKey, value: boolean) =>
    onTogglesChange({ ...toggles, [key]: value });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">{t.filterTitle}</h2>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t.locationLabel} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={filters.location}
          onChange={(e) => setFilter("location", e.target.value)}
          placeholder={t.locationPlaceholder}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Toggleable filters */}
      {FIELDS.map(({ key, labelKey, min, unit }) => (
        <div key={key} className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={toggles[key]}
            onClick={() => setToggle(key, !toggles[key])}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${toggles[key] ? "bg-blue-600" : "bg-gray-200"}`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${toggles[key] ? "translate-x-4" : "translate-x-0"}`} />
          </button>
          <label className={`flex flex-1 items-center gap-2 text-sm ${!toggles[key] && "opacity-40"}`}>
            <span className="w-36 font-medium text-gray-700">{t[labelKey] as string}</span>
            <div className="relative flex-1">
              <input
                type="number"
                min={min}
                disabled={!toggles[key]}
                value={filters[key] as number}
                onChange={(e) => setFilter(key as keyof SearchFilters, Number(e.target.value) as SearchFilters[typeof key])}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50"
              />
              {unit && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">{unit}</span>
              )}
            </div>
          </label>
        </div>
      ))}

      {/* Exclusion filters */}
      <div className="mt-2 border-t pt-4 space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{t.excludeSection}</p>
        {([
          { key: "excludeSwapApartments" as const, labelKey: "excludeSwap" as keyof T },
          { key: "excludeNewBuildings"   as const, labelKey: "excludeNew"  as keyof T },
        ]).map(({ key, labelKey }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filters[key]}
              onChange={(e) => setFilter(key, e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t[labelKey] as string}
          </label>
        ))}
      </div>

      {/* Max requests per run */}
      <div className="mt-2 border-t pt-4">
        <label className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">{t.maxRequestsLabel}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={50}
              value={filters.maxRequestsPerRun}
              onChange={(e) => setFilter("maxRequestsPerRun", Math.max(1, Number(e.target.value)))}
              className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm text-center font-semibold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400">max</span>
          </div>
        </label>
        <p className="mt-1 text-xs text-gray-400">{t.maxRequestsHint}</p>
      </div>
    </div>
  );
}
