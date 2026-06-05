# ImmoScout24 Automation

A local Next.js app that automates sending contact requests to rental listings on ImmoScout24.

> **Security notice:** Your ImmoScout24 email and password are stored in your browser's `localStorage` only — they are never sent to any external server. You are solely responsible for the security of this device and your account.

---

## Project structure

```
immoscout-automation/
├── src/
│   ├── types/           # Shared TypeScript interfaces (AppConfig, SearchFilters, …)
│   ├── hooks/           # useLocalStorage — SSR-safe persistent state
│   ├── utils/           # Storage keys, defaults, readConfigFromStorage()
│   ├── components/
│   │   ├── FilterForm.tsx      # Search filters with per-field toggles
│   │   ├── CredentialsForm.tsx # Email + password inputs
│   │   ├── MessageForm.tsx     # Contact message template editor
│   │   └── StatusPanel.tsx     # Live log, counters, stop button
│   ├── pages/
│   │   ├── index.tsx           # Main UI — tabbed config + "Start automation"
│   │   └── api/
│   │       └── run-automation.ts  # API route that triggers Playwright
│   └── automation/
│       └── immoscout.ts        # Playwright logic (stub — implement Phase 2)
├── package.json
├── tsconfig.json
├── tsconfig.automation.json    # Separate TS config for the automation script
├── next.config.js
├── tailwind.config.js
└── postcss.config.js
```

---

## Setup

### 1. Install dependencies

```bash
cd immoscout-automation
npm install
```

### 2. Install Playwright browsers

```bash
npx playwright install chromium
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. (Optional) Run the automation script directly from CLI

Create a config file:

```bash
cp automation-config.example.json automation-config.json
# edit automation-config.json with your credentials and filters
```

Then run:

```bash
npm run automation automation-config.json
```

---

## Using the app

1. **Search filters tab** — Enter a city or postal code. Toggle and configure each filter (radius, max price, min size, min rooms, listing age).
2. **Account tab** — Enter your ImmoScout24 email and password. These are saved to `localStorage` on your machine only.
3. **Message tab** — Edit the contact message template. Use `{listingTitle}` and `{landlordName}` as dynamic placeholders.
4. Click **Start automation** — the app calls `/api/run-automation`, which spawns the Playwright browser, logs in, searches for listings, and submits a contact request for each one.

All configuration is auto-saved to `localStorage` as you type — no manual save needed.

---

## Implementation roadmap

### Phase 1 — Scaffold (done)
- [x] Next.js + TypeScript + Tailwind project structure
- [x] TypeScript interfaces for all data shapes
- [x] `useLocalStorage` hook with SSR-safety
- [x] `FilterForm`, `CredentialsForm`, `MessageForm`, `StatusPanel` components
- [x] Main page with tabbed layout and "Start automation" button
- [x] `/api/run-automation` API route (stub)
- [x] `src/automation/immoscout.ts` architecture stub

### Phase 2 — Playwright automation
- [ ] Inspect ImmoScout24 DOM and find stable selectors for:
  - Login form (`input[name="username"]`, `input[name="password"]`, submit button)
  - Search result listing cards and their anchor `href` attributes
  - Listing title and landlord name on the detail page
  - Contact form fields (subject, body, submit)
- [ ] Implement `login()` in `immoscout.ts`
- [ ] Implement `searchListings()` — navigate results pages, handle pagination
- [ ] Implement `contactLandlord()` — open contact form, fill, submit
- [ ] Verify `buildSearchUrl()` matches current ImmoScout24 URL pattern

### Phase 3 — Real-time progress
- [ ] Replace the single POST response with **Server-Sent Events (SSE)** so the frontend can stream log lines and counter updates live
- [ ] Add a stop signal (e.g. `AbortController` or a shared flag) so "Stop automation" actually halts the running Playwright process
- [ ] Persist processed listing IDs to avoid re-contacting the same landlord on repeated runs

### Phase 4 — Polish
- [ ] Rate-limiting and randomised delays between actions
- [ ] CAPTCHA detection and pause-with-alert
- [ ] Export log to CSV
- [ ] Configurable contact request limit per run

---

## Notes and caveats

- **ToS:** Automated interaction with ImmoScout24 may violate their Terms of Service. Use responsibly and review their ToS before proceeding.
- **Selectors may break:** ImmoScout24 updates their frontend regularly. Selectors in Phase 2 may need periodic maintenance.
- **`headless: false`:** The Playwright stub launches a visible browser window. This is intentional — it lets you watch what's happening and intervene if needed. Change to `headless: true` once you're confident the automation is stable.
