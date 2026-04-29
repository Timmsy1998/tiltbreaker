import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, type OpenDialogOptions } from "electron";
import { join } from "node:path";
import { LcuClient } from "./lcuClient";
import { parseMatches } from "./matchParser";
import { SessionStore } from "./sessionStore";
import type { AppSnapshot, LcuPhase, LcuStatus, QueueGuardState, SummonerInfo, TiltBreakerSettings } from "./types";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "tiltbreaker-lcu",
    privileges: {
      bypassCSP: true,
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true
    }
  }
]);

const lcu = new LcuClient();
let store: SessionStore;
let mainWindow: BrowserWindow | undefined;
let lcuStatus: LcuStatus = { connected: false };
let queueGuard: QueueGuardState = { enabled: true, gate: "unavailable" };
let pollTimer: NodeJS.Timeout | undefined;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#101216",
    title: "TiltBreaker",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = "dark";
  store = new SessionStore(join(app.getPath("userData"), "tiltbreaker-state.json"));
  lcu.setPreferredLockfilePath(store.settings.lockfilePath);
  queueGuard = {
    ...queueGuard,
    enabled: store.settings.queueGuardEnabled
  };

  registerIpc();
  registerAssetProtocol();
  await createWindow();
  startPolling();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (pollTimer) {
    clearInterval(pollTimer);
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpc() {
  ipcMain.handle("snapshot", () => snapshot());

  ipcMain.handle("start-series", () => {
    store.startSeries();
    return snapshot();
  });

  ipcMain.handle("end-series", () => {
    store.endSeries();
    return snapshot();
  });

  ipcMain.handle("clear-break", () => {
    store.clearBreak();
    return snapshot();
  });

  ipcMain.handle("cancel-queue", async () => {
    await cancelQueue("Manual queue stop");
    return snapshot();
  });

  ipcMain.handle("update-settings", (_event, settings: Partial<TiltBreakerSettings>) => {
    store.updateSettings(settings);
    lcu.setPreferredLockfilePath(store.settings.lockfilePath);
    queueGuard = {
      ...queueGuard,
      enabled: store.settings.queueGuardEnabled
    };
    return snapshot();
  });

  ipcMain.handle("select-lockfile", async () => {
    const dialogOptions: OpenDialogOptions = {
      title: "Select League Client lockfile",
      properties: ["openFile"]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || !result.filePaths[0]) {
      return snapshot();
    }

    store.updateSettings({ lockfilePath: result.filePaths[0] });
    lcu.setPreferredLockfilePath(result.filePaths[0]);
    return snapshot();
  });
}

function registerAssetProtocol() {
  protocol.handle("tiltbreaker-lcu", async (request) => {
    const url = new URL(request.url);
    const endpoint = decodeURI(url.pathname);

    try {
      const asset = await lcu.requestBuffer(endpoint);

      return new Response(new Uint8Array(asset.buffer), {
        headers: {
          "Content-Type": asset.contentType
        }
      });
    } catch {
      return new Response(undefined, { status: 404 });
    }
  });
}

function startPolling() {
  void pollLcu();
  pollTimer = setInterval(() => {
    void pollLcu();
  }, 2000);
}

async function pollLcu() {
  try {
    lcu.setPreferredLockfilePath(store.settings.lockfilePath);

    const [summonerResult, phaseResult] = await Promise.allSettled([
      lcu.requestJson<SummonerInfo>("/lol-summoner/v1/current-summoner"),
      lcu.requestJson<LcuPhase>("/lol-gameflow/v1/gameflow-phase")
    ]);

    if (summonerResult.status === "rejected" && phaseResult.status === "rejected") {
      throw summonerResult.reason;
    }

    const summoner = summonerResult.status === "fulfilled" ? summonerResult.value : undefined;
    const phase = phaseResult.status === "fulfilled" ? phaseResult.value : undefined;

    lcuStatus = {
      connected: true,
      lockfilePath: lcu.lockfilePath,
      phase,
      summoner
    };

    if (summoner) {
      try {
        const matchHistory = await lcu.requestJson<unknown>(
          "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=12"
        );
        store.mergeMatches(parseMatches(matchHistory, summoner));
      } catch {
        store.mergeMatches([]);
      }
    }

    await enforceQueueGuard(phase);
    pushSnapshot();
  } catch (error) {
    lcuStatus = {
      connected: false,
      lockfilePath: lcu.lockfilePath,
      lastError: error instanceof Error ? error.message : "Unable to connect to League Client."
    };
    queueGuard = {
      ...queueGuard,
      gate: "unavailable"
    };
    pushSnapshot();
  }
}

async function enforceQueueGuard(phase?: LcuPhase) {
  const gate = getQueueGate();

  queueGuard = {
    ...queueGuard,
    enabled: store.settings.queueGuardEnabled,
    gate
  };

  if (!store.settings.queueGuardEnabled || gate !== "closed") {
    return;
  }

  if (phase === "Matchmaking" || phase === "ReadyCheck") {
    await cancelQueue("Outside active BO3 session");
  }
}

async function cancelQueue(reason: string) {
  await Promise.allSettled([
    lcu.requestJson<void>("/lol-lobby/v2/lobby/matchmaking/search", { method: "DELETE" }),
    lcu.requestJson<void>("/lol-matchmaking/v1/ready-check/decline", { method: "POST" })
  ]);

  queueGuard = {
    ...queueGuard,
    lastBlockedAt: Date.now(),
    lastBlockedReason: reason
  };
}

function getQueueGate() {
  if (!lcuStatus.connected) {
    return "unavailable";
  }

  if (store.series.status !== "active") {
    return "closed";
  }

  return "open";
}

function snapshot(): AppSnapshot {
  store.normalizeBreak();

  return store.snapshot({
    lcu: lcuStatus,
    now: Date.now(),
    queueGuard
  });
}

function pushSnapshot() {
  mainWindow?.webContents.send("snapshot", snapshot());
}
