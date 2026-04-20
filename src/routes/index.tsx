import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Play, Activity } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, Empty } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import { WEEK_LABELS, type Program } from "@/lib/531";

export const Route = createFileRoute("/")({
  component: Home,
});

function buildLift1RMData(prog: Program | null, logs: ReturnType<typeof useStore>["logs"]) {
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

function Home() {
  const navigate = useNavigate();
  const { activeProgram, logs, loading, updateProgram, bodyweight } = useStore();

  if (loading) return <AppShell title="5/3/1 Training"><Empty>Loading…</Empty></AppShell>;

  return (
    <AppShell title="5/3/1 Training">
      <div className="flex justify-end px-4 pt-2">
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
          onAdvance={async () => {
            const next = activeProgram.week + 1;
            if (next >= 4) {
              const newCycle = activeProgram.cycle + 1;
              const newMain = activeProgram.main_lifts.map((l) => {
                if (l.bodyweight) {
                  const added = (l.addedLoad ?? 0) + 2.5;
                  return { ...l, addedLoad: added, tm: bodyweight + added };
                }
                return { ...l, tm: l.tm + 2.5 };
              });
              await updateProgram(activeProgram.id, {
                week: 0,
                cycle: newCycle,
                main_lifts: newMain,
              });
            } else {
              await updateProgram(activeProgram.id, { week: next });
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
  onTrain,
}: {
  prog: Program;
  logs: ReturnType<typeof useStore>["logs"];
  bw: number;
  onAdvance: () => void;
  onTrain: () => void;
}) {
  void bw;
  const lifts = buildLift1RMData(prog, logs);
  const showRMs = lifts.some((l) => l.latest);

  return (
    <>
      <div className="px-4 pt-8 pb-3 text-center">
        <div className="text-[28px] font-semibold tracking-tight">{prog.name}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          Cycle {prog.cycle} · {WEEK_LABELS[prog.week]}
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

      <button
        onClick={onAdvance}
        className="mx-4 mt-3 block w-[calc(100%-2rem)] rounded-xl border border-input bg-card py-3 text-[15px] font-medium"
      >
        Advance to next week →
      </button>
    </>
  );
}
