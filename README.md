# TiltBreaker

Queue smart. Not tilted.

TiltBreaker is an Electron desktop app for splitting League of Legends play into best-of-three sessions with enforced 60, 90, or 120 minute breaks.

## Commands

```bash
npm install
npm run dev
npm run build
npm run dist
```

`npm run dist` creates a Windows installer at `release/TiltBreaker Setup 0.1.0.exe` and an unpacked executable at `release/win-unpacked/TiltBreaker.exe`.

## LCU integration

The app reads the League Client lockfile, calls the local LCU API, and loads champion/profile art through the client. The queue guard keeps queueing closed unless a BO3 is active; if matchmaking or ready check starts outside an active series, TiltBreaker sends LCU requests to stop the search or decline the ready check.

LCU access requires the League Client to be running. If auto-discovery cannot find the lockfile, use the in-app lockfile picker.
