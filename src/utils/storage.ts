import type { AppConfig, SearchFilters, FilterToggles, Credentials, ContactMessage } from "@/types";

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

export const STORAGE_KEYS = {
  FILTERS: "immoscout:filters",
  FILTER_TOGGLES: "immoscout:filterToggles",
  CREDENTIALS: "immoscout:credentials",
  CONTACT_MESSAGE: "immoscout:contactMessage",
} as const;

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

export const DEFAULT_FILTERS: SearchFilters = {
  location: "",
  radiusKm: 10,
  maxPriceEur: 1500,
  minSizeM2: 40,
  minRooms: 2,
  maxListingAgeDays: 7,
  maxRequestsPerRun: 3,
  excludeSwapApartments: true,
  excludeNewBuildings: true,
  exclusiveOnIS24: true,
};

export const DEFAULT_FILTER_TOGGLES: FilterToggles = {
  radiusKm: true,
  maxPriceEur: true,
  minSizeM2: true,
  minRooms: true,
  maxListingAgeDays: true,
  excludeSwapApartments: true,
  excludeNewBuildings: true,
  exclusiveOnIS24: true,
};

export const DEFAULT_CREDENTIALS: Credentials = {
  email: "",
  password: "",
  isPremiumAccount: false,
};

export const DEFAULT_CONTACT_MESSAGE: ContactMessage = {
  subject: "Anfrage zu Ihrer Mietwohnung",
  body: `Sehr geehrte Damen und Herren,

ich bin sehr an Ihrer Wohnung "{listingTitle}" interessiert und würde mich über einen Besichtigungstermin freuen.

Mit freundlichen Grüßen`,
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  filters: DEFAULT_FILTERS,
  filterToggles: DEFAULT_FILTER_TOGGLES,
  credentials: DEFAULT_CREDENTIALS,
  contactMessage: DEFAULT_CONTACT_MESSAGE,
};

// ---------------------------------------------------------------------------
// Helpers for reading the full config in non-React contexts (e.g. API routes)
// ---------------------------------------------------------------------------

/**
 * Reads the full AppConfig from localStorage.
 * Only callable in browser context.
 */
export function readConfigFromStorage(): AppConfig {
  const read = <T>(key: string, fallback: T): T => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };

  return {
    filters: read(STORAGE_KEYS.FILTERS, DEFAULT_FILTERS),
    filterToggles: read(STORAGE_KEYS.FILTER_TOGGLES, DEFAULT_FILTER_TOGGLES),
    credentials: read(STORAGE_KEYS.CREDENTIALS, DEFAULT_CREDENTIALS),
    contactMessage: read(STORAGE_KEYS.CONTACT_MESSAGE, DEFAULT_CONTACT_MESSAGE),
  };
}
