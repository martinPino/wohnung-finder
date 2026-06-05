/**
 * Demo script — navigates the WohnungFinder UI for a screen recording.
 * Run: npx ts-node --project tsconfig.automation.json src/automation/demo.ts
 */
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("http://localhost:3005", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const pause = (ms: number) => page.waitForTimeout(ms);

  // ── Search filters tab ────────────────────────────────────────────────
  await pause(1500);

  // Fill location
  const locationInput = page.locator('input[placeholder*="München"], input[placeholder*="Stadt"]').first();
  await locationInput.click();
  await locationInput.fill("");
  await pause(400);
  for (const char of "München") {
    await locationInput.type(char, { delay: 80 });
  }
  await pause(1000);

  // Toggle off/on radius to show interaction
  const firstToggle = page.locator('button[role="switch"]').first();
  await firstToggle.click();
  await pause(600);
  await firstToggle.click();
  await pause(600);

  // Change max rent
  const priceInput = page.locator('input[type="number"]').nth(1);
  await priceInput.triple_click?.() ?? await priceInput.click({ clickCount: 3 });
  await priceInput.fill("1200");
  await pause(800);

  // ── Account tab ──────────────────────────────────────────────────────
  await page.locator('button:has-text("Konto"), button:has-text("Account")').first().click();
  await pause(1500);

  // ── Message tab ──────────────────────────────────────────────────────
  await page.locator('button:has-text("Nachricht"), button:has-text("Message")').first().click();
  await pause(1500);

  // ── Contacted tab ────────────────────────────────────────────────────
  await page.locator('button:has-text("Kontaktiert"), button:has-text("Contacted")').first().click();
  await pause(1500);

  // ── Schedule tab ─────────────────────────────────────────────────────
  await page.locator('button:has-text("Zeitplan"), button:has-text("Schedule")').first().click();
  await pause(1500);

  // Click a preset interval button
  await page.locator('button:has-text("1 Std"), button:has-text("1h")').first().click();
  await pause(800);

  // ── Back to filters & show Start button ──────────────────────────────
  await page.locator('button:has-text("Suchfilter"), button:has-text("Search filters")').first().click();
  await pause(1000);

  // Highlight the Start button
  const startBtn = page.locator('button:has-text("Automation starten"), button:has-text("Start automation")').first();
  await startBtn.hover();
  await pause(1500);

  // Show language switcher
  await page.locator('button:has-text("EN")').first().click();
  await pause(1000);
  await page.locator('button:has-text("ES")').first().click();
  await pause(1000);
  await page.locator('button:has-text("DE")').first().click();
  await pause(1500);

  await browser.close();
  console.log("Demo finished.");
}

main().catch(console.error);
