import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Play, Activity, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card, Empty } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import { WEEK_LABELS, DAY_LABELS, DAYS_PER_WEEK, type Program, type WorkoutLog } from "@/lib/531";
import { isCycleComplete, defaultTmBump } from "@/lib/cycle";

export const Route = createFileRoute("/")({
  component: Home,
});

function buildLift1RMData(prog: Program | null, logs: WorkoutLog[]) {
  if (!prog) return [];
  return prog.main_lifts.map((l) => {
    // Match across cycles by lift_name (case-insensitive) to survive program edits.
    const target = l.name.trim().toLowerCase();
    const liftLogs = logs
      .filter((lg) => (lg.lift_name ?? "").trim().toLowerCase() === target && lg.program_id === prog.id && lg.e1rm)
      .sort((a, b) => a.date.localeCompare(b.date));
    const latest = liftLogs.length ? liftLogs[liftLogs.length - 1].e1rm : null;
    const prev = liftLogs.length > 1 ? liftLogs[liftLogs.length - 2].e1rm : null;
    const trend = latest && prev ? Number(latest) - Number(prev) : 0;
    return { name: l.name, latest, trend };
  });
}

function isWorkoutDone(prog: Program, logs: WorkoutLog[], cycle: number, week: number, day: number) {
  return logs.some(
    (l) =>
      l.program_id === prog.id &&
      l.cycle === cycle &&
      l.week === week &&
      l.day === day &&
      (l.type === "main" || l.type === "supp"),
  );
}

function isWorkoutSkipped(prog: Program, logs: WorkoutLog[], cycle: number, week: number, day: number) {
  return logs.some(
    (l) =>
      l.program_id === prog.id &&
      l.cycle === cycle &&
      l.week === week &&
      l.day === day &&
      l.type === "skip",
  );
}

function getLatestDateForCell(prog: Program, logs: WorkoutLog[], cycle: number, week: number, day: number): string | null {
  const matching = logs.filter(
    (l) =>
      l.program_id === prog.id &&
      l.cycle === cycle &&
      l.week === week &&
      l.day === day &&
      (l.type === "main" || l.type === "supp" || l.type === "skip"),
  );
  if (!matching.length) return null;
  return matching.reduce((acc, l) => (l.date > acc ? l.date : acc), matching[0].date);
}

function Home() {
  const navigate = useNavigate();
  const { activeProgram, logs, loading, updateProgram, advanceCycle, bodyweight } = useStore();

  if (loading) return <AppShell title="BØFSHOWET"><Empty>Loading…</Empty></AppShell>;

  return (
    <AppShell title="BØFSHOWET">
      <div className="flex justify-end gap-2 px-4 pt-2">
        {activeProgram && (
          <Link
            to="/program/new"
            search={{ edit: activeProgram.id }}
            className="rounded-lg border border-input bg-card px-3.5 py-1.5 text-[13px] font-medium"
          >
            Edit program
          </Link>
        )}
        <Link
          to="/program/new"
          className="rounded-lg border border-input bg-card px-3.5 py-1.5 text-[13px] font-medium"
        >
          New Program
        </Link>
      </div>

      {!activeProgram ? (
        <Card className="!mt-8 !py-8 text-center">
          <Plus className="mx-auto h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <div className="mt-3 text-[17px] font-semibold">No active program</div>
          <div className="mt-1 text-[13px] text-muted-foreground">
            Set up your training maxes and supporting lifts to get started.
          </div>
          <Link
            to="/program/new"
            className="mt-5 inline-block rounded-xl bg-primary px-5 py-2.5 text-[14px] font-semibold text-primary-foreground"
          >
            Create your first program
          </Link>
        </Card>
      ) : activeProgram.kind === "custom" ? (
        <CustomHome prog={activeProgram} logs={logs} />
      ) : (
        <ActiveHome
          prog={activeProgram}
          logs={logs}
          bw={bodyweight}
          onJumpTo={async (week, day, isFutureSkip) => {
            if (isFutureSkip) {
              await updateProgram(activeProgram.id, { week, day });
              navigate({ to: "/session" });
            } else {
              navigate({
                to: "/session",
                search: { week, day, cycle: activeProgram.cycle },
              });
            }
          }}
          onTrain={() => navigate({ to: "/session" })}
          onAdvanceCycle={async (newTms) => {
            await advanceCycle(activeProgram.id, newTms);
            toast.success(`Cycle ${activeProgram.cycle + 1} started!`);
          }}
        />
      )}
    </AppShell>
  );
}

