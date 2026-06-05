# WohnungFinder — ImmoScout24 Automation

> Automatisch Kontaktanfragen auf ImmobilienScout24 senden.  
> macOS Desktop App · Next.js + Playwright + Electron

**Landing page:** https://martinpino.github.io/immoscout-automation  
**Download:** https://schwarzboeck7.gumroad.com/l/sgotr

---

## Inhaltsverzeichnis

- [Überblick](#überblick)
- [Architektur](#architektur)
- [Projektstruktur](#projektstruktur)
- [Lokale Entwicklung](#lokale-entwicklung)
- [Automatisierung](#automatisierung)
- [Electron Desktop App](#electron-desktop-app)
- [Build & Release](#build--release)
- [Landing Page](#landing-page)
- [Konfiguration](#konfiguration)
- [Bekannte Einschränkungen](#bekannte-einschränkungen)

---

## Überblick

WohnungFinder ist eine lokale macOS-Desktop-App, die automatisch Kontaktanfragen für Mietwohnungen auf ImmobilienScout24 sendet.

**Was sie tut:**
1. Navigiert zu ImmobilienScout24 und sucht nach Wohnungen mit den konfigurierten Filtern
2. Öffnet jedes Inserat und füllt das Kontaktformular aus
3. Klickt "Abschicken" — fertig
4. Merkt sich bereits kontaktierte Inserate (keine Duplikate)
5. Kann automatisch in konfigurierbaren Intervallen laufen (Zeitplan)

**Technologie:**
- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS
- **Automatisierung:** Playwright (Browser-Steuerung via CDP)
- **Desktop:** Electron 31
- **Scheduling:** Node.js setInterval + globalThis-Singleton
- **Mehrsprachig:** DE / EN / ES

---

## Architektur

```
┌─────────────────────────────────────────────────────┐
│                  Electron Main Process               │
│  - Startet Next.js Server (Port 3847 in Produktion) │
│  - Öffnet BrowserWindow → lädt localhost            │
│  - Auto-Update via electron-updater + GitHub        │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              Next.js App (Port 3005 dev)             │
│                                                      │
│  Pages / UI          API Routes                      │
│  ─────────────       ──────────────────────          │
│  / (index.tsx)  →    POST /api/run-automation        │
│                       POST /api/stop-automation      │
│                       POST /api/schedule             │
│                       GET  /api/schedule             │
│                       GET  /api/contacted-listings   │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│           Playwright Automation Engine               │
│                                                      │
│  Verbindung zu Chrome:                               │
│  1. CDP (connectOverCDP) wenn Chrome läuft           │
│  2. launchPersistentContext wenn Chrome nicht läuft  │
│                                                      │
│  Flow: Login → Suche → Expose öffnen → Kontakt senden│
└─────────────────────────────────────────────────────┘
```

### Chrome-Verbindung

Da Google OAuth keine automatisierten Browser akzeptiert, verbindet sich WohnungFinder mit einem **bereits laufenden Chrome** via Chrome DevTools Protocol (CDP):

1. `npm run chrome` → öffnet Chrome mit `--remote-debugging-port=9222` und eigenem Profil (`./browser-profile/`)
2. Der Nutzer loggt sich **manuell** in ImmobilienScout24 ein
3. Die Automation verbindet sich via CDP zu diesem Chrome — kein erneuter Login nötig

---

## Projektstruktur

```
immoscout-automation/
│
├── electron/                    # Electron Main Process
│   ├── main.ts                  # Fenster, Server-Start, Auto-Update
│   └── tsconfig.json            # TS-Config für Electron (CommonJS)
│
├── src/
│   ├── automation/
│   │   ├── immoscout.ts         # Playwright-Automation (Login, Suche, Kontakt)
│   │   ├── demo.ts              # Demo-Script für Screen-Recordings
│   │   └── inspect.ts           # Debugging-Script für DOM-Selektoren
│   │
│   ├── components/
│   │   ├── FilterForm.tsx       # Suchfilter mit Toggles
│   │   ├── CredentialsForm.tsx  # IS24-Login + Premium-Toggle
│   │   ├── MessageForm.tsx      # Nachrichtenvorlage
│   │   ├── StatusPanel.tsx      # Live-Log, Zähler, Stop-Button
│   │   ├── ContactedList.tsx    # History kontaktierter Inserate
│   │   └── ScheduleForm.tsx     # Zeitplan-Konfiguration
│   │
│   ├── hooks/
│   │   ├── useLocalStorage.ts   # SSR-sicherer localStorage-Hook
│   │   └── useLang.ts           # Sprachumschalter (DE/EN/ES)
│   │
│   ├── lib/
│   │   ├── cancellation.ts      # Globales Stop-Token + aktive Page-Referenz
│   │   ├── i18n.ts              # Übersetzungen (DE/EN/ES)
│   │   └── scheduler.ts         # Cron-Scheduler via globalThis-Singleton
│   │
│   ├── pages/
│   │   ├── index.tsx            # Haupt-UI (Tabs, Start-Button, Status)
│   │   └── api/
│   │       ├── run-automation.ts      # POST → startet Playwright
│   │       ├── stop-automation.ts     # POST → schließt aktive Page
│   │       ├── schedule.ts            # GET/POST → Zeitplan verwalten
│   │       └── contacted-listings.ts  # GET → contacted.json lesen
│   │
│   ├── types/index.ts           # Alle TypeScript-Interfaces
│   └── utils/storage.ts         # localStorage-Keys + Default-Werte
│
├── docs/                        # GitHub Pages Landing Page
│   ├── index.html               # Landing Page (HTML/CSS, kein Framework)
│   ├── logo.png                 # App-Logo
│   └── demo.mp4                 # Demo-Video (konvertiert von .mov)
│
├── public/
│   └── logo.png                 # Logo für Electron-App-Icon
│
├── .github/workflows/
│   └── release.yml              # GitHub Actions: Build .dmg bei git tag
│
├── next.config.js               # Next.js + standalone output + external packages
├── package.json                 # Scripts + electron-builder Konfiguration
├── tsconfig.json                # Next.js TS-Config (excludes electron/)
└── tsconfig.automation.json     # TS-Config für Playwright-Scripts (CommonJS)
```

### Laufzeit-Dateien (nicht im Git)

| Datei | Inhalt |
|---|---|
| `contacted.json` | Array von `{id, url, title, sentAt}` — bereits kontaktierte Inserate |
| `schedule.json` | `{enabled, intervalMinutes}` — Zeitplan-Konfiguration |
| `automation-config.json` | Vollständige `AppConfig` — wird vom Scheduler gelesen |
| `browser-profile/` | Chrome-Profil mit gespeicherter IS24-Session |

---

## Lokale Entwicklung

### Voraussetzungen

- macOS 12+
- Node.js 20+
- Google Chrome installiert

### Setup

```bash
git clone git@github-immoscout:martinPino/immoscout-automation.git
cd immoscout-automation
npm install
npx playwright install chromium
```

### Web-App starten (ohne Electron)

```bash
npm run dev
# → http://localhost:3005
```

### Electron-App starten (dev mode)

```bash
npm run electron:compile   # einmalig oder nach Änderungen in electron/
npm run electron:dev       # startet Next.js (Port 3005) + Electron-Fenster
```

---

## Automatisierung

### Erstmaliger Login (einmalig)

```bash
npm run chrome
# Öffnet Chrome mit Debug-Port 9222 + eigenem Profil
# → ImmobilienScout24 manuell öffnen und einloggen
# Chrome offen lassen
```

### Automation starten

**Via UI:** "Automation starten" Button in der App

**Via CLI:**
```bash
# automation-config.json erstellen (AppConfig-Format)
npm run automation            # normaler Run
npm run automation -- --dry-run   # Suche ohne Nachrichten senden
```

### Zeitplan

Über die "Zeitplan"-Tab in der UI konfigurieren. Der Scheduler läuft als Node.js-`setInterval` im Next.js-Server-Prozess. State wird in `globalThis` gespeichert, um Next.js HMR-Reloads zu überleben.

### Stop

"Automation stoppen" Button → sendet `POST /api/stop-automation` → schließt die aktive Playwright-Page sofort.

---

## Electron Desktop App

### Dev-Mode

```bash
npm run electron:dev
# Next.js läuft auf Port 3005
# Electron öffnet Fenster auf http://localhost:3005
```

### Produktion

In Produktion startet Electron den Next.js Standalone-Server intern (Port 3847) und öffnet das Fenster darauf. Der Nutzer braucht kein Node.js oder npm.

**Laufzeit-Daten** werden in `app.getPath('userData')` gespeichert (via `IMMOSCOUT_DATA_DIR` env var):
- macOS: `~/Library/Application Support/ImmoScout Automation/`

---

## Build & Release

### Lokaler Build

```bash
npm run electron:build:mac
# Generiert:
# dist/ImmoScout Automation-1.0.0-arm64.dmg  (Apple Silicon)
# dist/ImmoScout Automation-1.0.0.dmg         (Intel)
```

### Release veröffentlichen

```bash
git add -A
git commit -m "Feature XYZ"
git tag v1.0.1
git push && git push --tags
```

GitHub Actions (`.github/workflows/release.yml`) baut automatisch den `.dmg` und veröffentlicht ihn in GitHub Releases.

**Wichtig:** `GH_TOKEN` muss als Repository Secret gesetzt sein (Settings → Secrets → Actions).

### Auto-Update

`electron-updater` prüft beim App-Start auf neue Releases in GitHub. Wenn eine neue Version verfügbar ist, wird sie im Hintergrund heruntergeladen und beim nächsten Start installiert.

---

## Landing Page

**URL:** https://martinpino.github.io/immoscout-automation  
**Source:** `docs/index.html` (plain HTML/CSS, kein Framework)  
**Hosting:** GitHub Pages, Branch `main`, Ordner `/docs`

### Aktualisieren

Änderungen an `docs/index.html` pushen → GitHub Pages aktualisiert automatisch innerhalb von 1–2 Minuten.

### Download-Links

Alle Buttons verlinken auf: `https://schwarzboeck7.gumroad.com/l/sgotr`

---

## Konfiguration

### AppConfig (localStorage)

```typescript
interface AppConfig {
  filters: {
    location: string;           // Stadt oder PLZ
    radiusKm: number;           // Suchradius in km
    maxPriceEur: number;        // Maximale Kaltmiete
    minSizeM2: number;          // Mindestgröße in m²
    minRooms: number;           // Mindestzimmeranzahl
    maxListingAgeDays: number;  // Max. Alter der Anzeige
    maxRequestsPerRun: number;  // Anfragen pro Durchlauf (default: 3)
    excludeSwapApartments: boolean;
    excludeNewBuildings: boolean;
  };
  filterToggles: Record<string, boolean>;
  credentials: {
    email: string;
    password: string;         // Nur localStorage, nie serverseitig
    isPremiumAccount: boolean; // Premium-Anzeigen überspringen oder nicht
  };
  contactMessage: {
    subject: string;
    body: string;  // Platzhalter: {listingTitle}, {landlordName}
  };
}
```

### Umgebungsvariablen

| Variable | Beschreibung |
|---|---|
| `IMMOSCOUT_DATA_DIR` | Datenverzeichnis (von Electron gesetzt) |
| `ELECTRON_DEV_PORT` | Port für Electron dev mode (default: 3005) |
| `PORT` | Next.js Server-Port (default: 3847 in Produktion) |

---

## Bekannte Einschränkungen

| Problem | Ursache | Status |
|---|---|---|
| Nur macOS | Chrome-Launch-Code nutzt `open -a` (macOS-only) | Geplant: Windows-Support |
| Kein MAS | Playwright + Chrome nicht MAS-sandbox-kompatibel | Won't fix |
| IS24 Selektoren | IS24 ändert DOM regelmäßig | Bei Bedarf patchen |
| Google OAuth | Geblockt in automatisierten Browsern | Workaround: manueller Login via CDP |
| Große .dmg-Größe (~260MB) | node_modules + Playwright gebündelt | Optimierung geplant |

---

## Lizenz

Copyright © 2024 martinPino. Alle Rechte vorbehalten.  
Kein Open-Source-Lizenz — Verwendung, Kopieren und Verbreitung ohne ausdrückliche Genehmigung nicht gestattet.

---

*WohnungFinder ist kein offizielles Produkt von ImmobilienScout24 GmbH. Die Nutzung automatisierter Tools kann gegen die Nutzungsbedingungen von ImmobilienScout24 verstoßen. Verwendung auf eigene Verantwortung.*
