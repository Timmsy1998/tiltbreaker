/// <reference types="vite/client" />

import type { AppSnapshot, TiltBreakerSettings } from "../electron/types";

declare global {
  interface Window {
    tiltbreaker: {
      assetUrl(path: string): string;
      cancelQueue(): Promise<AppSnapshot>;
      clearBreak(): Promise<AppSnapshot>;
      endSeries(): Promise<AppSnapshot>;
      getSnapshot(): Promise<AppSnapshot>;
      onSnapshot(callback: (snapshot: AppSnapshot) => void): () => void;
      selectLockfile(): Promise<AppSnapshot>;
      startSeries(): Promise<AppSnapshot>;
      updateSettings(settings: Partial<TiltBreakerSettings>): Promise<AppSnapshot>;
    };
  }
}