function CustomHome({ prog, logs }: { prog: Program; logs: WorkoutLog[] }) {
  const sessions = prog.sessions ?? [];
  const totalSessionsLogged = useMemo(
    () => logs.filter((l) => l.program_id === prog.id && l.type === "custom").length,
    [logs, prog.id],
  );

  // Per-exercise PR list (best e1RM) for the program's exercises.
  const exerciseRows = useMemo(() => {
    const all: { name: string; pr: number | null; lastDate: string | null }[] = [];
    for (const s of sessions) {
      for (const ex of s.exercises) {
        const liftId = `custom-${ex.id}`;
        const matches = logs.filter((l) => l.program_id === prog.id && l.lift_id === liftId);
        const pr = matches.reduce((m, l) => (l.e1rm && Number(l.e1rm) > m ? Number(l.e1rm) : m), 0);
        const last = matches.reduce<string | null>((acc, l) => (acc && acc > l.date ? acc : l.date), null);
        all.push({ name: ex.name, pr: pr || null, lastDate: last });
      }
    }
    return all;
  }, [sessions, logs, prog.id]);

  return (
    <>
      <div className="px-4 pt-8 pb-3 text-center">
        <div className="text-[28px] font-semibold tracking-tight">{prog.name}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          Custom program · {sessions.length} session{sessions.length === 1 ? "" : "s"} · {totalSessionsLogged} logged
        </div>
      </div>

      <SessionPicker prog={prog} logs={logs} />

      <div className="px-4 pt-2">
        <Link
          to="/performance"
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-4 text-center"
        >
          <Activity className="h-5 w-5" strokeWidth={1.6} />
          <span className="text-[15px] font-semibold">Progress</span>
          <span className="text-[12px] text-muted-foreground">· Stats & 1RM trends</span>
        </Link>
      </div>


      {exerciseRows.some((r) => r.pr) && (
        <Card className="!py-3.5">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            Best estimated 1RM
          </div>
          <div className="space-y-1.5">
            {exerciseRows.filter((r) => r.pr).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-[13px]">
                <span className="truncate">{r.name}</span>
                <span className="ml-2 font-semibold">{Math.round(r.pr!)} kg</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function SessionPicker({ prog, logs }: { prog: Program; logs: WorkoutLog[] }) {
  const navigate = useNavigate();
  const sessions = prog.sessions ?? [];
  if (!sessions.length) {
    return (
      <Card>
        <div className="text-[13px] text-muted-foreground">
          This custom program has no sessions yet.
        </div>
        <Link
          to="/program/new"
          search={{ edit: prog.id }}
          className="mt-3 inline-block rounded-lg bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-foreground"
        >
          Add sessions
        </Link>
      </Card>
    );
  }

  function lastDateFor(sessionId: string): string | null {
    const exIds = new Set(
      sessions
        .find((s) => s.id === sessionId)
        ?.exercises.map((e) => `custom-${e.id}`) ?? [],
    );
    const matches = logs.filter((l) => l.program_id === prog.id && exIds.has(l.lift_id));
    if (!matches.length) return null;
    return matches.reduce((acc, l) => (l.date > acc ? l.date : acc), matches[0].date);
  }

  return (
    <div className="px-4 pt-2">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        Start a session
      </div>
      <div className="space-y-2">
        {sessions.map((s) => {
          const last = lastDateFor(s.id);
          const lastLabel = last
            ? `Last trained ${new Date(last).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
            : "Not trained yet";
          return (
            <button
              key={s.id}
              onClick={() => navigate({ to: "/custom-session/$sessionId", params: { sessionId: s.id } })}
              className="flex w-full items-center justify-between rounded-xl border border-info bg-info-bg px-4 py-3 text-left"
            >
              <div>
                <div className="text-[15px] font-semibold text-info">{s.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {s.exercises.length} exercise{s.exercises.length === 1 ? "" : "s"} · {lastLabel}
                </div>
              </div>
              <Play className="h-5 w-5 text-info" strokeWidth={1.6} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActiveHome({
  prog,
  logs,
  bw,
  onJumpTo,
  onTrain,
  onAdvanceCycle,
}: {
  prog: Program;
  logs: WorkoutLog[];
  bw: number;
  onJumpTo: (week: number, day: number, isFutureSkip: boolean) => void;
  onTrain: () => void;
  onAdvanceCycle: (newTms: number[]) => Promise<void>;
}) {
  void bw;
  const lifts = buildLift1RMData(prog, logs);
  const showRMs = lifts.some((l) => l.latest);
  const cycleDone = useMemo(() => isCycleComplete(prog, logs, prog.cycle), [prog, logs]);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  return (
    <>
      <div className="px-4 pt-8 pb-3 text-center">
        <div className="text-[28px] font-semibold tracking-tight">{prog.name}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          Cycle {prog.cycle} · {WEEK_LABELS[prog.week]} · {DAY_LABELS[prog.day]}
        </div>
      </div>

      {cycleDone && !bannerDismissed && (
        <CycleCompleteBanner
          prog={prog}
          onConfirm={onAdvanceCycle}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}

      {showRMs && (
        <Card className="!py-3.5">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            Estimated 1RM
          </div>
          <div className="flex items-center justify-around">
            {lifts.map((l, i) => (
              <div key={i} className="flex-1 text-center">
                {l.latest ? (
                  <>
                    <div className="text-[11px] text-muted-foreground">{l.name}</div>
                    <div className="text-lg font-semibold">{Math.round(Number(l.latest))} kg</div>
                    {l.trend !== 0 && (
                      <div className={`text-[11px] font-medium ${l.trend > 0 ? "text-success" : "text-destructive"}`}>
                        {l.trend > 0 ? "▲" : "▼"}
                        {Math.abs(Math.round(l.trend))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[11px] text-muted-foreground">{l.name}</div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 px-4 pt-2">
        <button
          onClick={onTrain}
          className="rounded-2xl border border-info bg-info-bg px-4 py-6 text-center"
        >
          <Play className="mx-auto h-9 w-9 text-info" strokeWidth={1.6} />
          <div className="mt-2.5 text-[15px] font-semibold text-info">Train</div>
          <div className="text-[12px] text-muted-foreground">Start next session</div>
        </button>
        <Link
          to="/performance"
          className="rounded-2xl border border-border bg-card px-4 py-6 text-center"
        >
          <Activity className="mx-auto h-9 w-9" strokeWidth={1.6} />
          <div className="mt-2.5 text-[15px] font-semibold">Progress</div>
          <div className="text-[12px] text-muted-foreground">Stats & 1RM trends</div>
        </Link>
      </div>

      <CycleGrid prog={prog} logs={logs} onJumpTo={onJumpTo} />
    </>
  );
}

function CycleCompleteBanner({
  prog,
  onConfirm,
  onDismiss,
}: {
  prog: Program;
  onConfirm: (newTms: number[]) => Promise<void>;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [bumps, setBumps] = useState<number[]>(() => prog.main_lifts.map((l) => defaultTmBump(l.name)));
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <div className="mx-4 mt-2 rounded-xl border border-success bg-success-bg px-4 py-3.5">
        <div className="text-[14px] font-semibold text-success">🎉 Cycle {prog.cycle} complete!</div>
        <div className="mt-1 text-[12px] text-muted-foreground">
          Bump training maxes and start cycle {prog.cycle + 1}.
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setOpen(true)}
            className="flex-1 rounded-lg bg-primary py-2 text-[13px] font-semibold text-primary-foreground"
          >
            Set up next cycle
          </button>
          <button
            onClick={onDismiss}
            className="rounded-lg border border-input bg-card px-3 py-2 text-[13px] text-muted-foreground"
          >
            Later
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-2 rounded-xl border border-success bg-success-bg px-4 py-3.5">
      <div className="text-[14px] font-semibold text-success">Start cycle {prog.cycle + 1}</div>
      <div className="mt-1 text-[12px] text-muted-foreground">
        Adjust the bump for each lift (defaults: +5 kg lower body, +2.5 kg upper).
      </div>
      <div className="mt-3 space-y-2">
        {prog.main_lifts.map((l, i) => (
          <div key={i} className="flex items-center gap-2 border-b border-border pb-2 last:border-0">
            <div className="flex-1 text-[13px]">
              <div className="font-medium">{l.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {l.tm} kg → <span className="font-medium text-foreground">{(l.tm + (bumps[i] ?? 0)).toFixed(1)} kg</span>
              </div>
            </div>
            <span className="text-[12px] text-muted-foreground">+</span>
            <input
              type="number"
              step={1.25}
              value={bumps[i] ?? 0}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setBumps((arr) => arr.map((x, j) => (j === i ? (isFinite(v) ? v : 0) : x)));
              }}
              className="w-16 rounded-lg border border-input bg-input-bg px-2 py-1 text-center text-[13px]"
            />
            <span className="text-[11px] text-muted-foreground">kg</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 rounded-lg border border-input bg-card py-2 text-[13px]"
        >
          Cancel
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const newTms = prog.main_lifts.map((l, i) => l.tm + (bumps[i] ?? 0));
              await onConfirm(newTms);
            } finally {
              setBusy(false);
            }
          }}
          className="flex-1 rounded-lg bg-primary py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Starting…" : `Start cycle ${prog.cycle + 1}`}
        </button>
      </div>
    </div>
  );
}

function CycleGrid({
  prog,
  logs,
  onJumpTo,
}: {
  prog: Program;
  logs: WorkoutLog[];
  onJumpTo: (week: number, day: number, isFutureSkip: boolean) => void;
}) {
  const navigate = useNavigate();
  const [viewedCycle, setViewedCycle] = useState(prog.cycle);
  const isCurrentCycleView = viewedCycle === prog.cycle;
  const isPastCycleView = viewedCycle < prog.cycle;

  return (
    <div className="px-4 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          Cycle {viewedCycle} schedule {isPastCycleView && "(past)"}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewedCycle((c) => Math.max(1, c - 1))}
            disabled={viewedCycle <= 1}
            aria-label="Previous cycle"
            className="rounded-md border border-input bg-card px-2 py-0.5 text-[13px] disabled:opacity-30"
          >
            ‹
          </button>
          <button
            onClick={() => setViewedCycle((c) => Math.min(prog.cycle, c + 1))}
            disabled={viewedCycle >= prog.cycle}
            aria-label="Next cycle"
            className="rounded-md border border-input bg-card px-2 py-0.5 text-[13px] disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-2">
        <div className="grid grid-cols-[64px_repeat(3,1fr)] gap-1.5">
          <div />
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-[11px] text-muted-foreground">{d}</div>
          ))}
          {WEEK_LABELS.map((wLabel, w) => (
            <WeekRow
              key={w}
              prog={prog}
              logs={logs}
              week={w}
              weekLabel={wLabel}
              viewedCycle={viewedCycle}
              isCurrentCycleView={isCurrentCycleView}
              onJumpTo={onJumpTo}
              onReviewCell={(cycle, week, day) =>
                navigate({ to: "/session", search: { week, day, cycle } })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekRow({
  prog,
  logs,
  week,
  weekLabel,
  viewedCycle,
  isCurrentCycleView,
  onJumpTo,
  onReviewCell,
}: {
  prog: Program;
  logs: WorkoutLog[];
  week: number;
  weekLabel: string;
  viewedCycle: number;
  isCurrentCycleView: boolean;
  onJumpTo: (week: number, day: number, isFutureSkip: boolean) => void;
  onReviewCell: (cycle: number, week: number, day: number) => void;
}) {
  return (
    <>
      <div className="flex items-center text-[12px] text-muted-foreground">{weekLabel}</div>
      {Array.from({ length: DAYS_PER_WEEK }).map((_, day) => {
        const done = isWorkoutDone(prog, logs, viewedCycle, week, day);
        const skipped = isWorkoutSkipped(prog, logs, viewedCycle, week, day);
        const isCurrent = isCurrentCycleView && prog.week === week && prog.day === day;
        const isFuture = isCurrentCycleView && (week > prog.week || (week === prog.week && day > prog.day));
        const dateStr = getLatestDateForCell(prog, logs, viewedCycle, week, day);
        const dateLabel = dateStr ? new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" }) : null;

        const cls = isCurrent
          ? "border-info bg-info-bg text-info"
          : skipped
            ? "border-dashed border-warning bg-warning-bg text-warning"
            : done
              ? "border-success bg-success-bg text-success"
              : "border-border bg-background text-muted-foreground";

        const glyph = skipped ? "—" : done ? "✓" : isCurrent ? "●" : "·";

        const handleClick = () => {
          if (!isCurrentCycleView) {
            // Past cycle browsing — review with explicit cycle.
            onReviewCell(viewedCycle, week, day);
            return;
          }
          if (isCurrent) {
            onJumpTo(week, day, false);
            return;
          }
          if (isFuture && !done && !skipped) {
            const ok = confirm(
              `Skip ahead to ${weekLabel} · ${DAY_LABELS[day]}? Workouts in between will be left unlogged.`,
            );
            if (!ok) return;
            onJumpTo(week, day, true);
            return;
          }
          onJumpTo(week, day, false);
        };

        return (
          <button
            key={day}
            onClick={handleClick}
            className={`flex flex-col items-center justify-center rounded-lg border py-1.5 text-[13px] font-medium ${cls}`}
            aria-label={`Cycle ${viewedCycle} ${weekLabel} ${DAY_LABELS[day]}${done ? " completed" : ""}${skipped ? " skipped" : ""}${isCurrent ? " current" : ""}`}
          >
            <span className="leading-tight">{glyph}</span>
            {dateLabel && <span className="mt-0.5 text-[9px] font-normal text-muted-foreground">{dateLabel}</span>}
          </button>
        );
      })}
    </>
  );
}
