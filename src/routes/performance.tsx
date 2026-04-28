import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useMemo } from "react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { Card, SectionLabel, Empty } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import { WEEK_LABELS, DAY_LABELS, estimate1RM } from "@/lib/531";

export const Route = createFileRoute("/performance")({
  component: Performance,
});

function Performance() {
  const { activeProgram: prog, logs, loading, addManualTest, deleteLog } = useStore();
  const [liftIdx, setLiftIdx] = useState(0);

  // Build "lifts" tab list. For 5/3/1 use prog.main_lifts (preserves order).
  // For custom programs use the active program's exercises across sessions.
  // For nothing-active fall back to the union of all lift names ever logged.
  type LiftEntry = {
    name: string;
    idx: number;
    logs: typeof logs;
    amrapLogs: typeof logs;
    testLogs: typeof logs;
  };

  const allLogsByLiftName = useMemo(() => {
    const m = new Map<string, typeof logs>();
    for (const l of logs) {
      if (!l.lift_name || l.lift_name === "—") continue;
      if (l.type === "restart" || l.type === "skip") continue;
      const key = l.lift_name.trim();
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(l);
    }
    return m;
  }, [logs]);

  // All-time PR rows: every lift name that ever produced an e1RM.
  const allTimePRs = useMemo(() => {
    const rows: { name: string; pr: number; date: string }[] = [];
    for (const [name, ls] of allLogsByLiftName) {
      let best = 0;
      let bestDate = "";
      for (const l of ls) {
        if (l.e1rm && Number(l.e1rm) > best) {
          best = Number(l.e1rm);
          bestDate = l.date;
        }
      }
      if (best > 0) rows.push({ name, pr: best, date: bestDate });
    }
    rows.sort((a, b) => b.pr - a.pr);
    return rows;
  }, [allLogsByLiftName]);

  // Build the focus tab list.
  let liftSources: { name: string; idx: number }[] = [];
  if (prog && prog.kind === "custom") {
    const seen = new Set<string>();
    (prog.sessions ?? []).forEach((s) => {
      s.exercises.forEach((ex) => {
        const key = ex.name.trim();
        if (!seen.has(key)) {
          seen.add(key);
          liftSources.push({ name: ex.name, idx: liftSources.length });
        }
      });
    });
  } else if (prog && prog.main_lifts.length) {
    liftSources = prog.main_lifts.map((l, i) => ({ name: l.name, idx: i }));
  } else {
    // Fallback: every lift ever logged.
    liftSources = Array.from(allLogsByLiftName.keys()).map((name, i) => ({ name, idx: i }));
  }

  if (!liftSources.length) {
    return (
      <AppShell title="Performance">
        <Empty>No lifts logged yet.</Empty>
      </AppShell>
    );
  }

  const lifts: LiftEntry[] = liftSources.map((src) => {
    const target = src.name.trim().toLowerCase();
    const matches = (lg: typeof logs[number]) => (lg.lift_name ?? "").trim().toLowerCase() === target;
    const liftLogs = logs
      .filter((lg) => matches(lg) && lg.e1rm)
      .sort((a, b) => a.date.localeCompare(b.date));
    const amrapLogs = logs
      .filter((lg) => matches(lg) && lg.type !== "test" && (lg.sets ?? []).some((s) => s.amrap && s.reps > 0))
      .sort((a, b) => a.date.localeCompare(b.date));
    const testLogs = logs
      .filter((lg) => matches(lg) && lg.type === "test")
      .sort((a, b) => a.date.localeCompare(b.date));
    return { name: src.name, idx: src.idx, logs: liftLogs, amrapLogs, testLogs };
  });

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
            Log at least 2 AMRAP sessions or add manual 1RM tests to see the trend.
          </div>
        ) : (
          <Chart entries={lift.logs.map((l) => ({ date: l.date, e1rm: Number(l.e1rm), kind: l.type === "test" ? "test" : "amrap" }))} />
        )}
      </Card>

      {prog && (
        <>
          <SectionLabel>Manual 1RM tests</SectionLabel>
          <Card>
            <ManualTestForm
              liftName={lift.name}
              onSubmit={async ({ date, weight, reps, e1rm, note }) => {
                await addManualTest({
                  program_id: prog.id,
                  lift_idx: typeof lift.idx === "number" ? lift.idx : 0,
                  lift_name: lift.name,
                  date,
                  weight,
                  reps,
                  e1rm,
                  note,
                });
              }}
            />
          </Card>
        </>
      )}
      {lift.testLogs.length > 0 && (
        <Card className="!p-0 mt-2">
          <div className="grid grid-cols-[1fr_72px_44px_72px_32px] border-b border-border text-[11px] text-muted-foreground">
            <div className="px-3 py-2.5">Date</div>
            <div className="px-1 py-2.5 text-center">Weight</div>
            <div className="px-1 py-2.5 text-center">Reps</div>
            <div className="px-2 py-2.5 text-right">1RM</div>
            <div />
          </div>
          {[...lift.testLogs].reverse().map((lg) => {
            const set = (lg.sets ?? [])[0];
            const d = new Date(lg.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
            return (
              <div key={lg.id} className="grid grid-cols-[1fr_72px_44px_72px_32px] border-b border-border last:border-0">
                <div className="px-3 py-2.5 text-[13px]">{d}</div>
                <div className="px-1 py-2.5 text-center text-[13px] font-medium">{set ? `${set.weight} kg` : "—"}</div>
                <div className="px-1 py-2.5 text-center text-[13px] font-medium">{set ? set.reps : "—"}</div>
                <div className="px-2 py-2.5 text-right text-[13px] font-semibold text-warning">{lg.e1rm} kg</div>
                <button
                  onClick={() => {
                    if (confirm("Delete this 1RM test entry?")) deleteLog(lg.id);
                  }}
                  className="px-2 py-2.5 text-right text-[13px] text-muted-foreground hover:text-destructive"
                  aria-label="Delete entry"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </Card>
      )}

      <SectionLabel>AMRAP log</SectionLabel>
      <Card className="!p-0">
        {!lift.amrapLogs.length ? (
          <div className="p-4 text-[13px] text-muted-foreground">No AMRAP sets logged yet.</div>
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_38px_38px_64px_44px_64px] border-b border-border text-[11px] text-muted-foreground">
              <div className="px-3 py-2.5">Date</div>
              <div className="px-1 py-2.5 text-center">Wk</div>
              <div className="px-1 py-2.5 text-center">Day</div>
              <div className="px-1 py-2.5 text-center">Weight</div>
              <div className="px-1 py-2.5 text-center">Reps</div>
              <div className="px-2 py-2.5 text-right">Est 1RM</div>
            </div>
            {[...lift.amrapLogs].reverse().map((lg) => {
              const a = (lg.sets ?? []).find((s) => s.amrap && s.reps > 0);
              const d = new Date(lg.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              const weightLabel = a
                ? (lg.bodyweight
                    ? `+${(a.addedWeight ?? 0)}`
                    : `${a.weight}`)
                : "—";
              const dayShort = (DAY_LABELS[lg.day] ?? `Day ${(lg.day ?? 0) + 1}`).replace("Day ", "D");
              return (
                <div key={lg.id} className="grid grid-cols-[1fr_38px_38px_64px_44px_64px] border-b border-border last:border-0">
                  <div className="px-3 py-2.5 text-[13px]">{d}</div>
                  <div className="px-1 py-2.5 text-center text-[13px] text-muted-foreground">
                    {(WEEK_LABELS[lg.week] || "—").replace("Week ", "W")}
                  </div>
                  <div className="px-1 py-2.5 text-center text-[13px] text-muted-foreground">{dayShort}</div>
                  <div className="px-1 py-2.5 text-center text-[13px] font-medium">
                    {weightLabel}{a ? " kg" : ""}
                  </div>
                  <div className="px-1 py-2.5 text-center text-[13px] font-medium text-warning">{a ? a.reps : "—"}</div>
                  <div className="px-2 py-2.5 text-right text-[13px] font-semibold">{lg.e1rm ? `${lg.e1rm} kg` : "—"}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {allTimePRs.length > 0 && (
        <>
          <SectionLabel>All-time PRs</SectionLabel>
          <Card className="!p-0">
            <div className="grid grid-cols-[1fr_72px_72px] border-b border-border text-[11px] text-muted-foreground">
              <div className="px-3 py-2.5">Lift</div>
              <div className="px-1 py-2.5 text-center">Best e1RM</div>
              <div className="px-2 py-2.5 text-right">Date</div>
            </div>
            {allTimePRs.map((r) => (
              <div key={r.name} className="grid grid-cols-[1fr_72px_72px] border-b border-border last:border-0">
                <div className="px-3 py-2.5 text-[13px]">{r.name}</div>
                <div className="px-1 py-2.5 text-center text-[13px] font-semibold">{Math.round(r.pr)} kg</div>
                <div className="px-2 py-2.5 text-right text-[12px] text-muted-foreground">
                  {r.date ? new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : ""}
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </AppShell>
  );
}

const testFormSchema = z.object({
  date: z.string().nonempty("Date is required"),
  weight: z.number({ invalid_type_error: "Weight is required" }).positive("Weight must be > 0").max(2000),
  reps: z.number({ invalid_type_error: "Reps required" }).int().min(1, "Reps ≥ 1").max(20),
  e1rm: z.number({ invalid_type_error: "1RM is required" }).positive("1RM must be > 0").max(2000),
  note: z.string().max(200).optional(),
});

function ManualTestForm({
  liftName,
  onSubmit,
}: {
  liftName: string;
  onSubmit: (input: { date: string; weight: number; reps: number; e1rm: number; note?: string }) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("1");
  const [e1rm, setE1rm] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoFilled, setAutoFilled] = useState(true);

  // Auto-suggest 1RM from weight × reps using Epley until the user edits it manually
  useEffect(() => {
    if (!autoFilled) return;
    const w = Number(weight);
    const r = Number(reps);
    if (w > 0 && r > 0) {
      setE1rm(String(Math.round(estimate1RM(w, r))));
    } else {
      setE1rm("");
    }
  }, [weight, reps, autoFilled]);

  async function handleSubmit() {
    setError(null);
    const parsed = testFormSchema.safeParse({
      date,
      weight: weight === "" ? NaN : Number(weight),
      reps: reps === "" ? NaN : Number(reps),
      e1rm: e1rm === "" ? NaN : Number(e1rm),
      note: note.trim() || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        date: new Date(parsed.data.date).toISOString(),
        weight: parsed.data.weight,
        reps: parsed.data.reps,
        e1rm: parsed.data.e1rm,
        note: parsed.data.note,
      });
      // Reset weight/reps/note but keep date for batch entry
      setWeight("");
      setReps("1");
      setE1rm("");
      setNote("");
      setAutoFilled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-2 text-[12px] text-muted-foreground">
        Add a tested 1RM for <span className="font-medium text-foreground">{liftName}</span>.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 text-[11px] text-muted-foreground">
          Date *
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-input-bg px-3 py-2 text-[14px]"
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Weight (kg) *
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="e.g. 140"
            className="mt-1 w-full rounded-lg border border-input bg-input-bg px-3 py-2 text-[14px]"
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Reps *
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="1"
            className="mt-1 w-full rounded-lg border border-input bg-input-bg px-3 py-2 text-[14px]"
          />
        </label>
        <label className="col-span-2 text-[11px] text-muted-foreground">
          Result — 1RM (kg) *
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            value={e1rm}
            onChange={(e) => {
              setAutoFilled(false);
              setE1rm(e.target.value);
            }}
            placeholder="Estimated from weight × reps"
            className="mt-1 w-full rounded-lg border border-input bg-input-bg px-3 py-2 text-[14px]"
          />
          {autoFilled && Number(weight) > 0 && Number(reps) > 0 && (
            <span className="mt-1 block text-[10px] text-muted-foreground">Auto-estimated · edit to override</span>
          )}
        </label>
        <label className="col-span-2 text-[11px] text-muted-foreground">
          Note (optional)
          <input
            type="text"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. PR attempt, gym, belt only…"
            className="mt-1 w-full rounded-lg border border-input bg-input-bg px-3 py-2 text-[14px]"
          />
        </label>
      </div>
      {error && (
        <div className="mt-2 text-[12px] text-destructive">{error}</div>
      )}
      <button
        onClick={handleSubmit}
        disabled={busy}
        className="mt-3 w-full rounded-lg bg-primary px-3 py-2.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Saving…" : "Add 1RM test"}
      </button>
    </div>
  );
}

function Chart({ entries }: { entries: { date: string; e1rm: number; kind?: "amrap" | "test" }[] }) {
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

    // dots — yellow ring for manual tests, blue for AMRAPs
    vals.forEach((v, i) => {
      const isTest = entries[i]?.kind === "test";
      ctx.beginPath(); ctx.arc(xOf(i), yOf(v), 4, 0, Math.PI * 2);
      ctx.fillStyle = "#211f1d"; ctx.fill();
      ctx.strokeStyle = isTest ? "#e8b84b" : "#7eb8f7"; ctx.lineWidth = 2; ctx.stroke();
    });

    // last value
    ctx.fillStyle = "#7eb8f7"; ctx.font = "600 11px DM Sans, sans-serif"; ctx.textAlign = "right";
    ctx.fillText(`${vals[vals.length - 1]} kg`, xOf(vals.length - 1) - 8, yOf(vals[vals.length - 1]) - 6);
  }, [entries]);

  return <canvas ref={ref} className="h-40 w-full" />;
}
