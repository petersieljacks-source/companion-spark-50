import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, LiftBadge, Empty, SectionLabel } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import { WEEK_LABELS, DAY_LABELS, type WorkoutLog } from "@/lib/531";

export const Route = createFileRoute("/history")({
  component: History,
});

type RangeKey = "all" | "7d" | "30d" | "cycle";

function History() {
  const { logs, loading, activeProgram } = useStore();
  const [liftFilter, setLiftFilter] = useState<string>("all");
  const [range, setRange] = useState<RangeKey>("all");

  const liftNames = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) {
      if (l.type === "main" || l.type === "supp" || l.type === "test") {
        if (l.lift_name && l.lift_name !== "—") set.add(l.lift_name);
      }
    }
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff =
      range === "7d" ? now - 7 * 86400_000 :
      range === "30d" ? now - 30 * 86400_000 :
      null;
    return logs.filter((l) => {
      if (liftFilter !== "all" && l.type !== "restart" && l.lift_name !== liftFilter) return false;
      if (range === "cycle" && activeProgram && l.cycle !== activeProgram.cycle) return false;
      if (cutoff !== null && new Date(l.date).getTime() < cutoff) return false;
      return true;
    });
  }, [logs, liftFilter, range, activeProgram]);

  if (loading) return <AppShell title="History"><Empty>Loading…</Empty></AppShell>;
  if (!logs.length) return <AppShell title="History"><Empty>No workouts logged yet.</Empty></AppShell>;

  // Group by cycle/week/day for non-restart entries; restart markers render between groups inline.
  // Note: the same cycle/week/day can recur (e.g. across programs filtered together, or after a
  // restart marker creates a new logical group with the same coords). Suffix the React key with the
  // group index so React keys remain unique even when the logical key repeats.
  const reversed = [...filtered].reverse();
  const groups: { key: string; header: string | null; entries: WorkoutLog[] }[] = [];
  let currentLogicalKey = "";
  for (const log of reversed) {
    const logicalKey =
      log.type === "restart"
        ? `restart-${log.id}`
        : log.type === "test"
          ? `test-${log.id}`
          : `${log.program_id}-${log.cycle}-${log.week}-${log.day}`;
    if (logicalKey !== currentLogicalKey) {
      let header: string | null = null;
      if (log.type !== "restart" && log.type !== "test") {
        header = `Cycle ${log.cycle} · ${WEEK_LABELS[log.week] ?? "?"} · ${DAY_LABELS[log.day] ?? `Day ${log.day + 1}`}`;
      }
      groups.push({ key: `${groups.length}-${logicalKey}`, header, entries: [log] });
      currentLogicalKey = logicalKey;
    } else {
      groups[groups.length - 1].entries.push(log);
    }
  }

  return (
    <AppShell title="History">
      {/* Filters */}
      <div className="flex flex-col gap-2 px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">Lift</span>
          <select
            value={liftFilter}
            onChange={(e) => setLiftFilter(e.target.value)}
            className="flex-1 rounded-lg border border-input bg-input-bg px-2 py-1.5 text-[13px]"
          >
            <option value="all">All lifts</option>
            {liftNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1.5">
          {(["all", "7d", "30d", "cycle"] as RangeKey[]).map((r) => {
            const label = r === "all" ? "All time" : r === "7d" ? "7 days" : r === "30d" ? "30 days" : "Current cycle";
            const active = r === range;
            return (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] ${
                  active ? "border-foreground bg-primary text-primary-foreground" : "border-input text-muted-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty>No entries match these filters.</Empty>
      ) : (
        groups.map((g) => (
          <div key={g.key}>
            {g.header && <SectionLabel>{g.header}</SectionLabel>}
            {g.entries.map((log) => {
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
              if (log.type === "skip") {
                return (
                  <div key={log.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <div className="h-px flex-1 bg-warning/30" />
                    <span className="whitespace-nowrap text-[11px] text-warning">
                      — Day skipped · {new Date(log.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                    <div className="h-px flex-1 bg-warning/30" />
                  </div>
                );
              }
              if (log.type === "test") {
                const d = new Date(log.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                const set = (log.sets ?? [])[0];
                return (
                  <Card key={log.id}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{log.lift_name}</span>
                        <LiftBadge kind="test" />
                        <div className="mt-0.5 text-[12px] text-muted-foreground">
                          {d} · Manual 1RM test{set ? ` · ${set.weight} kg × ${set.reps}` : ""}
                        </div>
                      </div>
                      {log.e1rm ? (
                        <div className="text-right">
                          <div className="text-[11px] text-muted-foreground">1RM</div>
                          <div className="font-semibold">{log.e1rm} kg</div>
                        </div>
                      ) : null}
                    </div>
                    {log.note ? <div className="mt-2 text-[13px] text-muted-foreground">{log.note}</div> : null}
                  </Card>
                );
              }
              const isMain = log.type === "main";
              const amrap = isMain && (log.sets ?? []).find((s) => s.amrap && s.reps > 0);
              const d = new Date(log.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              return (
                <Card key={log.id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{log.lift_name}</span>
                      <LiftBadge kind={isMain ? "main" : "supp"} />
                      {log.bodyweight && <LiftBadge kind="bw" />}
                      <div className="mt-0.5 text-[12px] text-muted-foreground">{d}</div>
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
          </div>
        ))
      )}
    </AppShell>
  );
}
