# TiltBreaker

Queue smart. Not tilted.

TiltBreaker is an Electron desktop app for splitting League of Legends play into best-of-three or best-of-five sessions with enforced one or two hour breaks, completed session history, and LP tracking.

## Commands

```bash
npm install
npm run dev
npm run build
npm run dist
```

`npm run dist` creates a Windows installer at `release/TiltBreaker Setup 1.2.0.exe` and an unpacked executable at `release/win-unpacked/TiltBreaker.exe`.

## LCU integration

The app reads the League Client lockfile, calls the local LCU API, and loads champion/profile art, champion names, match queue names, match history, and ranked LP through the client. The queue guard keeps Summoner's Rift queueing closed unless a BO3 or BO5 is active; ARAM and TFT queues are left alone. Active series scoring also counts Summoner's Rift matches only.

LCU access requires the League Client to be running. If auto-discovery cannot find the lockfile, use the in-app lockfile picker.
