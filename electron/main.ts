import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  nativeImage,
  nativeTheme,
  protocol,
  ipcMain,
  type OpenDialogOptions
} from "electron";
import { join } from "node:path";
import { LcuClient } from "./lcuClient";
import { parseMatches } from "./matchParser";
import { parseRankedSnapshot } from "./rankedParser";
import { getQueueName, isSummonersRiftQueue } from "./queueRules";
import { SessionStore } from "./sessionStore";
import type {
  AppSnapshot,
  LcuPhase,
  LcuStatus,
  QueueContext,
  QueueGuardState,
  SummonerInfo,
  TiltBreakerSettings
} from "./types";

interface LcuLobby {
  gameConfig?: {
    gameMode?: string;
    mapId?: number;
    queueId?: number;
  };
}

interface ChampionSummaryEntry {
  id?: number;
  name?: string;
}

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
let tray: Tray | undefined;
let lcuStatus: LcuStatus = { connected: false };
let queueGuard: QueueGuardState = { enabled: true, gate: "unavailable" };
let pollTimer: NodeJS.Timeout | undefined;
let isQuitting = false;
let championNames = new Map<number, string>();
let championNamesLoadedAt = 0;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#101216",
    icon: getIconPath("ico"),
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

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow?.hide();
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId("app.tiltbreaker.desktop");
  nativeTheme.themeSource = "dark";
  store = new SessionStore(join(app.getPath("userData"), "tiltbreaker-state.json"));
  lcu.setPreferredLockfilePath(store.settings.lockfilePath);
  queueGuard = {
    ...queueGuard,
    enabled: store.settings.queueGuardEnabled
  };

  registerIpc();
  registerAssetProtocol();
  createTray();
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

  if (isQuitting && process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

function createTray() {
  const icon = nativeImage.createFromPath(getIconPath("png"));
  tray = new Tray(icon);
  tray.setToolTip("TiltBreaker");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show TiltBreaker",
        click: showMainWindow
      },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
  tray.on("click", showMainWindow);
}

function showMainWindow() {
  if (!mainWindow) {
    void createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function getIconPath(type: "ico" | "png") {
  return join(__dirname, `../build/icon.${type}`);
}

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

    const [summonerResult, phaseResult, rankedResult] = await Promise.allSettled([
      lcu.requestJson<SummonerInfo>("/lol-summoner/v1/current-summoner"),
      lcu.requestJson<LcuPhase>("/lol-gameflow/v1/gameflow-phase"),
      lcu.requestJson<unknown>("/lol-ranked/v1/current-ranked-stats")
    ]);

    if (summonerResult.status === "rejected" && phaseResult.status === "rejected") {
      throw summonerResult.reason;
    }

    const summoner = summonerResult.status === "fulfilled" ? summonerResult.value : undefined;
    const phase = phaseResult.status === "fulfilled" ? phaseResult.value : undefined;
    const ranked =
      rankedResult.status === "fulfilled" ? parseRankedSnapshot(rankedResult.value) : undefined;

    lcuStatus = {
      connected: true,
      lockfilePath: lcu.lockfilePath,
      phase,
      summoner
    };

    store.updateRanked(ranked);

    if (summoner) {
      try {
        const names = await getChampionNames();
        const matchHistory = await lcu.requestJson<unknown>(
          "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=12"
        );
        store.mergeMatches(parseMatches(matchHistory, summoner, names));
      } catch {
        store.mergeMatches([]);
      }
    }

    const currentQueue = await getCurrentQueue();
    await enforceQueueGuard(phase, currentQueue);
    pushSnapshot();
  } catch (error) {
    lcuStatus = {
      connected: false,
      lockfilePath: lcu.lockfilePath,
      lastError: error instanceof Error ? error.message : "Unable to connect to League Client."
    };
    queueGuard = {
      ...queueGuard,
      currentQueue: undefined,
      gate: "unavailable"
    };
    pushSnapshot();
  }
}

async function enforceQueueGuard(phase?: LcuPhase, currentQueue?: QueueContext) {
  const gate = store.settings.queueGuardEnabled
    ? getQueueGate(currentQueue)
    : lcuStatus.connected
      ? "open"
      : "unavailable";

  queueGuard = {
    ...queueGuard,
    currentQueue,
    enabled: store.settings.queueGuardEnabled,
    gate
  };

  if (!store.settings.queueGuardEnabled || gate !== "closed") {
    return;
  }

  if ((phase === "Matchmaking" || phase === "ReadyCheck") && currentQueue?.isSummonersRift) {
    await cancelQueue(`Summoner's Rift outside active BO${store.settings.bestOf} session`);
  }
}

async function getCurrentQueue(): Promise<QueueContext | undefined> {
  try {
    const lobby = await lcu.requestJson<LcuLobby>("/lol-lobby/v2/lobby");
    const gameConfig = lobby.gameConfig;

    if (!gameConfig) {
      return undefined;
    }

    const queueId = normalizeNumber(gameConfig.queueId);
    const mapId = normalizeNumber(gameConfig.mapId);
    return {
      id: queueId,
      isSummonersRift: isSummonersRiftQueue(queueId, mapId),
      mapId,
      mode: gameConfig.gameMode,
      name: getQueueName(queueId)
    };
  } catch {
    return undefined;
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

function getQueueGate(currentQueue?: QueueContext) {
  if (!lcuStatus.connected) {
    return "unavailable";
  }

  if (currentQueue && !currentQueue.isSummonersRift) {
    return "open";
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

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function getChampionNames() {
  const staleAfterMs = 60 * 60 * 1000;

  if (championNames.size && Date.now() - championNamesLoadedAt < staleAfterMs) {
    return championNames;
  }

  try {
    const response = await lcu.requestJson<unknown>("/lol-game-data/assets/v1/champion-summary.json");
    const entries = Array.isArray(response) ? response : [];
    const names = new Map<number, string>();

    for (const entry of entries as ChampionSummaryEntry[]) {
      if (typeof entry.id === "number" && entry.id >= 0 && entry.name) {
        names.set(entry.id, entry.name);
      }
    }

    if (names.size) {
      championNames = names;
      championNamesLoadedAt = Date.now();
    }
  } catch {
    return championNames;
  }

  return championNames;
}
