import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Play, Activity } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, Empty } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import { WEEK_LABELS, DAY_LABELS, DAYS_PER_WEEK, type Program, type WorkoutLog } from "@/lib/531";

export const Route = createFileRoute("/")({
  component: Home,
});

function buildLift1RMData(prog: Program | null, logs: WorkoutLog[]) {
  if (!prog) return [];
  return prog.main_lifts.map((l, i) => {
    const liftLogs = logs
      .filter((lg) => lg.lift_id === `main-${i}` && lg.program_id === prog.id && lg.e1rm)
      .sort((a, b) => a.date.localeCompare(b.date));
    const latest = liftLogs.length ? liftLogs[liftLogs.length - 1].e1rm : null;
    const prev = liftLogs.length > 1 ? liftLogs[liftLogs.length - 2].e1rm : null;
    const trend = latest && prev ? Number(latest) - Number(prev) : 0;
    return { name: l.name, latest, trend };
  });
}

// Workout = 1 cell of (week, day). It's "done" if at least one main or supp log exists for that cell.
function isWorkoutDone(prog: Program, logs: WorkoutLog[], cycle: number, week: number, day: number) {
  return logs.some(
    (l) =>
      l.program_id === prog.id &&
      l.cycle === cycle &&
      l.week === week &&
      l.day === day &&
      l.type !== "restart",
  );
}

function Home() {
  const navigate = useNavigate();
  const { activeProgram, logs, loading, updateProgram, bodyweight } = useStore();

  if (loading) return <AppShell title="5/3/1 Training"><Empty>Loading…</Empty></AppShell>;

  return (
    <AppShell title="5/3/1 Training">
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
          + Program
        </Link>
      </div>

      {!activeProgram ? (
        <Empty>No active program.<br />Tap + Program to get started.</Empty>
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
        />
      )}
    </AppShell>
  );
}

function ActiveHome({
  prog,
  logs,
  bw,
  onAdvance,
  onPrev,
  onJumpTo,
  onTrain,
}: {
  prog: Program;
  logs: WorkoutLog[];
  bw: number;
  onAdvance: () => void;
  onPrev: () => void;
  onJumpTo: (week: number, day: number, isFutureSkip: boolean) => void;
  onTrain: () => void;
}) {
  void bw;
  const lifts = buildLift1RMData(prog, logs);
  const showRMs = lifts.some((l) => l.latest);

  const isFirst = prog.cycle === 1 && prog.week === 0 && prog.day === 0;

  return (
    <>
      <div className="px-4 pt-8 pb-3 text-center">
        <div className="text-[28px] font-semibold tracking-tight">{prog.name}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          Cycle {prog.cycle} · {WEEK_LABELS[prog.week]} · {DAY_LABELS[prog.day]}
        </div>
      </div>

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

function CycleGrid({
  prog,
  logs,
  onJumpTo,
}: {
  prog: Program;
  logs: WorkoutLog[];
  onJumpTo: (week: number, day: number, isFutureSkip: boolean) => void;
}) {
  return (
    <div className="px-4 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          Cycle {prog.cycle} schedule
        </div>
        <div className="text-[11px] text-muted-foreground">3 workouts / week</div>
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
              onJumpTo={onJumpTo}
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
  onJumpTo,
}: {
  prog: Program;
  logs: WorkoutLog[];
  week: number;
  weekLabel: string;
  onJumpTo: (week: number, day: number, isFutureSkip: boolean) => void;
}) {
  return (
    <>
      <div className="flex items-center text-[12px] text-muted-foreground">{weekLabel}</div>
      {Array.from({ length: DAYS_PER_WEEK }).map((_, day) => {
        const done = isWorkoutDone(prog, logs, prog.cycle, week, day);
        const isCurrent = prog.week === week && prog.day === day;
        // A cell is "future" relative to current position when it lies later in the cycle.
        const isFuture = week > prog.week || (week === prog.week && day > prog.day);
        const cls = isCurrent
          ? "border-info bg-info-bg text-info"
          : done
            ? "border-success bg-success-bg text-success"
            : "border-border bg-background text-muted-foreground";
        return (
          <button
            key={day}
            onClick={() => {
              if (isCurrent) {
                onJumpTo(week, day, false);
                return;
              }
              if (isFuture && !done) {
                const ok = confirm(
                  `Skip ahead to ${weekLabel} · ${DAY_LABELS[day]}? Workouts in between will be left unlogged.`,
                );
                if (!ok) return;
                onJumpTo(week, day, true);
                return;
              }
              onJumpTo(week, day, false);
            }}
            className={`flex h-11 items-center justify-center rounded-lg border text-[13px] font-medium ${cls}`}
            aria-label={`${weekLabel} ${DAY_LABELS[day]}${done ? " completed" : ""}${isCurrent ? " current" : ""}`}
          >
            {done ? "✓" : isCurrent ? "●" : "·"}
          </button>
        );
      })}
    </>
  );
}
