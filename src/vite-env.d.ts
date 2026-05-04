/// <reference types="vite/client" />

import type { AppSnapshot, TiltBreakerSettings } from "../electron/types";

declare global {
  const __APP_VERSION__: string;

  interface Window {
    tiltbreaker: {
      assetUrl(path: string): string;
      cancelQueue(): Promise<AppSnapshot>;
      clearBreak(): Promise<AppSnapshot>;
      contactDeveloper(): Promise<void>;
      endSeries(): Promise<AppSnapshot>;
      getSnapshot(): Promise<AppSnapshot>;
      onSnapshot(callback: (snapshot: AppSnapshot) => void): () => void;
      selectLockfile(): Promise<AppSnapshot>;
      startSeries(): Promise<AppSnapshot>;
      updateCompletedSessionNote(sessionId: string, note: string): Promise<AppSnapshot>;
      updateSettings(settings: Partial<TiltBreakerSettings>): Promise<AppSnapshot>;
      updateSeriesNote(note: string): Promise<AppSnapshot>;
    };
  }
}
