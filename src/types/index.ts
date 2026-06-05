// ---------------------------------------------------------------------------
// Filter configuration — controls ImmoScout24 search parameters
// ---------------------------------------------------------------------------

export interface SearchFilters {
  /** City name or postal code, e.g. "München" or "80331" */
  location: string;
  /** Search radius in km around the location */
  radiusKm: number;
  /** Maximum monthly rent in EUR (Kaltmiete) */
  maxPriceEur: number;
  /** Minimum living space in m² */
  minSizeM2: number;
  /** Minimum number of rooms */
  minRooms: number;
  /** Only show listings newer than this many days */
  maxListingAgeDays: number;
  /** Max contact requests to send per automation run (default 3) */
  maxRequestsPerRun: number;
  /** Exclude swap apartments (Tauschwohnungen) from results */
  excludeSwapApartments: boolean;
  /** Exclude new construction projects (Neubauprojekte) from results */
  excludeNewBuildings: boolean;
  /** Only show listings exclusive to ImmoScout24 (?exclusiveonis24=true) */
  exclusiveOnIS24: boolean;
}

/** Each filter can be individually enabled/disabled */
export type FilterToggles = {
  [K in keyof Omit<SearchFilters, "location" | "maxRequestsPerRun">]: boolean;
};

// ---------------------------------------------------------------------------
// Credentials — ImmoScout24 login details
// ---------------------------------------------------------------------------

export interface Credentials {
  email: string;
  /** Stored in localStorage — user is responsible for security */
  password: string;
  /** If true, skip premium wall detection and contact all listings */
  isPremiumAccount: boolean;
}

// ---------------------------------------------------------------------------
// Contact message template
// ---------------------------------------------------------------------------

export interface ContactMessage {
  /** Subject line for the contact request */
  subject: string;
  /** Body text; supports {listingTitle} and {landlordName} placeholders */
  body: string;
}

// ---------------------------------------------------------------------------
// Full app configuration — everything persisted to localStorage
// ---------------------------------------------------------------------------

export interface AppConfig {
  filters: SearchFilters;
  filterToggles: FilterToggles;
  credentials: Credentials;
  contactMessage: ContactMessage;
}

// ---------------------------------------------------------------------------
// Contacted listing record
// ---------------------------------------------------------------------------

export interface ContactedListing {
  id: string;
  url: string;
  title: string;
  sentAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Automation run state
// ---------------------------------------------------------------------------

export type AutomationStatus = "idle" | "running" | "paused" | "done" | "error";

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface AutomationState {
  status: AutomationStatus;
  listingsFound: number;
  requestsSent: number;
  logs: LogEntry[];
}

// ---------------------------------------------------------------------------
// Schedule config
// ---------------------------------------------------------------------------

export interface ScheduleConfig {
  enabled: boolean;
  /** Interval in minutes between automation runs */
  intervalMinutes: number;
}

export interface ScheduleStatus {
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt: string | null;   // ISO timestamp
  lastRunAt: string | null;
  lastRunResult: string | null;
}

// ---------------------------------------------------------------------------
// API — request/response shapes for /api/run-automation
// ---------------------------------------------------------------------------

export interface RunAutomationRequest {
  config: AppConfig;
}

export interface RunAutomationResponse {
  ok: boolean;
  message: string;
}
