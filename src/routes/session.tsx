import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card, SectionLabel, LiftBadge, Empty } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import { WEEK_LABELS, DAY_LABELS, SUPP_SETS } from "@/lib/531";

type SessionSearch = {
  week?: number;
  day?: number;
  cycle?: number;
};

export const Route = createFileRoute("/session")({
  validateSearch: (search: Record<string, unknown>): SessionSearch => {
    const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : undefined);
    const w = num(search.week);
    const d = num(search.day);
    const c = num(search.cycle);
    return {
      week: Number.isFinite(w) ? w : undefined,
      day: Number.isFinite(d) ? d : undefined,
      cycle: Number.isFinite(c) ? c : undefined,
    };
  },
  component: SessionPage,
});

function SessionPage() {
  const navigate = useNavigate();
  const { activeProgram: prog, logs, bodyweight, loading } = useStore();
  const search = Route.useSearch();

  if (loading) return <AppShell title="Session"><Empty>Loading…</Empty></AppShell>;
  if (!prog) {
    return (
      <AppShell title="Session" back={() => navigate({ to: "/" })}>
        <Empty>Create a program first.</Empty>
      </AppShell>
    );
  }

  // Override-aware values: review historical workouts via search params, otherwise use program pointer.
  const week = search.week ?? prog.week;
  const day = search.day ?? prog.day;
  const cycle = search.cycle ?? prog.cycle;
  const isReview = search.week !== undefined || search.day !== undefined || search.cycle !== undefined;

  const title = `${WEEK_LABELS[week]} · ${DAY_LABELS[day]} · Cycle ${cycle}`;

  function getLatest1RM(idx: number): number | null {
    const log = [...logs].reverse().find((l) => l.lift_id === `main-${idx}` && l.program_id === prog!.id && l.e1rm);
    return log ? Number(log.e1rm) : null;
  }

  // Build the search params to forward to the workout page when in review mode.
  const forwardSearch = isReview ? { week, day, cycle } : {};

  return (
    <AppShell title={title} back={() => navigate({ to: "/" })}>
      {prog.main_lifts.length > 0 && <SectionLabel>Main lifts — 5/3/1</SectionLabel>}
      {prog.main_lifts.map((l, i) => {
        const done = !!logs.find((lg) => lg.lift_id === `main-${i}` && lg.program_id === prog.id && lg.week === week && lg.day === day && lg.cycle === cycle);
        const note = l.bodyweight ? `BW ${bodyweight} kg + ${l.addedLoad ?? 0} kg` : `TM: ${l.tm} kg`;
        const rm = getLatest1RM(i);
        const inner = (
          <Card className={done ? "opacity-50" : ""}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{l.name}</span>
                <LiftBadge kind="main" />
                {l.bodyweight && <LiftBadge kind="bw" />}
                <div className="mt-0.5 text-[13px] text-muted-foreground">{note}</div>
                {rm && <div className="mt-0.5 text-[12px] text-info">Est. 1RM: {rm} kg</div>}
              </div>
              <span className="text-lg">{done ? "✓" : "→"}</span>
            </div>
          </Card>
        );
        return done ? (
          <Link key={i} to="/workout/$type/$idx" params={{ type: "main", idx: String(i) }} search={forwardSearch} className="block">
            {inner}
          </Link>
        ) : (
          <Link key={i} to="/workout/$type/$idx" params={{ type: "main", idx: String(i) }} search={forwardSearch} className="block">
            {inner}
          </Link>
        );
      })}

      {prog.supp_lifts.length > 0 && <SectionLabel>Supporting lifts</SectionLabel>}
      {prog.supp_lifts.map((l, i) => {
        const lastLog = [...logs].reverse().find((lg) => lg.lift_id === `supp-${i}` && lg.program_id === prog.id && lg.week === week && lg.day === day && lg.cycle === cycle);
        const done = !!lastLog;
        const note = l.bodyweight ? `BW ${bodyweight} kg + ${l.weight} kg` : `${l.weight} kg`;
        const inner = (
          <Card className={done ? "opacity-50" : ""}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{l.name}</span>
                <LiftBadge kind="supp" />
                {l.bodyweight && <LiftBadge kind="bw" />}
                <div className="mt-0.5 text-[13px] text-muted-foreground">{note} × {SUPP_SETS} sets</div>
                {lastLog?.overload_earned && <div className="text-[11px] font-semibold text-info">↑ Increase load</div>}
              </div>
              <span className="text-lg">{done ? "✓" : "→"}</span>
            </div>
          </Card>
        );
        return done ? (
          <Link key={i} to="/workout/$type/$idx" params={{ type: "supp", idx: String(i) }} search={forwardSearch} className="block">
            {inner}
          </Link>
        ) : (
          <Link key={i} to="/workout/$type/$idx" params={{ type: "supp", idx: String(i) }} search={forwardSearch} className="block">
            {inner}
          </Link>
        );
      })}
    </AppShell>
  );
}
