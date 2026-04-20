import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, SectionLabel, Empty } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import { WEEK_LABELS } from "@/lib/531";

export const Route = createFileRoute("/performance")({
  component: Performance,
});

function Performance() {
  const { activeProgram: prog, logs, loading } = useStore();
  const [liftIdx, setLiftIdx] = useState(0);

  if (loading) return <AppShell title="Performance"><Empty>Loading…</Empty></AppShell>;
  if (!prog || !prog.main_lifts.length) {
    return <AppShell title="Performance"><Empty>No main lifts yet.</Empty></AppShell>;
  }

  const lifts = prog.main_lifts.map((l, i) => {
    const liftLogs = logs
      .filter((lg) => lg.lift_id === `main-${i}` && lg.program_id === prog.id && lg.e1rm)
      .sort((a, b) => a.date.localeCompare(b.date));
    const amrapLogs = logs
      .filter((lg) => lg.lift_id === `main-${i}` && lg.program_id === prog.id && (lg.sets ?? []).some((s) => s.amrap && s.reps > 0))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { name: l.name, logs: liftLogs, amrapLogs };
  });

  if (lifts.every((l) => l.logs.length === 0)) {
    return <AppShell title="Performance"><Empty>No AMRAP data yet.<br />Complete a workout and log your AMRAP reps.</Empty></AppShell>;
  }

  const safeIdx = liftIdx >= lifts.length ? 0 : liftIdx;
  const lift = lifts[safeIdx];
  const vals = lift.logs.map((l) => Number(l.e1rm));
  const latest = vals.length ? vals[vals.length - 1] : null;
  const best = vals.length ? Math.max(...vals) : null;

  return (
    <AppShell title="Performance">
      <div className="flex gap-1.5 overflow-x-auto px-4 pt-3">
        {lifts.map((l, i) => (
          <button
            key={i}
            onClick={() => setLiftIdx(i)}
            className={`whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium ${
              i === safeIdx ? "border-foreground bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {l.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-4 pt-3">
        <div className="rounded-xl border border-border bg-card px-3.5 py-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Latest 1RM</div>
          <div className="text-[22px] font-semibold tracking-tight">{latest ?? "—"}{latest ? " kg" : ""}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3.5 py-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Best 1RM</div>
          <div className="text-[22px] font-semibold tracking-tight">{best ?? "—"}{best ? " kg" : ""}</div>
        </div>
      </div>

      <SectionLabel>Estimated 1RM over time</SectionLabel>
      <Card>
        {lift.logs.length < 2 ? (
          <div className="py-5 text-center text-[13px] text-muted-foreground">
            Log at least 2 AMRAP sessions to see the trend.
          </div>
        ) : (
          <Chart entries={lift.logs.map((l) => ({ date: l.date, e1rm: Number(l.e1rm) }))} />
        )}
      </Card>

      <SectionLabel>AMRAP log</SectionLabel>
      <Card className="!p-0">
        {!lift.amrapLogs.length ? (
          <div className="p-4 text-[13px] text-muted-foreground">No AMRAP sets logged yet.</div>
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_44px_70px_50px_70px] border-b border-border text-[11px] text-muted-foreground">
              <div className="px-3.5 py-2.5">Date</div>
              <div className="px-1 py-2.5 text-center">Wk</div>
              <div className="px-2 py-2.5 text-center">Weight</div>
              <div className="px-1 py-2.5 text-center">Reps</div>
              <div className="px-2.5 py-2.5 text-right">Est 1RM</div>
            </div>
            {[...lift.amrapLogs].reverse().map((lg) => {
              const a = (lg.sets ?? []).find((s) => s.amrap && s.reps > 0);
              const d = new Date(lg.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              const weightLabel = a
                ? (lg.bodyweight
                    ? `+${(a.addedWeight ?? 0)}`
                    : `${a.weight}`)
                : "—";
              return (
                <div key={lg.id} className="grid grid-cols-[1fr_44px_70px_50px_70px] border-b border-border last:border-0">
                  <div className="px-3.5 py-2.5 text-[13px]">{d}</div>
                  <div className="px-1 py-2.5 text-center text-[13px] text-muted-foreground">
                    {(WEEK_LABELS[lg.week] || "—").replace("Week ", "W")}
                  </div>
                  <div className="px-2 py-2.5 text-center text-[13px] font-medium">
                    {weightLabel}{a ? " kg" : ""}
                  </div>
                  <div className="px-1 py-2.5 text-center text-[13px] font-medium text-warning">{a ? a.reps : "—"}</div>
                  <div className="px-2.5 py-2.5 text-right text-[13px] font-semibold">{lg.e1rm ? `${lg.e1rm} kg` : "—"}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </AppShell>
  );
}

function Chart({ entries }: { entries: { date: string; e1rm: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const W = canvas.offsetWidth || 320;
    canvas.width = W * 2; canvas.height = 320;
    canvas.style.width = W + "px"; canvas.style.height = "160px";
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    const w = W, h = 160, pad = { t: 16, r: 16, b: 32, l: 44 };
    const vals = entries.map((e) => e.e1rm);
    const minV = Math.min(...vals) - 10, maxV = Math.max(...vals) + 10;
    const xOf = (i: number) => pad.l + (i / Math.max(1, entries.length - 1)) * (w - pad.l - pad.r);
    const yOf = (v: number) => pad.t + (1 - (v - minV) / (maxV - minV)) * (h - pad.t - pad.b);

    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + i * (h - pad.t - pad.b) / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = "#8a8880"; ctx.font = "500 10px DM Sans, sans-serif"; ctx.textAlign = "right";
      ctx.fillText(String(Math.round(maxV - i * (maxV - minV) / 4)), pad.l - 6, y + 4);
    }
    ctx.fillStyle = "#8a8880"; ctx.font = "500 10px DM Sans, sans-serif"; ctx.textAlign = "center";
    entries.forEach((e, i) => {
      if (entries.length <= 6 || i === 0 || i === entries.length - 1 || i % Math.ceil(entries.length / 4) === 0) {
        ctx.fillText(new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), xOf(i), h - 6);
      }
    });

    // area
    ctx.beginPath(); ctx.moveTo(xOf(0), yOf(vals[0]));
    vals.forEach((v, i) => { if (i > 0) ctx.lineTo(xOf(i), yOf(v)); });
    ctx.lineTo(xOf(vals.length - 1), h - pad.b);
    ctx.lineTo(xOf(0), h - pad.b);
    ctx.closePath();
    ctx.fillStyle = "rgba(126,184,247,0.08)"; ctx.fill();

    // line
    ctx.beginPath(); ctx.strokeStyle = "#7eb8f7"; ctx.lineWidth = 2; ctx.lineJoin = "round";
    vals.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)));
    ctx.stroke();

    // dots
    vals.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(xOf(i), yOf(v), 4, 0, Math.PI * 2);
      ctx.fillStyle = "#211f1d"; ctx.fill();
      ctx.strokeStyle = "#7eb8f7"; ctx.lineWidth = 2; ctx.stroke();
    });

    // last value
    ctx.fillStyle = "#7eb8f7"; ctx.font = "600 11px DM Sans, sans-serif"; ctx.textAlign = "right";
    ctx.fillText(`${vals[vals.length - 1]} kg`, xOf(vals.length - 1) - 8, yOf(vals[vals.length - 1]) - 6);
  }, [entries]);

  return <canvas ref={ref} className="h-40 w-full" />;
}
