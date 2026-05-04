import {
  BarChart3,
  Bell,
  Clock3,
  FolderOpen,
  History,
  Lock,
  MessageCircle,
  Play,
  Power,
  RotateCcw,
  Save,
  ShieldCheck,
  StickyNote,
  Swords,
  TimerReset,
  Trophy,
  UnlockKeyhole,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
    autoStartEnabled: false,
    bestOf: 3,
    breakMinutes: 60,
    notificationsEnabled: true,
    queueGuardEnabled: true
  }
};

const seriesOptions = [3, 5] as const;
const breakOptions = [60, 120] as const;

interface ChartPoint {
  label: string;
  value: number;
}

interface ChampionTrend {
  games: number;
  name: string;
  winRate?: number;
}

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

  async function saveSeriesNote(note: string) {
    setSnapshot(await window.tiltbreaker.updateSeriesNote(note));
  }

  async function saveCompletedSessionNote(sessionId: string, note: string) {
    setSnapshot(await window.tiltbreaker.updateCompletedSessionNote(sessionId, note));
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
            <p className="pb-1 text-center text-xs font-medium text-muted">v{__APP_VERSION__}</p>
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
            <label className="mt-2 flex min-h-11 items-center justify-between rounded-md border border-line bg-[#181c22] px-3 text-sm">
              <span className="flex items-center gap-2 text-muted">
                <Bell size={17} />
                Notifications
              </span>
              <input
                checked={snapshot.settings.notificationsEnabled}
                className="h-4 w-4 accent-brandOrange"
                onChange={(event) =>
                  withSnapshot(window.tiltbreaker.updateSettings({ notificationsEnabled: event.currentTarget.checked }))
                }
                type="checkbox"
              />
            </label>
          </section>

          <section className="mt-6 border-t border-line pt-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Client</h2>
            <label className="mt-3 flex min-h-11 items-center justify-between rounded-md border border-line bg-[#181c22] px-3 text-sm">
              <span className="flex items-center gap-2 text-muted">
                <Power size={17} />
                Start with Windows
              </span>
              <input
                checked={snapshot.settings.autoStartEnabled}
                className="h-4 w-4 accent-brandOrange"
                onChange={(event) =>
                  withSnapshot(window.tiltbreaker.updateSettings({ autoStartEnabled: event.currentTarget.checked }))
                }
                type="checkbox"
              />
            </label>
            <button
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-[#181c22] text-sm font-medium text-ink hover:border-[#3b4350]"
              onClick={() => withSnapshot(window.tiltbreaker.selectLockfile())}
              type="button"
            >
              <FolderOpen size={17} />
              Lockfile
            </button>
            <button
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-[#181c22] text-sm font-medium text-ink hover:border-[#3b4350]"
              onClick={() => void window.tiltbreaker.contactDeveloper()}
              type="button"
            >
              <MessageCircle size={17} />
              Contact Developer
            </button>
            <p className="mt-2 text-xs leading-5 text-muted">Discord: fatbaldbrit</p>
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
              {isBreakActive ? (
                <BreakScreen
                  breakRemaining={breakRemaining}
                  series={snapshot.series}
                  settingsBestOf={snapshot.settings.bestOf}
                  onSaveNote={saveSeriesNote}
                />
              ) : (
                <>
                  <SeriesPanel
                    breakRemaining={breakRemaining}
                    series={snapshot.series}
                    settingsBestOf={snapshot.settings.bestOf}
                  />

                  {snapshot.series.startedAt ? (
                    <SessionNoteEditor note={snapshot.series.note} storageKey="current-series" onSave={saveSeriesNote} />
                  ) : null}

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
                </>
              )}

              <TrendDashboard sessions={completedHistorySessions} recentMatches={snapshot.recentMatches} />

              {selectedSession ? (
                <SessionDetail
                  session={selectedSession}
                  onSaveNote={(note) => saveCompletedSessionNote(selectedSession.id, note)}
                />
              ) : null}
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
  const countedGames = getCountedSeriesGames(series.games);
  const activeSlotCount = Math.max(bestOf, countedGames.length);
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
          <StatTile label="Games" value={`${countedGames.length}/${bestOf}`} />
        </div>

        <div className={`grid w-full ${slotGridClass} gap-2`}>
          {Array.from({ length: activeSlotCount }).map((_, index) => {
            const match = countedGames[index];
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

function BreakScreen({
  breakRemaining,
  onSaveNote,
  series,
  settingsBestOf
}: {
  breakRemaining: number;
  onSaveNote: (note: string) => Promise<void>;
  series: SeriesState;
  settingsBestOf: SeriesBestOf;
}) {
  const bestOf = series.bestOf ?? settingsBestOf;
  const progress = getBreakProgress(series, breakRemaining);

  return (
    <section className="relative overflow-hidden rounded-lg border border-[#34284a] bg-panel">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brandPurple via-[#f1f1f1] to-brandOrange" />
      <img
        alt=""
        className="pointer-events-none absolute -right-16 -top-24 w-[360px] opacity-[0.08]"
        src={tiltbreakerMark}
      />

      <div className="relative p-6">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-brandOrange">
              <Clock3 size={16} />
              Break Screen
            </div>
            <p className="mt-3 text-6xl font-semibold tracking-normal">{formatDuration(breakRemaining)}</p>
            <p className="mt-2 text-sm text-muted">
              {series.breakUntil ? `Queue unlocks ${formatDateTime(series.breakUntil)}` : "Queue is cooling down"}
            </p>
          </div>
          <div className="rounded-md border border-line bg-[#1b2027] px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Last BO{bestOf}</p>
            <p className="mt-1 text-2xl font-semibold">
              {series.wins}-{series.losses}
            </p>
          </div>
        </div>

        <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#252a32]">
          <div className="h-full bg-brandOrange transition-[width]" style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <StatTile label="Series LP" value={formatLpDelta(series.lpDelta)} tone={getDeltaTone(series.lpDelta)} />
          <StatTile label="Games" value={`${getCountedSeriesGames(series.games).length}/${bestOf}`} />
          <StatTile label="Status" value="Locked" tone="bad" />
        </div>
      </div>

      <div className="relative border-t border-line px-5 py-5">
        <SessionNoteEditor
          note={series.note}
          storageKey={`break-${series.startedAt ?? "series"}`}
          onSave={onSaveNote}
          variant="embedded"
        />
      </div>

      <div className="relative border-t border-line">
        <div className="flex h-14 items-center gap-2 px-5">
          <Trophy className="text-warn" size={18} />
          <h2 className="font-semibold">Break Session</h2>
        </div>
        <MatchList emptyLabel="No games recorded for this break" matches={series.games} />
      </div>
    </section>
  );
}

function SessionNoteEditor({
  note = "",
  onSave,
  storageKey,
  variant = "panel"
}: {
  note?: string;
  onSave: (note: string) => Promise<void>;
  storageKey: string;
  variant?: "embedded" | "panel";
}) {
  const [draft, setDraft] = useState(note);
  const [savedNote, setSavedNote] = useState(note);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    setDraft(note);
    setSavedNote(note);
    savingRef.current = false;
    setSaving(false);
  }, [note, storageKey]);

  const hasChanges = draft !== savedNote;

  async function saveNote() {
    if (!hasChanges || savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(draft);
      setSavedNote(draft);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className={variant === "embedded" ? "" : "rounded-lg border border-line bg-panel p-5"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StickyNote className="text-info" size={18} />
          <h2 className="font-semibold">Session Notes</h2>
        </div>
        <button
          className="flex h-9 items-center gap-2 rounded-md border border-line bg-[#1b2027] px-3 text-sm text-muted hover:text-ink disabled:cursor-not-allowed disabled:text-muted/60"
          disabled={!hasChanges || saving}
          onClick={() => void saveNote()}
          type="button"
        >
          <Save size={15} />
          {saving ? "Saving" : hasChanges ? "Save" : "Saved"}
        </button>
      </div>
      <textarea
        className="mt-4 min-h-28 w-full resize-y rounded-md border border-line bg-[#101216] px-3 py-3 text-sm leading-6 text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brandOrange"
        maxLength={2000}
        onBlur={() => void saveNote()}
        onChange={(event) => setDraft(event.currentTarget.value)}
        placeholder="Add notes for this session"
        value={draft}
      />
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{hasChanges ? "Unsaved changes" : "Saved locally"}</span>
        <span>{draft.length}/2000</span>
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

function TrendDashboard({
  recentMatches,
  sessions
}: {
  recentMatches: MatchSummary[];
  sessions: CompletedSession[];
}) {
  const trends = useMemo(() => buildTrendDashboard(sessions, recentMatches), [sessions, recentMatches]);

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex h-14 items-center justify-between border-b border-line px-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="text-info" size={18} />
          <h2 className="font-semibold">Trend Dashboard</h2>
        </div>
        <p className="text-sm text-muted">Last {Math.max(trends.sessionCount, trends.matchCount)} records</p>
      </div>

      <div className="grid grid-cols-4 gap-2 border-b border-line p-5">
        <StatTile label="Sessions" value={`${trends.sessionCount}`} />
        <StatTile label="Win Rate" value={formatPercent(trends.sessionWinRate)} tone={getRateTone(trends.sessionWinRate)} />
        <StatTile label="LP Total" value={formatLpDelta(trends.totalLp)} tone={getDeltaTone(trends.totalLp)} />
        <StatTile label="Avg KDA" value={trends.averageKda ? trends.averageKda.toFixed(2) : "--"} />
      </div>

      <div className="grid grid-cols-2 gap-5 p-5">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">LP Trend</h3>
            <p className="text-xs text-muted">Cumulative</p>
          </div>
          <LineGraph points={trends.lpPoints} />
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Series Results</h3>
            <p className="text-xs text-muted">Wins/Losses</p>
          </div>
          <SessionResultGraph sessions={trends.resultSessions} />
        </div>
      </div>

      <div className="border-t border-line p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Champion Form</h3>
          <p className="text-xs text-muted">Recent matches</p>
        </div>
        <ChampionBars champions={trends.championStats} />
      </div>
    </section>
  );
}

function LineGraph({ points }: { points: ChartPoint[] }) {
  if (!points.length) {
    return <EmptyGraph label="No LP trend yet" />;
  }

  const width = 320;
  const height = 128;
  const padding = 16;
  const values = points.map((point) => point.value);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const range = Math.max(1, maxValue - minValue);
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : padding + (index / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - minValue) / range) * (height - padding * 2);
    return { ...point, x, y };
  });
  const zeroY = height - padding - ((0 - minValue) / range) * (height - padding * 2);

  return (
    <svg aria-label="LP trend graph" className="h-32 w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
      <line stroke="#2a3038" strokeWidth="1" x1={padding} x2={width - padding} y1={zeroY} y2={zeroY} />
      <polyline
        fill="none"
        points={coordinates.map((point) => `${point.x},${point.y}`).join(" ")}
        stroke="#ff9f1a"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      {coordinates.map((point) => (
        <g key={`${point.label}-${point.x}`}>
          <circle cx={point.x} cy={point.y} fill="#15181d" r="4" stroke="#ff9f1a" strokeWidth="2" />
          <text fill="#8d96a3" fontSize="9" textAnchor="middle" x={point.x} y={height - 2}>
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function SessionResultGraph({ sessions }: { sessions: CompletedSession[] }) {
  if (!sessions.length) {
    return <EmptyGraph label="No completed sessions yet" />;
  }

  const width = 320;
  const height = 128;
  const padding = 16;
  const gap = 8;
  const maxGames = Math.max(...sessions.map((session) => Math.max(session.bestOf, session.wins + session.losses)));
  const barWidth = Math.max(14, (width - padding * 2 - gap * (sessions.length - 1)) / sessions.length);

  return (
    <svg aria-label="Session result graph" className="h-32 w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
      {sessions.map((session, index) => {
        const x = padding + index * (barWidth + gap);
        const drawableHeight = height - padding * 2;
        const winHeight = (session.wins / maxGames) * drawableHeight;
        const lossHeight = (session.losses / maxGames) * drawableHeight;
        const lossY = height - padding - lossHeight;
        const winY = lossY - winHeight;

        return (
          <g key={session.id}>
            <rect fill="#ec5f67" height={lossHeight} rx="3" width={barWidth} x={x} y={lossY} />
            <rect fill="#27c07d" height={winHeight} rx="3" width={barWidth} x={x} y={winY} />
            <text fill="#8d96a3" fontSize="9" textAnchor="middle" x={x + barWidth / 2} y={height - 2}>
              {session.wins}-{session.losses}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ChampionBars({ champions }: { champions: ChampionTrend[] }) {
  if (!champions.length) {
    return <div className="grid min-h-24 place-items-center text-sm text-muted">No champion trend yet</div>;
  }

  const maxGames = Math.max(...champions.map((champion) => champion.games));

  return (
    <div className="space-y-3">
      {champions.map((champion) => (
        <div className="grid grid-cols-[130px_minmax(0,1fr)_64px] items-center gap-3" key={champion.name}>
          <p className="truncate text-sm font-medium">{champion.name}</p>
          <div className="h-3 overflow-hidden rounded-full bg-[#252a32]">
            <div
              className="h-full rounded-full bg-info"
              style={{ width: `${Math.max(8, (champion.games / maxGames) * 100)}%` }}
            />
          </div>
          <p className="text-right text-xs text-muted">{formatPercent(champion.winRate)}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyGraph({ label }: { label: string }) {
  return (
    <div className="grid h-32 place-items-center rounded-md border border-dashed border-line bg-[#101216] text-sm text-muted">
      {label}
    </div>
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

function SessionDetail({ onSaveNote, session }: { onSaveNote: (note: string) => Promise<void>; session: CompletedSession }) {
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

      <div className="border-b border-line p-5">
        <SessionNoteEditor note={session.note} storageKey={session.id} onSave={onSaveNote} variant="embedded" />
      </div>

      <MatchList emptyLabel="No games recorded for this session" matches={session.games} />
    </section>
  );
}

function isCompleteSession(session: CompletedSession) {
  return session.result !== "incomplete";
}

function getBreakProgress(series: SeriesState, breakRemaining: number) {
  if (!series.endedAt || !series.breakUntil) {
    return 0;
  }

  const total = Math.max(1, series.breakUntil - series.endedAt);
  const elapsed = Math.min(total, Math.max(0, total - breakRemaining));
  return Math.round((elapsed / total) * 100);
}

function buildTrendDashboard(sessions: CompletedSession[], recentMatches: MatchSummary[]) {
  const completedSessions = sessions.filter(isCompleteSession).sort((a, b) => a.endedAt - b.endedAt);
  const resultSessions = completedSessions.slice(-8);
  const lpSessions = completedSessions.filter((session) => typeof session.lpDelta === "number").slice(-10);
  let cumulativeLp = 0;
  const lpPoints = lpSessions.map((session) => {
    cumulativeLp += session.lpDelta ?? 0;
    return {
      label: formatShortDate(session.endedAt),
      value: cumulativeLp
    };
  });
  const sessionWins = completedSessions.filter((session) => session.result === "win").length;
  const sessionsWithLp = completedSessions.filter((session) => typeof session.lpDelta === "number");
  const totalLp = sessionsWithLp.reduce((total, session) => total + (session.lpDelta ?? 0), 0);
  const matches = getTrendMatches(completedSessions, recentMatches);
  const averageKda = matches.length
    ? matches.reduce((total, match) => total + match.kdaRatio, 0) / matches.length
    : undefined;

  return {
    averageKda,
    championStats: getChampionTrends(matches),
    lpPoints,
    matchCount: matches.length,
    resultSessions,
    sessionCount: completedSessions.length,
    sessionWinRate: completedSessions.length ? sessionWins / completedSessions.length : undefined,
    totalLp
  };
}

function getTrendMatches(sessions: CompletedSession[], recentMatches: MatchSummary[]) {
  const matchesById = new Map<number, MatchSummary>();

  for (const match of [...recentMatches, ...sessions.flatMap((session) => session.games)]) {
    if (!matchesById.has(match.gameId)) {
      matchesById.set(match.gameId, match);
    }
  }

  return [...matchesById.values()]
    .filter((match) => match.result === "win" || match.result === "loss")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 30);
}

function getChampionTrends(matches: MatchSummary[]): ChampionTrend[] {
  const championMap = new Map<string, { games: number; wins: number }>();

  for (const match of matches) {
    const current = championMap.get(match.championName) ?? { games: 0, wins: 0 };
    championMap.set(match.championName, {
      games: current.games + 1,
      wins: current.wins + (match.result === "win" ? 1 : 0)
    });
  }

  return [...championMap.entries()]
    .map(([name, stats]) => ({
      games: stats.games,
      name,
      winRate: stats.games ? stats.wins / stats.games : undefined
    }))
    .sort((a, b) => b.games - a.games || (b.winRate ?? 0) - (a.winRate ?? 0))
    .slice(0, 5);
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

  if (result === "remake") {
    return "Remake";
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

  if (result === "remake") {
    return "bg-warn/15 text-warn";
  }

  return "bg-[#252a32] text-muted";
}

function getCountedSeriesGames(matches: MatchSummary[]) {
  return matches.filter((match) => match.result === "win" || match.result === "loss");
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

function getRateTone(rate?: number): "good" | "bad" | "neutral" {
  if (typeof rate !== "number") {
    return "neutral";
  }

  return rate >= 0.5 ? "good" : "bad";
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

function formatShortDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short"
  }).format(timestamp);
}

function formatPercent(rate?: number) {
  if (typeof rate !== "number") {
    return "--";
  }

  return `${Math.round(rate * 100)}%`;
}
