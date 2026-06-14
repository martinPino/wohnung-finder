/**
 * ImmoScout24 Playwright automation
 *
 * Connects to your EXISTING Chrome via Chrome DevTools Protocol (CDP).
 * Your Chrome already has your Google / ImmoScout24 session — no login needed.
 *
 * HOW TO USE:
 *
 *   Step 1 — start Chrome with remote debugging (only once per machine):
 *     npm run chrome
 *
 *   Step 2 — run the automation:
 *     npm run automation              (reads automation-config.json)
 *     npm run automation -- --dry-run (search only, no messages sent)
 */

import { type Browser, type BrowserContext, type Page } from "playwright";
import { spawn } from "child_process";
import { isCancelled, resetCancellation, setActivePage } from "../lib/cancellation";
import * as fs from "fs";
import * as path from "path";
import type { AppConfig, LogEntry } from "../types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CDP_PORT = 9222;
const CDP_URL = `http://localhost:${CDP_PORT}`;
// Use Electron userData dir when running as packaged app, otherwise cwd
const DATA_DIR = process.env.IMMOSCOUT_DATA_DIR || process.cwd();
const CONTACTED_FILE = path.join(DATA_DIR, "contacted.json");
const BROWSER_PROFILE_DIR = path.join(DATA_DIR, "browser-profile");

// Locate the installed Google Chrome executable across platforms.
// Returns null if Chrome can't be found in any of the usual locations.
function findChromeExecutable(): string | null {
  const candidates: string[] = [];

  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    );
  } else if (process.platform === "win32") {
    const programFiles = process.env["PROGRAMFILES"] || "C:\\Program Files";
    const programFilesX86 =
      process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env["LOCALAPPDATA"];
    candidates.push(
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe")
    );
    if (localAppData) {
      candidates.push(
        path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe")
      );
    }
  } else {
    // Linux
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser"
    );
  }

  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutomationResult {
  listingsFound: number;
  requestsSent: number;
  logs: LogEntry[];
}

type Logger = (level: LogEntry["level"], message: string) => void;

// ---------------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------------

interface ContactedRecord {
  id: string;
  url: string;
  title: string;
  sentAt: string;
}

function loadContactedRecords(): ContactedRecord[] {
  try {
    if (fs.existsSync(CONTACTED_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONTACTED_FILE, "utf-8"));
      // Handle old format (plain string array) gracefully
      if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") {
        return (raw as string[]).map(id => ({ id, url: "", title: id, sentAt: "" }));
      }
      return raw as ContactedRecord[];
    }
  } catch { /* ignore */ }
  return [];
}

function loadContacted(): Set<string> {
  return new Set(loadContactedRecords().map(r => r.id));
}

function saveContacted(ids: Set<string>, records: ContactedRecord[]): void {
  fs.writeFileSync(CONTACTED_FILE, JSON.stringify(records, null, 2));
}

// ---------------------------------------------------------------------------
// Launch Chrome with debugging port
// ---------------------------------------------------------------------------

