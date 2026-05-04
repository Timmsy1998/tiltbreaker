import { contextBridge, ipcRenderer } from "electron";
import type { AppSnapshot, TiltBreakerSettings } from "./types";

const api = {
  assetUrl(path: string) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `tiltbreaker-lcu://asset${normalizedPath}`;
  },
  cancelQueue() {
    return ipcRenderer.invoke("cancel-queue") as Promise<AppSnapshot>;
  },
  clearBreak() {
    return ipcRenderer.invoke("clear-break") as Promise<AppSnapshot>;
  },
  contactDeveloper() {
    return ipcRenderer.invoke("contact-developer") as Promise<void>;
  },
  endSeries() {
    return ipcRenderer.invoke("end-series") as Promise<AppSnapshot>;
  },
  getSnapshot() {
    return ipcRenderer.invoke("snapshot") as Promise<AppSnapshot>;
  },
  onSnapshot(callback: (snapshot: AppSnapshot) => void) {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) => callback(snapshot);
    ipcRenderer.on("snapshot", listener);

    return () => {
      ipcRenderer.removeListener("snapshot", listener);
    };
  },
  selectLockfile() {
    return ipcRenderer.invoke("select-lockfile") as Promise<AppSnapshot>;
  },
  startSeries() {
    return ipcRenderer.invoke("start-series") as Promise<AppSnapshot>;
  },
  updateSettings(settings: Partial<TiltBreakerSettings>) {
    return ipcRenderer.invoke("update-settings", settings) as Promise<AppSnapshot>;
  },
  updateSeriesNote(note: string) {
    return ipcRenderer.invoke("update-series-note", note) as Promise<AppSnapshot>;
  },
  updateCompletedSessionNote(sessionId: string, note: string) {
    return ipcRenderer.invoke("update-completed-session-note", sessionId, note) as Promise<AppSnapshot>;
  }
};

contextBridge.exposeInMainWorld("tiltbreaker", api);

export type TiltBreakerApi = typeof api;
