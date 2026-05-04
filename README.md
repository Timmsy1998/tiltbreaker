# TiltBreaker

Queue smart. Not tilted.

TiltBreaker is a desktop app for League of Legends players who want a little friction between games.

Start a BO3 or BO5 session, play your Summoner's Rift games, then take a one or two hour break before queueing again. The app connects to the local League Client, watches your recent games, tracks LP movement, and can keep the Summoner's Rift queue closed when you are outside an active session.

## Features

- BO3 and BO5 session tracking
- One or two hour break windows after a session ends
- Queue guard for Summoner's Rift matchmaking and ready checks
- Tray notifications for break starts, queue blocks, and break completion
- Dedicated break screen with countdown progress
- Session notes for active, break, and completed sessions
- Trend dashboard with LP, result, champion, and role graphs
- Responsive desktop layout with light and dark appearance modes
- Recent match history with champion, role, queue, KDA, CS, gold, and result
- Ranked LP tracking for the current session and day
- Completed session history
- Optional start with Windows
- Discord contact button for the developer
- Manual lockfile picker when League Client auto-detection fails

ARAM, TFT, Arena, and other non-Summoner's Rift queues are left alone by the queue guard.

## Getting Started

You will need:

- Windows
- League of Legends installed
- Node.js and npm

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run dev
```

Build the app:

```bash
npm run build
```

Create a Windows installer:

```bash
npm run dist
```

The installer is written to `release/`. The unpacked executable is written to `release/win-unpacked/TiltBreaker.exe`.

## How To Use It

1. Open the League Client.
2. Start TiltBreaker.
3. Pick BO3 or BO5.
4. Pick a one or two hour break window.
5. Click `Start BO3` or `Start BO5`.
6. Play the session.

When the session finishes, TiltBreaker starts the break timer and closes the Summoner's Rift gate until the break is over. You can still play non-Summoner's Rift modes during that time.

Use `Session Notes` to save local notes against the current session or a past session. Use `Contact Developer` to open Discord for `fatbaldbrit`.

If the app cannot find the League Client automatically, click `Lockfile` and select the client's `lockfile` manually.

## League Client Access

TiltBreaker uses the local League Client Update API. That means the League Client must be running before the app can read your summoner, ranked, match history, queue, and champion data.

The app stores its session data locally in Electron's app data folder. It does not send your match history, account data, or LP information to a server.

## Useful Commands

```bash
npm run typecheck
npm run build
npm run dist
```

## Project Structure

```text
electron/        Electron main process, LCU client, queue guard, and local state
src/             React UI
build/           App icons used by Electron Builder
scripts/         Packaging hooks
```

## Disclaimer

TiltBreaker is a community project and is not endorsed by Riot Games. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.

## License

MIT. See [LICENSE](LICENSE).

## Contributing

Issues and pull requests are welcome. Please keep changes focused and include a short note about what you tested.