export async function launchChromeWithDebugging(): Promise<void> {
  if (await isCDPAvailable()) {
    console.log(`✓ Chrome already on port ${CDP_PORT}`);
    return;
  }

  console.log("Opening a second Chrome window for automation (existing tabs are NOT affected)…");

  // Use a dedicated profile dir so this instance is independent of your main Chrome.
  // Launching the binary directly with a dedicated --user-data-dir starts an
  // independent instance even if Chrome is already running (all platforms).
  const profileDir = BROWSER_PROFILE_DIR;
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  const chromePath = findChromeExecutable();
  if (!chromePath) {
    throw new Error(
      "Google Chrome not found. Please install Chrome (https://www.google.com/chrome/) and try again."
    );
  }

  spawn(chromePath, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profileDir}`,
    "--remote-allow-origins=*",   // required for full CDP support (setDownloadBehavior etc.)
    "--disable-blink-features=AutomationControlled",
    "--start-maximized",
    "--lang=de-DE",
    "--no-first-run",
    "--no-default-browser-check",
  ], { detached: true, stdio: "ignore" }).unref();

  console.log("Waiting for Chrome to be ready…");
  for (let i = 0; i < 20; i++) {
    await delay(1000);
    if (await isCDPAvailable()) {
      console.log(`✓ Chrome ready on port ${CDP_PORT}`);
      return;
    }
    process.stdout.write(".");
  }

  console.error("\n✗ Chrome did not start. Try launching it manually with:");
  console.error(`  "${chromePath}" --remote-debugging-port=${CDP_PORT} --user-data-dir="${profileDir}"`);
  process.exit(1);
}

async function isCDPAvailable(): Promise<boolean> {
  try {
    const { default: http } = await import("http");
    return await new Promise((resolve) => {
      const req = http.get(`${CDP_URL}/json/version`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(1000, () => { req.destroy(); resolve(false); });
    });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runAutomation(
  config: AppConfig,
  dryRun = false
): Promise<AutomationResult> {
  const logs: LogEntry[] = [];
  let listingsFound = 0;
  let requestsSent = 0;
  const log: Logger = (level, message) => {
    const entry: LogEntry = { timestamp: new Date().toLocaleTimeString(), level, message };
    logs.push(entry);
    console.log(`[${level.toUpperCase()}] ${entry.timestamp} ${message}`);
  };

  const contactedRecords = loadContactedRecords();
  const contacted = new Set(contactedRecords.map(r => r.id));
  let context: BrowserContext | null = null;
  let browser: Browser | null = null;

  try {
    resetCancellation(); // clear any previous stop request
    log("info", `Starting${dryRun ? " (DRY RUN)" : ""}…`);

    let chromeReady = await isCDPAvailable();

    if (!chromeReady) {
      // No debugging Chrome yet — launch one. It uses the saved profile and
      // stays open across runs, so the ImmoScout login is reused next time.
      log("info", "Starting Chrome (it stays open and reuses your login)…");
      await launchChromeWithDebugging();
      chromeReady = await isCDPAvailable();
      if (!chromeReady) {
        throw new Error("Could not start Chrome with the debugging port.");
      }
    } else {
      log("info", "Reusing the Chrome window already open…");
    }

    // Connect via CDP. We attach to Chrome but never terminate it on exit —
    // only the tab we open is closed, so the window and session persist.
    log("info", "Connecting to Chrome…");
    const { default: http } = await import("http");
    const wsUrl: string = await new Promise((resolve, reject) => {
      http.get(`${CDP_URL}/json/version`, (res) => {
        let data = "";
        res.on("data", d => data += d);
        res.on("end", () => resolve(JSON.parse(data).webSocketDebuggerUrl));
      }).on("error", reject);
    });
    const { chromium: cr } = await import("playwright");
    browser = await cr.connectOverCDP(wsUrl, { slowMo: 120 });
    context = browser.contexts()[0] ?? await browser.newContext();
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    log("info", "Connected ✓");

    const page = await context.newPage();
    setActivePage(page); // register so stop button can close it immediately
    log("info", "Browser ready ✓");

    // Verify we're logged in
    await verifyLogin(page, log);

    // Search & collect listings
    const exposeUrls = await searchListings(page, config, log);
    const newListings = exposeUrls.filter((url) => {
      const id = extractExposeId(url);
      return id && !contacted.has(id);
    });

    listingsFound = exposeUrls.length;
    log("info", `Found ${listingsFound} listing(s), ${newListings.length} new.`);

    const maxRequests = config.filters.maxRequestsPerRun ?? 3;

    if (dryRun) {
      log("warn", "Dry-run — no messages sent.");
    } else {
      log("info", `Sending up to ${maxRequests} request(s) this run.`);
      for (const url of newListings) {
        if (isCancelled()) {
          log("warn", "Stop requested — automation cancelled.");
          break;
        }
        if (requestsSent >= maxRequests) {
          log("info", `Limit of ${maxRequests} reached — stopping.`);
          break;
        }
        const id = extractExposeId(url)!;
        const result = await contactLandlord(page, url, config, log);
        if (result) {
          requestsSent++;
          contacted.add(id);
          contactedRecords.push({
            id,
            url: url.split("?")[0], // strip query params
            title: result.title,
            sentAt: new Date().toISOString(),
          });
          saveContacted(contacted, contactedRecords);
          log("info", `${requestsSent}/${maxRequests} sent.`);
        }
        await randomDelay(page, 3000, 7000);
      }
    }

    // Close only the tab we opened, not the whole browser
    await page.close();
    log("info", `Done. Sent ${requestsSent} request(s).`);
  } catch (err) {
    // If page was closed by stop button, treat as clean cancellation
    const msg = String(err);
    if (msg.includes("closed") || msg.includes("Target closed") || isCancelled()) {
      log("warn", "Automation stopped.");
    } else {
      log("error", `Fatal: ${err}`);
      throw err;
    }
  } finally {
    setActivePage(null);
    // Disconnect from Chrome WITHOUT closing it, so the window and the
    // logged-in ImmoScout session stay available for the next run.
    if (browser) await browser.close().catch(() => {});
  }

  return { listingsFound, requestsSent, logs };
}

// ---------------------------------------------------------------------------
// Verify login
// ---------------------------------------------------------------------------

async function verifyLogin(page: Page, log: Logger): Promise<void> {
  log("info", "Verifying ImmoScout24 session…");
  await page.goto(
    "https://www.immobilienscout24.de/geschlossenerbereich/start.html",
    { waitUntil: "domcontentloaded" }
  );
  await dismissCookieBanner(page, log);

  if (!page.url().includes("sso.immobilienscout24.de")) {
    log("info", "Session valid ✓");
    return;
  }

  // Not logged in — wait up to 3 minutes for the user to log in manually
  log("warn", "─────────────────────────────────────────────────");
  log("warn", "Not logged in. Please log in to ImmoScout24");
  log("warn", "in the browser window, then wait…");
  log("warn", "─────────────────────────────────────────────────");

  try {
    await page.waitForURL(
      (url) => !url.href.includes("sso.immobilienscout24.de"),
      { timeout: 180_000 }
    );
    await dismissCookieBanner(page, log);
    log("info", "Login completed ✓");
  } catch {
    throw new Error("Login timeout — session not established after 3 minutes.");
  }
}

// ---------------------------------------------------------------------------
// Search listings
// ---------------------------------------------------------------------------

async function searchListings(
  page: Page,
  config: AppConfig,
  log: Logger
): Promise<string[]> {
  const { filters, filterToggles } = config;

  // Navigate via homepage search form — direct URL format changes too often
  log("info", `Searching for "${filters.location}"…`);
  await page.goto("https://www.immobilienscout24.de", { waitUntil: "domcontentloaded" });
  await dismissCookieBanner(page, log);

  // ── Step 1: select "Wohnung Mieten" from the type dropdown ─────────────
  // The dropdown button has class Dropdown_dropdown and text "Wohnung Mieten"
  const dropdownBtn = page.locator('[class*="Dropdown_dropdown"] button, button:has-text("Wohnung")').first();
  if (await dropdownBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await dropdownBtn.click();
    await page.waitForTimeout(800);
    // Select "Wohnung Mieten" from the opened list
    const mietOption = page.locator(
      'li:has-text("Wohnung Mieten"), [role="option"]:has-text("Wohnung Mieten"), button:has-text("Wohnung Mieten"), [class*="option"]:has-text("Wohnung Mieten")'
    ).first();
    if (await mietOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await mietOption.click();
      log("info", "Selected 'Wohnung Mieten' ✓");
    } else {
      // Dropdown already set to Wohnung Mieten — press Escape to close
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(500);
  }

  // ── Step 2: build smart filter query and fill the search box ────────
  // IS24's AI search box accepts natural language with all filters inline.
  const queryParts: string[] = [`Wohnung mieten ${filters.location}`];
  if (filterToggles.maxPriceEur)       queryParts.push(`bis ${filters.maxPriceEur}€`);
  if (filterToggles.minRooms)          queryParts.push(`min ${filters.minRooms} Zimmer`);
  if (filterToggles.minSizeM2)         queryParts.push(`min ${filters.minSizeM2}m²`);
  if (filterToggles.radiusKm)          queryParts.push(`Radius ${filters.radiusKm}km`);
  if (filters.excludeSwapApartments)   queryParts.push("ohne Tauschwohnungen");
  if (filters.excludeNewBuildings)     queryParts.push("ohne Neubauprojekte");
  // exclusiveOnIS24 is applied as a URL param after results load — not via text
  const smartQuery = queryParts.join(", ");
  log("info", `Smart search query: "${smartQuery}"`);

  const searchInput = page.locator('input[role="combobox"], input[id*="search"], input[placeholder*="Stadt"], input[placeholder*="Suche"]').first();
  await searchInput.waitFor({ timeout: 8000 });
  await searchInput.fill(smartQuery);
  await page.waitForTimeout(1500);

  // Pick first autocomplete suggestion
  const suggestion = page.locator('[role="option"]:first-child, [class*="suggestion"]:first-child, [class*="autocomplete"] li:first-child, [class*="Suggestion"]:first-child').first();
  if (await suggestion.isVisible({ timeout: 2500 }).catch(() => false)) {
    await suggestion.click();
  } else {
    await searchInput.press("Enter");
  }
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  // ── Step 3: click Suchen ────────────────────────────────────────────
  const suchenBtn = page.locator('button:has-text("Suchen"), [data-qa="search-button"]').first();
  if (await suchenBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await suchenBtn.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
  }

  log("info", `Search URL: ${page.url()}`);

  // Append exclusiveonis24=true to the results URL if filter is active
  if (filters.exclusiveOnIS24 && page.url().includes("immobilienscout24.de")) {
    const currentUrl = page.url();
    if (!currentUrl.includes("exclusiveonis24")) {
      const separator = currentUrl.includes("?") ? "&" : "?";
      const newUrl = `${currentUrl}${separator}exclusiveonis24=true`;
      log("info", "Applying exclusiveOnIS24 filter — reloading…");
      await page.goto(newUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      log("info", `Reloaded: ${page.url()}`);
    }
  }

  await dismissCookieBanner(page, log);

  // Wait for listings to appear
  const resultSel = 'a[href*="/expose/"]';
  try {
    await page.waitForSelector(resultSel, { timeout: 15_000 });
  } catch {
    log("warn", "No listings found — check city name and filters.");
    return [];
  }

  // Scroll to load all lazy-loaded results
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(600);
  }

  const allUrls: string[] = [];
  let pageNum = 1;

  while (pageNum <= 5) {
    log("info", `Collecting page ${pageNum}…`);
    await dismissCookieBanner(page, log);

    const urls = await page.$$eval('a[href*="/expose/"]', (links) =>
      [...new Set(
        (links as HTMLAnchorElement[])
          .map((a) => a.href)
          .filter((h) => /\/expose\/\d+/.test(h))
      )]
    );
    allUrls.push(...urls);
    log("info", `  ${urls.length} listing(s) on this page.`);

    const next = await firstVisible(page, [
      'a[data-nav-next-page]',
      'a[title="Nächste Seite"]',
      'a[aria-label="Nächste Seite"]',
      '.pagination__next a',
      'button[data-testid="pagination-next"]',
    ]);
    if (!next) break;
    await next.click();
    await page.waitForLoadState("domcontentloaded");
    await randomDelay(page, 1500, 3000);
    pageNum++;
  }

  return [...new Set(allUrls)];
}

// ---------------------------------------------------------------------------
// Contact landlord
// ---------------------------------------------------------------------------

type ContactResult = { title: string } | null;

async function contactLandlord(
  page: Page,
  exposeUrl: string,
  config: AppConfig,
  log: Logger
): Promise<ContactResult> {
  log("info", `Opening: ${exposeUrl}`);
  await page.goto(exposeUrl, { waitUntil: "domcontentloaded" });
  await dismissCookieBanner(page, log);

  const title = await page.$eval("h1", (el) => el.textContent?.trim() ?? "").catch(() => "");
  const landlordName = await page
    .$eval('[data-qa="agent-name"], .contact-box__name, .sp-contact__name', (el) => el.textContent?.trim() ?? "")
    .catch(() => "");

  log("info", `"${title || exposeUrl}"`);

  // Click the "Nachricht" contact button
  let btn = await firstVisible(page, [
    '[data-testid="contact-button"]',
    '[data-qa="sendButton"]',
    'button:has-text("Nachricht")',
    'button:has-text("Kontaktieren")',
    'button:has-text("Anfrage senden")',
  ]);

  if (!btn) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1000);
    btn = await firstVisible(page, [
      '[data-testid="contact-button"]',
      '[data-qa="sendButton"]',
      'button:has-text("Nachricht")',
    ]);
  }

  if (!btn) { log("warn", "No contact button — skipping."); return null; }
  await btn.click();
  log("info", "Clicked contact button.");

  // ── Race: wait for Abschicken OR premium wall ──────────────────────────
  const PREMIUM_URL_PATTERN = /warenkorb|mieterplus|abonnement|mitgliedschaft|subscription|upgrade|freischalten/i;
  const isPremiumAccount = config.credentials.isPremiumAccount ?? false;

  if (isPremiumAccount) {
    // Premium account: skip paywall detection, just wait for the form
    try {
      await page.waitForSelector('button:has-text("Abschicken")', { timeout: 12_000 });
    } catch {
      log("warn", "Contact form did not load in time — skipping.");
      return null;
    }
  } else {
    // Free account: if premium wall appears, go back and skip
    const outcome = await Promise.race([
      page.waitForSelector('button:has-text("Abschicken")', { timeout: 12_000 })
        .then(() => "form" as const)
        .catch(() => "timeout" as const),
      page.waitForURL((url) => PREMIUM_URL_PATTERN.test(url.href), { timeout: 12_000 })
        .then(() => "premium" as const)
        .catch(() => "timeout" as const),
    ]);

    if (outcome === "premium") {
      log("warn", "Premium wall — going back and skipping.");
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
      return null;
    }
    if (outcome === "timeout") {
      if (PREMIUM_URL_PATTERN.test(page.url())) {
        log("warn", "Premium page (late) — going back and skipping.");
        await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
        return null;
      }
      log("warn", "Contact form did not load in time — skipping.");
      return null;
    }
  }

  // Form is ready
  await page.waitForTimeout(500);

  // Optionally fill the message textarea if present
  const textarea = await firstVisible(page, [
    'textarea[placeholder*="Nachricht"]',
    'textarea[name="message"]',
    'textarea[data-qa="message"]',
    'form textarea',
    'textarea',
  ]);
  if (textarea) {
    const body = config.contactMessage.body
      .replace(/\{listingTitle\}/g, title || "Ihre Wohnung")
      .replace(/\{landlordName\}/g, landlordName || "");
    await textarea.click({ clickCount: 3 });
    await textarea.fill(body);
    log("info", "Message filled.");
  }

  // Scroll "Abschicken" into view and click
  const abschicken = page.locator('button:has-text("Abschicken")').first();
  await abschicken.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await abschicken.click();
  log("info", "Abschicken clicked ✓");

  // Wait for confirmation
  try {
    await page.waitForSelector(
      [
        ':has-text("gesendet")',
        ':has-text("erfolgreich")',
        ':has-text("Vielen Dank")',
        '[data-qa="success"]',
        '[data-testid="message-sent"]',
      ].join(", "),
      { timeout: 8_000 }
    );
    log("info", "Confirmed ✓");
  } catch {
    log("warn", "No explicit confirmation — message may have been sent.");
  }

  return { title };
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

function buildSearchUrl(config: AppConfig): string {
  const { filters, filterToggles } = config;
  const slug = filters.location.trim().toLowerCase().replace(/\s+/g, "-");
  const base = `https://www.immobilienscout24.de/Suche/de/${encodeURIComponent(slug)}/wohnung-mieten`;
  const p = new URLSearchParams({ enteredFrom: "result_list" });
  if (filterToggles.radiusKm) p.set("radius", String(filters.radiusKm));
  if (filterToggles.maxPriceEur) p.set("price", `-${filters.maxPriceEur}.0`);
  if (filterToggles.minSizeM2) p.set("livingspace", `${filters.minSizeM2}.0-`);
  if (filterToggles.minRooms) p.set("numberofrooms", `${filters.minRooms}.0-`);
  if (filterToggles.maxListingAgeDays) p.set("publishedSince", String(filters.maxListingAgeDays));
  return `${base}?${p}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function firstVisible(page: Page, selectors: string[]) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) return el;
    } catch { /* try next */ }
  }
  return null;
}

async function dismissCookieBanner(page: Page, log: Logger): Promise<void> {
  for (const sel of [
    'button[data-testid="uc-accept-all-button"]',
    'button[id="uc-btn-accept-banner"]',
    'button:has-text("Alle akzeptieren")',
    'button:has-text("Akzeptieren")',
    '#onetrust-accept-btn-handler',
  ]) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await btn.click();
        log("info", "Cookie banner dismissed.");
        await page.waitForTimeout(500);
        return;
      }
    } catch { /* ignore */ }
  }
}

function extractExposeId(url: string): string | null {
  const m = url.match(/\/expose\/(\d+)/);
  return m ? m[1] : null;
}

async function randomDelay(page: Page, min: number, max: number): Promise<void> {
  await page.waitForTimeout(min + Math.floor(Math.random() * (max - min)));
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (require.main === module) {
  const launchChrome = process.argv.includes("--launch-chrome");
  const dryRun = process.argv.includes("--dry-run");
  const configPath = process.argv.find((a) => a.endsWith(".json")) ?? "./automation-config.json";

  if (launchChrome) {
    launchChromeWithDebugging().catch((e) => { console.error(e); process.exit(1); });
  } else {
    if (!fs.existsSync(configPath)) {
      console.error(`Config not found: ${configPath}`);
      process.exit(1);
    }
    const config: AppConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    runAutomation(config, dryRun)
      .then(({ listingsFound, requestsSent }) => {
        console.log(`\nListings found: ${listingsFound}`);
        console.log(`Requests sent:  ${requestsSent}`);
      })
      .catch((e) => { console.error("Fatal:", e); process.exit(1); });
  }
}
