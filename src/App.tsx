import {
  Clock3,
  FolderOpen,
  History,
  Lock,
  Play,
  RotateCcw,
  ShieldCheck,
  Swords,
  TimerReset,
  Trophy,
  UnlockKeyhole,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AppSnapshot, MatchSummary, SeriesBestOf, SeriesState } from "../electron/types";
import tiltbreakerLogo from "./assets/tiltbreaker-logo.png";
import tiltbreakerMark from "./assets/tiltbreaker-mark.png";

const emptySnapshot: AppSnapshot = {
  lcu: {
    connected: false
  },
  now: Date.now(),
  queueGuard: {
    enabled: true,
    gate: "unavailable"
  },
  recentMatches: [],
  series: {
    games: [],
    losses: 0,
    status: "idle",
    wins: 0
  },
  settings: {
    bestOf: 3,
    breakMinutes: 60,
    queueGuardEnabled: true
  }
};

const seriesOptions = [3, 5] as const;
const breakOptions = [60, 120] as const;

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    let mounted = true;

    window.tiltbreaker.getSnapshot().then((nextSnapshot) => {
      if (mounted) {
        setSnapshot(nextSnapshot);
      }
    });

    const unsubscribe = window.tiltbreaker.onSnapshot(setSnapshot);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const breakRemaining = useMemo(() => {
    if (!snapshot.series.breakUntil) {
      return 0;
    }

    return Math.max(0, snapshot.series.breakUntil - tick);
  }, [snapshot.series.breakUntil, tick]);

  const summonerName =
    snapshot.lcu.summoner?.gameName && snapshot.lcu.summoner?.tagLine
      ? `${snapshot.lcu.summoner.gameName}#${snapshot.lcu.summoner.tagLine}`
      : snapshot.lcu.summoner?.displayName ?? "League Client";

  async function withSnapshot(action: Promise<AppSnapshot>) {
    setSnapshot(await action);
  }

  return (
    <main className="min-h-screen bg-[#101216] text-ink">
      <div className="grid min-h-screen grid-cols-[320px_minmax(0,1fr)]">
        <aside className="overflow-y-auto border-r border-line bg-[#111318] px-5 py-5">
          <div className="relative overflow-hidden rounded-lg border border-[#34284a] bg-[#090a0d] p-2 shadow-[0_0_36px_rgba(255,159,26,0.10)]">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brandPurple via-[#f1f1f1] to-brandOrange" />
            <img
              alt="TiltBreaker - Queue smart. Not tilted."
              className="mx-auto block w-[216px]"
              src={tiltbreakerLogo}
            />
          </div>

          <div className="mt-5 space-y-3">
            <StatusLine
              icon={snapshot.lcu.connected ? <Wifi size={18} /> : <WifiOff size={18} />}
              label="LCU"
              value={snapshot.lcu.connected ? "Connected" : "Offline"}
              tone={snapshot.lcu.connected ? "good" : "bad"}
            />
            <StatusLine
              icon={snapshot.queueGuard.gate === "open" ? <UnlockKeyhole size={18} /> : <Lock size={18} />}
              label="SR gate"
              value={gateLabel(snapshot.queueGuard)}
              tone={snapshot.queueGuard.gate === "open" ? "good" : "warn"}
            />
            <StatusLine
              icon={<Swords size={18} />}
              label="Gameflow"
              value={snapshot.lcu.phase ?? "Unavailable"}
              tone="info"
            />
          </div>

          <section className="mt-6 border-t border-line pt-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Session</h2>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-muted">Series length</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {seriesOptions.map((bestOf) => (
                <button
                  className={`h-10 rounded-md border text-sm font-medium transition ${
                    snapshot.settings.bestOf === bestOf
                      ? "border-brandOrange bg-brandOrange/15 text-brandOrange"
                      : "border-line bg-[#181c22] text-muted hover:border-[#3b4350] hover:text-ink"
                  }`}
                  key={bestOf}
                  onClick={() => withSnapshot(window.tiltbreaker.updateSettings({ bestOf }))}
                  type="button"
                >
                  BO{bestOf}
                </button>
              ))}
            </div>

            <p className="mt-4 text-xs font-medium uppercase tracking-[0.12em] text-muted">Break window</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {breakOptions.map((minutes) => (
                <button
                  className={`h-10 rounded-md border text-sm font-medium transition ${
                    snapshot.settings.breakMinutes === minutes
                      ? "border-brandOrange bg-brandOrange/15 text-brandOrange"
                      : "border-line bg-[#181c22] text-muted hover:border-[#3b4350] hover:text-ink"
                  }`}
                  key={minutes}
                  onClick={() => withSnapshot(window.tiltbreaker.updateSettings({ breakMinutes: minutes }))}
                  type="button"
                >
                  {minutes / 60}h
                </button>
              ))}
            </div>

            <label className="mt-4 flex min-h-11 items-center justify-between rounded-md border border-line bg-[#181c22] px-3 text-sm">
              <span className="flex items-center gap-2 text-muted">
                <ShieldCheck size={17} />
                Queue guard
              </span>
              <input
                checked={snapshot.settings.queueGuardEnabled}
                className="h-4 w-4 accent-brandOrange"
                onChange={(event) =>
                  withSnapshot(window.tiltbreaker.updateSettings({ queueGuardEnabled: event.currentTarget.checked }))
                }
                type="checkbox"
              />
            </label>
          </section>

          <section className="mt-6 border-t border-line pt-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Client</h2>
            <button
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-[#181c22] text-sm font-medium text-ink hover:border-[#3b4350]"
              onClick={() => withSnapshot(window.tiltbreaker.selectLockfile())}
              type="button"
            >
              <FolderOpen size={17} />
              Lockfile
            </button>
            <p className="mt-2 max-h-10 overflow-hidden break-all text-xs leading-5 text-muted">
              {snapshot.lcu.lockfilePath ?? snapshot.settings.lockfilePath ?? "Auto discovery"}
            </p>
          </section>
        </aside>

        <section className="min-w-0">
          <header className="flex min-h-[88px] items-center justify-between border-b border-line bg-[#111318] px-8">
            <div className="flex min-w-0 items-center gap-4">
              <ProfileIcon profileIconId={snapshot.lcu.summoner?.profileIconId} />
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold">{summonerName}</p>
                <p className="truncate text-sm text-muted">
                  {snapshot.lcu.connected ? "Live League Client session" : snapshot.lcu.lastError ?? "Waiting for LCU"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="flex h-10 items-center gap-2 rounded-md border border-brandOrange/50 bg-brandOrange/15 px-4 text-sm font-semibold text-brandOrange hover:border-brandOrange disabled:cursor-not-allowed disabled:border-line disabled:bg-[#181c22] disabled:text-muted"
                disabled={snapshot.series.status === "active"}
                onClick={() => withSnapshot(window.tiltbreaker.startSeries())}
                type="button"
              >
                <Play size={16} />
                Start BO{snapshot.settings.bestOf}
              </button>
              <button
                className="grid size-10 place-items-center rounded-md border border-line bg-[#181c22] text-muted hover:border-[#3b4350] hover:text-ink"
                onClick={() => withSnapshot(window.tiltbreaker.cancelQueue())}
                title="Stop queue"
                type="button"
              >
                <X size={17} />
              </button>
            </div>
          </header>

          <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-6 p-8">
            <section className="min-w-0 space-y-6">
              <SeriesPanel
                breakRemaining={breakRemaining}
                series={snapshot.series}
                settingsBestOf={snapshot.settings.bestOf}
              />

              <section className="rounded-lg border border-line bg-panel">
                <div className="flex h-14 items-center justify-between border-b border-line px-5">
                  <div className="flex items-center gap-2">
                    <Trophy className="text-warn" size={18} />
                    <h2 className="font-semibold">Series Games</h2>
                  </div>
                  {snapshot.series.status === "active" ? (
                    <button
                      className="flex h-9 items-center gap-2 rounded-md border border-line bg-[#1b2027] px-3 text-sm text-muted hover:text-ink"
                      onClick={() => withSnapshot(window.tiltbreaker.endSeries())}
                      type="button"
                    >
                      <TimerReset size={15} />
                      Break
                    </button>
                  ) : (
                    <button
                      className="flex h-9 items-center gap-2 rounded-md border border-line bg-[#1b2027] px-3 text-sm text-muted hover:text-ink"
                      onClick={() => withSnapshot(window.tiltbreaker.clearBreak())}
                      type="button"
                    >
                      <RotateCcw size={15} />
                      Reset
                    </button>
                  )}
                </div>

                <MatchList
                  emptyLabel={`No games in this BO${snapshot.series.bestOf ?? snapshot.settings.bestOf} yet`}
                  matches={snapshot.series.games}
                />
              </section>
            </section>

            <aside className="space-y-6">
              <section className="rounded-lg border border-line bg-panel">
                <div className="flex h-14 items-center gap-2 border-b border-line px-5">
                  <History className="text-info" size={18} />
                  <h2 className="font-semibold">Recent Matches</h2>
                </div>
                <MatchList compact emptyLabel="No LCU matches loaded" matches={snapshot.recentMatches.slice(0, 6)} />
              </section>

              <section className="rounded-lg border border-line bg-panel p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">Guard Activity</h2>
                    <p className="mt-1 text-sm text-muted">{snapshot.queueGuard.lastBlockedReason ?? "No blocks yet"}</p>
                  </div>
                  <div className="grid size-10 place-items-center rounded-lg border border-line bg-[#1b2027] text-warn">
                    <Lock size={18} />
                  </div>
                </div>
                <p className="mt-5 text-3xl font-semibold tabular-nums">
                  {snapshot.queueGuard.lastBlockedAt ? formatClock(snapshot.queueGuard.lastBlockedAt) : "--:--"}
                </p>
                <p className="mt-1 text-sm text-muted">Last queue stop</p>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function SeriesPanel({
  breakRemaining,
  series,
  settingsBestOf
}: {
  breakRemaining: number;
  series: SeriesState;
  settingsBestOf: SeriesBestOf;
}) {
  const bestOf = series.bestOf ?? settingsBestOf;
  const activeSlotCount = Math.max(bestOf, series.games.length);
  const slotGridClass = bestOf === 5 ? "grid-cols-5" : "grid-cols-3 max-w-[340px]";
  const statusLabel =
    series.status === "active" ? `Active BO${bestOf}` : series.status === "break" ? "Break window" : `Ready for BO${bestOf}`;

  return (
    <section className="relative overflow-hidden rounded-lg border border-[#34284a] bg-panel p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brandPurple via-[#f1f1f1] to-brandOrange" />
      <img
        alt=""
        className="pointer-events-none absolute -right-12 -top-20 w-[310px] opacity-[0.08]"
        src={tiltbreakerMark}
      />
      <div className="relative grid gap-5">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-brandOrange">
              <Clock3 size={16} />
              {statusLabel}
            </div>
            <p className="mt-3 text-5xl font-semibold tracking-normal">
              {series.status === "break" ? formatDuration(breakRemaining) : `${series.wins}-${series.losses}`}
            </p>
            <p className="mt-2 text-sm text-muted">
              {series.status === "break"
                ? "Break remaining"
                : series.status === "active"
                  ? "Current series score"
                  : "No active series"}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-brandOrange">
            <Trophy size={16} />
            First to {Math.ceil(bestOf / 2)}
          </div>
        </div>

        <div className={`grid w-full ${slotGridClass} gap-2`}>
          {Array.from({ length: activeSlotCount }).map((_, index) => {
            const match = series.games[index];
            const tone =
              match?.result === "win"
                ? "border-good bg-good/15 text-good"
                : match?.result === "loss"
                  ? "border-brandPurple bg-brandPurple/15 text-brandPurple"
                  : "border-line bg-[#1b2027] text-muted";

            return (
              <div className={`h-24 rounded-lg border p-3 ${tone}`} key={index}>
                <p className="text-xs font-semibold uppercase tracking-[0.12em]">Game {index + 1}</p>
                <p className="mt-4 text-2xl font-semibold">{match ? resultLabel(match.result) : "-"}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MatchList({
  compact = false,
  emptyLabel,
  matches
}: {
  compact?: boolean;
  emptyLabel: string;
  matches: MatchSummary[];
}) {
  if (!matches.length) {
    return <div className="grid min-h-[160px] place-items-center px-5 text-sm text-muted">{emptyLabel}</div>;
  }

  return (
    <div className="divide-y divide-line">
      {matches.map((match) => (
        <div className={`flex items-center gap-3 px-5 ${compact ? "h-[76px]" : "h-[86px]"}`} key={match.gameId}>
          <img
            alt=""
            className="size-12 rounded-md border border-line bg-[#101216]"
            src={window.tiltbreaker.assetUrl(`/lol-game-data/assets/v1/champion-icons/${match.championId}.png`)}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold">{match.championName}</p>
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                  match.result === "win" ? "bg-good/15 text-good" : "bg-bad/15 text-bad"
                }`}
              >
                {resultLabel(match.result)}
              </span>
            </div>
            <p className="mt-1 truncate text-sm text-muted">
              {match.kills}/{match.deaths}/{match.assists} KDA
              {typeof match.cs === "number" ? ` · ${match.cs} CS` : ""}
              {match.durationSeconds ? ` · ${formatDuration(match.durationSeconds * 1000)}` : ""}
            </p>
          </div>
          <div className="text-right text-sm text-muted">
            <p className="font-medium text-ink">{formatClock(match.createdAt)}</p>
            <p className="mt-1">Q{match.queueId ?? "-"}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileIcon({ profileIconId }: { profileIconId?: number }) {
  if (!profileIconId) {
    return (
      <div className="grid size-14 shrink-0 place-items-center rounded-lg border border-line bg-[#1b2027] text-muted">
        <ShieldCheck size={22} />
      </div>
    );
  }

  return (
    <img
      alt=""
      className="size-14 shrink-0 rounded-lg border border-line bg-[#1b2027]"
      src={window.tiltbreaker.assetUrl(`/lol-game-data/assets/v1/profile-icons/${profileIconId}.jpg`)}
    />
  );
}

function StatusLine({
  icon,
  label,
  tone,
  value
}: {
  icon: React.ReactNode;
  label: string;
  tone: "good" | "warn" | "bad" | "info";
  value: string;
}) {
  const toneClass = {
    bad: "text-bad",
    good: "text-good",
    info: "text-info",
    warn: "text-warn"
  }[tone];

  return (
    <div className="flex min-h-12 items-center justify-between rounded-lg border border-line bg-[#181c22] px-3">
      <div className="flex min-w-0 items-center gap-2 text-muted">
        <span className={toneClass}>{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <span className={`max-w-[140px] truncate text-right text-sm font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}

function gateLabel(queueGuard: AppSnapshot["queueGuard"]) {
  if (queueGuard.currentQueue && !queueGuard.currentQueue.isSummonersRift) {
    return "Bypassed";
  }

  if (queueGuard.gate === "open") {
    return "Open";
  }

  if (queueGuard.gate === "closed") {
    return "Locked";
  }

  return "Unavailable";
}

function resultLabel(result: MatchSummary["result"]) {
  if (result === "win") {
    return "Win";
  }

  if (result === "loss") {
    return "Loss";
  }

  return "Game";
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatClock(timestamp: number) {
  if (!timestamp) {
    return "--:--";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}
