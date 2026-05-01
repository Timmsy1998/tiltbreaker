import {
  BarChart3,
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
import { getQueueName } from "../electron/queueRules";
import type {
  AppSnapshot,
  CompletedSession,
  LpDayState,
  MatchSummary,
  RankedSnapshot,
  SeriesBestOf,
  SeriesState
} from "../electron/types";
import tiltbreakerLogo from "./assets/tiltbreaker-logo.png";
import tiltbreakerMark from "./assets/tiltbreaker-mark.png";

const emptySnapshot: AppSnapshot = {
  completedSessions: [],
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
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
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
      : snapshot.lcu.summoner?.displayName || snapshot.lcu.summoner?.gameName || "League Client";
  const completedHistorySessions = snapshot.completedSessions.filter(isCompleteSession);
  const selectedSession = completedHistorySessions.find((session) => session.id === selectedSessionId);
  const isBreakActive = snapshot.series.status === "break" && breakRemaining > 0;
  const canStartSeries = snapshot.series.status !== "active" && !isBreakActive;

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
                disabled={!canStartSeries}
                onClick={() => withSnapshot(window.tiltbreaker.startSeries())}
                type="button"
              >
                <Play size={16} />
                {isBreakActive ? `Break ${formatDuration(breakRemaining)}` : `Start BO${snapshot.settings.bestOf}`}
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
                      className="flex h-9 items-center gap-2 rounded-md border border-line bg-[#1b2027] px-3 text-sm text-muted hover:text-ink disabled:cursor-not-allowed disabled:text-muted/60"
                      disabled={isBreakActive}
                      onClick={() => withSnapshot(window.tiltbreaker.clearBreak())}
                      title={isBreakActive ? "Break timer is still running" : "Reset series"}
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

              {selectedSession ? <SessionDetail session={selectedSession} /> : null}
            </section>

            <aside className="space-y-6">
              <LpSummary lpDay={snapshot.lpDay} ranked={snapshot.ranked} series={snapshot.series} />

              <SessionHistory
                selectedSessionId={selectedSessionId}
                sessions={completedHistorySessions}
                onSelect={setSelectedSessionId}
              />

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
  const detailLabel = getSeriesDetailLabel(series);

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
            <p className="mt-2 text-sm text-muted">{detailLabel}</p>
          </div>

          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-brandOrange">
            <Trophy size={16} />
            First to {Math.ceil(bestOf / 2)}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Series LP" value={formatLpDelta(series.lpDelta)} tone={getDeltaTone(series.lpDelta)} />
          <StatTile label="Best of" value={`BO${bestOf}`} />
          <StatTile label="Games" value={`${series.games.length}/${bestOf}`} />
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

function getSeriesDetailLabel(series: SeriesState) {
  if (series.status === "break" && series.breakUntil) {
    const endedLabel = series.endedAt ? `Ended ${formatDateTime(series.endedAt)} · ` : "";
    return `${endedLabel}Unlocks ${formatDateTime(series.breakUntil)}`;
  }

  if (series.status === "active") {
    return "Current series score";
  }

  return "No active series";
}

function LpSummary({
  lpDay,
  ranked,
  series
}: {
  lpDay?: LpDayState;
  ranked?: RankedSnapshot;
  series: SeriesState;
}) {
  return (
    <section className="rounded-lg border border-line bg-panel p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">LP Tracker</h2>
          <p className="mt-1 text-sm text-muted">{rankedLabel(ranked)}</p>
        </div>
        <div className="grid size-10 place-items-center rounded-lg border border-line bg-[#1b2027] text-brandOrange">
          <BarChart3 size={18} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <StatTile label="Session" value={formatLpDelta(series.lpDelta)} tone={getDeltaTone(series.lpDelta)} />
        <StatTile label="Today" value={formatLpDelta(lpDay?.delta)} tone={getDeltaTone(lpDay?.delta)} />
      </div>
    </section>
  );
}

function SessionHistory({
  onSelect,
  selectedSessionId,
  sessions
}: {
  onSelect: (sessionId: string) => void;
  selectedSessionId?: string;
  sessions: CompletedSession[];
}) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex h-14 items-center gap-2 border-b border-line px-5">
        <History className="text-info" size={18} />
        <h2 className="font-semibold">Past Sessions</h2>
      </div>

      {!sessions.length ? (
        <div className="grid min-h-[120px] place-items-center px-5 text-sm text-muted">No completed sessions yet</div>
      ) : (
        <div className="divide-y divide-line">
          {sessions.slice(0, 6).map((session) => (
            <button
              className={`flex min-h-[72px] w-full items-center justify-between gap-3 px-5 text-left hover:bg-[#1b2027] ${
                selectedSessionId === session.id ? "bg-brandOrange/10" : ""
              }`}
              key={session.id}
              onClick={() => onSelect(session.id)}
              type="button"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  BO{session.bestOf} · {session.wins}-{session.losses}
                </p>
                <p className="mt-1 text-xs text-muted">{formatDateTime(session.endedAt)}</p>
              </div>
              <div className="text-right">
                <p className={resultClass(session.result)}>{sessionResultLabel(session.result)}</p>
                <p className={`mt-1 text-xs ${getDeltaTextClass(session.lpDelta)}`}>{formatLpDelta(session.lpDelta)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function SessionDetail({ session }: { session: CompletedSession }) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex min-h-14 items-center justify-between border-b border-line px-5">
        <div className="flex items-center gap-2">
          <Trophy className={session.result === "win" ? "text-good" : "text-brandPurple"} size={18} />
          <div>
            <h2 className="font-semibold">Session Detail</h2>
            <p className="text-sm text-muted">{formatDateTime(session.startedAt)}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={resultClass(session.result)}>{sessionResultLabel(session.result)}</p>
          <p className={`text-sm ${getDeltaTextClass(session.lpDelta)}`}>{formatLpDelta(session.lpDelta)}</p>
        </div>
      </div>

      <MatchList emptyLabel="No games recorded for this session" matches={session.games} />
    </section>
  );
}

function isCompleteSession(session: CompletedSession) {
  return session.result !== "incomplete";
}

function StatTile({
  label,
  tone = "neutral",
  value
}: {
  label: string;
  tone?: "good" | "bad" | "neutral";
  value: string;
}) {
  const toneClass = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink";

  return (
    <div className="rounded-md border border-line bg-[#1b2027] px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
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
      {matches.map((match) => {
        const csPerMinute = formatCsPerMinute(match);

        return (
          <div
            className={`flex items-start gap-3 px-5 py-4 ${compact ? "min-h-[84px]" : "min-h-[92px]"}`}
            key={match.gameId}
          >
            <img
              alt=""
              className="size-12 shrink-0 rounded-md border border-line bg-[#101216]"
              src={window.tiltbreaker.assetUrl(`/lol-game-data/assets/v1/champion-icons/${match.championId}.png`)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold">{match.championName}</p>
                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${resultBadgeClass(match.result)}`}>
                  {resultLabel(match.result)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted">
                <span>{match.kills}/{match.deaths}/{match.assists}</span>
                <span>{formatKdaRatio(match)} KDA</span>
                {typeof match.cs === "number" ? (
                  <span>
                    {match.cs} CS{csPerMinute ? ` · ${csPerMinute} CS/m` : ""}
                  </span>
                ) : null}
                {match.durationSeconds ? <span>{formatDuration(match.durationSeconds * 1000)}</span> : null}
              </div>
            </div>
            <div className="shrink-0 text-right text-sm text-muted">
              <p className="font-medium text-ink">{formatClock(match.createdAt)}</p>
              <p className="mt-1 max-w-[112px] truncate">{match.queueName ?? queueLabel(match.queueId)}</p>
            </div>
          </div>
        );
      })}
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

function resultBadgeClass(result: MatchSummary["result"]) {
  if (result === "win") {
    return "bg-good/15 text-good";
  }

  if (result === "loss") {
    return "bg-bad/15 text-bad";
  }

  return "bg-[#252a32] text-muted";
}

function sessionResultLabel(result: CompletedSession["result"]) {
  if (result === "win") {
    return "Overall Win";
  }

  if (result === "loss") {
    return "Overall Loss";
  }

  return "Incomplete";
}

function resultClass(result: CompletedSession["result"]) {
  if (result === "win") {
    return "text-sm font-semibold text-good";
  }

  if (result === "loss") {
    return "text-sm font-semibold text-bad";
  }

  return "text-sm font-semibold text-muted";
}

function queueLabel(queueId?: number) {
  return getQueueName(queueId) ?? "Queue -";
}

function formatKdaRatio(match: MatchSummary) {
  const ratio =
    typeof match.kdaRatio === "number"
      ? match.kdaRatio
      : Number(((match.kills + match.assists) / Math.max(1, match.deaths)).toFixed(2));

  return ratio.toFixed(2);
}

function formatCsPerMinute(match: MatchSummary) {
  if (typeof match.cs !== "number" || !match.durationSeconds) {
    return undefined;
  }

  return (match.cs / (match.durationSeconds / 60)).toFixed(1);
}

function formatLpDelta(delta?: number) {
  if (typeof delta !== "number") {
    return "LP --";
  }

  if (delta > 0) {
    return `+${delta} LP`;
  }

  return `${delta} LP`;
}

function getDeltaTone(delta?: number): "good" | "bad" | "neutral" {
  if (typeof delta !== "number" || delta === 0) {
    return "neutral";
  }

  return delta > 0 ? "good" : "bad";
}

function getDeltaTextClass(delta?: number) {
  const tone = getDeltaTone(delta);

  if (tone === "good") {
    return "text-good";
  }

  if (tone === "bad") {
    return "text-bad";
  }

  return "text-muted";
}

function rankedLabel(ranked?: RankedSnapshot) {
  const primary = ranked?.positions[0];

  if (!primary) {
    return "Ranked LP unavailable";
  }

  const rank = [primary.tier, primary.division].filter(Boolean).join(" ");
  return `${primary.queueName} · ${rank} ${primary.leaguePoints} LP`;
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

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(timestamp);
}
