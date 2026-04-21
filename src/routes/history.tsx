import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card, LiftBadge, Empty } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import { WEEK_LABELS, DAY_LABELS } from "@/lib/531";

export const Route = createFileRoute("/history")({
  component: History,
});

function History() {
  const { logs, loading } = useStore();
  if (loading) return <AppShell title="History"><Empty>Loading…</Empty></AppShell>;
  if (!logs.length) return <AppShell title="History"><Empty>No workouts logged yet.</Empty></AppShell>;

  return (
    <AppShell title="History">
      {[...logs].reverse().map((log) => {
        if (log.type === "restart") {
          return (
            <div key={log.id} className="flex items-center gap-2.5 px-4 py-2.5">
              <div className="h-px flex-1 bg-border" />
              <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                ↺ {log.note ?? "Cycle restarted"} · {new Date(log.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          );
        }
        const isMain = log.type === "main";
        const amrap = isMain && (log.sets ?? []).find((s) => s.amrap && s.reps > 0);
        const d = new Date(log.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        const dayLabel = DAY_LABELS[log.day] ?? `Day ${(log.day ?? 0) + 1}`;
        return (
          <Card key={log.id}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{log.lift_name}</span>
                <LiftBadge kind={isMain ? "main" : "supp"} />
                {log.bodyweight && <LiftBadge kind="bw" />}
                <div className="mt-0.5 text-[12px] text-muted-foreground">
                  {d} · Cycle {log.cycle} · {WEEK_LABELS[log.week] ?? ""} · {dayLabel}
                </div>
              </div>
              {log.e1rm ? (
                <div className="text-right">
                  <div className="text-[11px] text-muted-foreground">Est. 1RM</div>
                  <div className="font-semibold">{log.e1rm} kg</div>
                </div>
              ) : null}
              {log.overload_earned && <div className="text-[11px] font-semibold text-success">↑ Load increased</div>}
            </div>
            <div className="mt-2 text-[13px] text-muted-foreground">
              {isMain && amrap
                ? `AMRAP: ${amrap.reps} reps @ ${amrap.weight} kg`
                : (log.sets ?? []).map((s) => s.reps).join(" / ") + " reps"}
            </div>
          </Card>
        );
      })}
    </AppShell>
  );
}
