import { app, BrowserWindow, shell, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import * as path from "path";
import * as http from "http";
import * as fs from "fs";
import {
  registerLicenseIpc,
  verifyLicenseOnStartup,
} from "./licensing/ipc";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const isDev = !app.isPackaged;
const PORT = 3847; // fixed internal port for production

// Store runtime data (contacted.json, schedule.json, browser-profile, etc.)
// in the user's AppData folder so it survives app updates.
const DATA_DIR = app.getPath("userData");
process.env.IMMOSCOUT_DATA_DIR = DATA_DIR;
process.env.PORT = String(PORT);

// NODE_ENV is set by electron-builder automatically in production builds

let mainWindow: BrowserWindow | null = null;
let serverStarted = false;

// ---------------------------------------------------------------------------
// Start Next.js standalone server (production only)
// ---------------------------------------------------------------------------

function startProductionServer(): void {
  if (serverStarted) return;
  serverStarted = true;

  const appRoot = path.join(process.resourcesPath, "app");
  const serverEntry = path.join(appRoot, ".next", "standalone", "server.js");

  if (!fs.existsSync(serverEntry)) {
    dialog.showErrorBox(
      "Startfehler",
      `Server nicht gefunden: ${serverEntry}\nBitte die App neu installieren.`
    );
    app.quit();
    return;
  }

  // Standalone server needs the correct working directory
  process.chdir(appRoot);

  // Copy static files path for standalone
  process.env.NEXT_SHARP_PATH = "";

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(serverEntry);
  } catch (err) {
    dialog.showErrorBox("Serverfehler", String(err));
    app.quit();
  }
}

// ---------------------------------------------------------------------------
// Wait for server to be ready
// ---------------------------------------------------------------------------

function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      http
        .get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else {
            retry();
          }
        })
        .on("error", retry);
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Server did not start within ${timeoutMs / 1000}s`));
      } else {
        setTimeout(check, 400);
      }
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// Create the main window
// ---------------------------------------------------------------------------

async function createWindow(): Promise<void> {
  const loadingWin = new BrowserWindow({
    width: 340,
    height: 200,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: "#f9fafb",
    webPreferences: { nodeIntegration: false },
  });

  loadingWin.loadURL(
    `data:text/html,<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb;color:#374151"><p>ImmoScout Automation wird gestartet…</p></body>`
  );

  const devPort = process.env.ELECTRON_DEV_PORT || "3005";
  const url = isDev ? `http://localhost:${devPort}` : `http://localhost:${PORT}`;

  if (!isDev) {
    startProductionServer();
    try {
      await waitForServer(url);
    } catch (err) {
      dialog.showErrorBox("Timeout", `Server konnte nicht gestartet werden: ${err}`);
      app.quit();
      return;
    }
  }

  loadingWin.close();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f9fafb",
    title: "ImmoScout24 Automation",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Preload bridge that exposes window.license to the renderer.
      // Compiled output lives next to main.js in dist-electron/.
      preload: path.join(__dirname, "preload.js"),
    },
  });

  await mainWindow.loadURL(url);

  // Open external links in the default browser, not in the Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url: extUrl }) => {
    shell.openExternal(extUrl);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", () => {
    dialog.showMessageBox({
      type: "info",
      title: "Update verfügbar",
      message: "Eine neue Version wird heruntergeladen und beim nächsten Start installiert.",
      buttons: ["OK"],
    });
  });

  autoUpdater.on("error", (err) => {
    console.error("AutoUpdater error:", err);
  });

  autoUpdater.checkForUpdatesAndNotify().catch(console.error);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Register licensing IPC handlers and run an initial verification so the
  // renderer has license state ready as soon as window.license is queried.
  registerLicenseIpc();
  verifyLicenseOnStartup().catch((err) =>
    console.error("[licensing] initial verifyLicense failed:", err)
  );

  await createWindow();

  if (!isDev) {
    setupAutoUpdater();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
