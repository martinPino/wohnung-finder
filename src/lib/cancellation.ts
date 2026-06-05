/**
 * Shared cancellation — module-level singleton via globalThis.
 * Stores the active Playwright page so stop() can close it immediately.
 */
import type { Page } from "playwright";

declare global {
  // eslint-disable-next-line no-var
  var __cancellation: {
    cancelled: boolean;
    activePage: Page | null;
  } | undefined;
}

function g() {
  if (!globalThis.__cancellation) {
    globalThis.__cancellation = { cancelled: false, activePage: null };
  }
  return globalThis.__cancellation;
}

export function isCancelled(): boolean {
  return g().cancelled;
}

export function setActivePage(page: Page | null): void {
  g().activePage = page;
}

export async function requestCancellation(): Promise<void> {
  g().cancelled = true;
  console.log("[cancellation] Stop requested — closing active page.");
  const page = g().activePage;
  if (page) {
    try {
      await page.close();
    } catch { /* already closed */ }
    g().activePage = null;
  }
}

export function resetCancellation(): void {
  g().cancelled = false;
  g().activePage = null;
}
