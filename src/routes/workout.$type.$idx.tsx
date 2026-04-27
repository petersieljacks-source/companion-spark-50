import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card, LiftBadge, Empty } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import { WEEK_SCHEME, WEEK_LABELS, SUPP_SETS, roundTo, estimate1RM, type SetLog, type SuppLift } from "@/lib/531";

type WorkoutSearch = { week?: number; day?: number; cycle?: number };

export const Route = createFileRoute("/workout/$type/$idx")({
  validateSearch: (search: Record<string, unknown>): WorkoutSearch => {
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
  component: WorkoutPage,
});

function WorkoutPage() {
  const { type, idx: idxStr } = Route.useParams();
  const idx = parseInt(idxStr, 10);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { activeProgram: prog, logs, bodyweight, upsertLog, updateProgram } = useStore();
  const isMain = type === "main";

  // Override-aware position: when search params present, we are reviewing/editing a historical workout.
  // Otherwise use the program's current pointer.
  const effectiveWeek = search.week ?? prog?.week ?? 0;
  const effectiveDay = search.day ?? prog?.day ?? 0;
  const effectiveCycle = search.cycle ?? prog?.cycle ?? 1;
  const isReview = search.week !== undefined || search.day !== undefined || search.cycle !== undefined;

  const [currentWeek, setCurrentWeek] = useState(effectiveWeek);
  const [reps, setReps] = useState<number[]>([]);
  const [done, setDone] = useState<boolean[]>([]);
  const repInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const lift = useMemo(() => {
    if (!prog) return null;
    return isMain ? prog.main_lifts[idx] : prog.supp_lifts[idx];
  }, [prog, isMain, idx]);

  const numSets = isMain ? WEEK_SCHEME[currentWeek].length : SUPP_SETS;

  // Find existing log for this exercise in the effective cycle/week/day.
  const existingLog = useMemo(() => {
    if (!prog) return null;
    return (
      [...logs].reverse().find(
        (l) =>
          l.lift_id === `${type}-${idx}` &&
          l.program_id === prog.id &&
          l.cycle === effectiveCycle &&
          l.week === effectiveWeek &&
          l.day === effectiveDay,
      ) ?? null
    );
  }, [logs, prog, type, idx, effectiveCycle, effectiveWeek, effectiveDay]);

  const hydratedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!prog) return;
    const key = `${prog.id}-${type}-${idx}-${effectiveWeek}-${effectiveDay}-${effectiveCycle}`;
    if (hydratedKeyRef.current === key) return;
    hydratedKeyRef.current = key;
    setCurrentWeek(effectiveWeek);
    if (existingLog && Array.isArray(existingLog.sets) && existingLog.sets.length > 0) {
      const s = existingLog.sets as SetLog[];
      setReps(s.map((x) => x.reps ?? 0));
      setDone(s.map((x) => !!x.done));
    } else if (isMain) {
      const init = WEEK_SCHEME[effectiveWeek].map((s) => (typeof s.reps === "number" ? s.reps : 0));
      setReps(init);
      setDone(init.map(() => false));
    } else {
      setReps(Array(SUPP_SETS).fill(0));
      setDone(Array(SUPP_SETS).fill(false));
    }
  }, [prog, isMain, idx, type, existingLog, effectiveWeek, effectiveDay, effectiveCycle]);

  const mainLift = isMain && lift ? (lift as { name: string; bodyweight: boolean; tm: number; addedLoad?: number }) : null;
  const suppLift = !isMain && lift ? (lift as SuppLift) : null;
  const [editingTargetIdx, setEditingTargetIdx] = useState<number | null>(null);
  const [bumpPrompt, setBumpPrompt] = useState<{ from: number; to: number } | null>(null);
  const pendingNavRef = useRef<null | (() => void)>(null);

  // AMRAP PR for the same %TM (matched by lift_name across cycles).
  const amrapPr = useMemo(() => {
    if (!isMain || !prog || !lift) return null;
    const s = WEEK_SCHEME[currentWeek];
    const amrapDef = s.find((x) => typeof x.reps === "string");
    if (!amrapDef) return null;
    const liftName = lift.name.trim().toLowerCase();
    let bestReps = 0;
    let bestDate: string | null = null;
    for (const lg of logs) {
      if (lg.type !== "main") continue;
      if ((lg.lift_name ?? "").trim().toLowerCase() !== liftName) continue;
      // Don't count the row we're currently editing
      if (existingLog && lg.id === existingLog.id) continue;
      for (const set of lg.sets ?? []) {
        if (set.amrap && Math.abs((set as SetLog).target ? 0 : 0) === 0) {
          // match by percentage band — use weight/tm ratio if available; else use marked target
        }
        if (set.amrap && typeof set.target === "string") {
          // Same week scheme means same %TM. Use the week scheme by reading lg.week.
          if (lg.week === currentWeek && set.reps > bestReps) {
            bestReps = set.reps;
            bestDate = lg.date;
          }
        }
      }
    }
    return bestReps > 0 ? { reps: bestReps, date: bestDate } : null;
  }, [isMain, prog, lift, currentWeek, logs, existingLog]);

  function setRep(i: number, v: number) {
    setReps((arr) => arr.map((x, j) => j === i ? v : x));
    setDone((arr) => arr.map((x, j) => j === i ? v > 0 : x));
  }
  function toggleDone(i: number) {
    setDone((arr) => arr.map((x, j) => j === i ? !x : x));
  }

  function collectSets(): SetLog[] {
    const out: SetLog[] = [];
    for (let i = 0; i < numSets; i++) {
      const r = reps[i] ?? 0;
      if (isMain) {
        const main = lift as { tm: number; bodyweight: boolean };
        const s = WEEK_SCHEME[currentWeek][i];
        const totalKg = roundTo(main.tm * s.pct, prog!.round);
        const addedKg = main.bodyweight ? Math.max(0, totalKg - bodyweight) : totalKg;
        out.push({ weight: totalKg, addedWeight: addedKg, target: s.reps, reps: r, amrap: typeof s.reps === "string", done: !!done[i] });
      } else {
        const supp = lift as { weight: number; bodyweight: boolean };
        const addedKg = supp.weight ?? 0;
        const totalKg = supp.bodyweight ? bodyweight + addedKg : addedKg;
        out.push({ weight: totalKg, addedWeight: addedKg, reps: r, done: !!done[i] });
      }
    }
    return out;
  }

  function findNextPos() {
    const all: { type: "main" | "supp"; idx: number }[] = [];
    prog!.main_lifts.forEach((_, i) => all.push({ type: "main", idx: i }));
    prog!.supp_lifts.forEach((_, i) => all.push({ type: "supp", idx: i }));
    for (const s of all) {
      if (s.type === type && s.idx === idx) continue;
      const liftId = `${s.type}-${s.idx}`;
      const lg = logs.find((l) => l.lift_id === liftId && l.program_id === prog!.id && l.week === effectiveWeek && l.day === effectiveDay && l.cycle === effectiveCycle);
      if (!lg) return s;
    }
    return null;
  }

  // Core save — used by both autosave (silent) and explicit user actions (verbose).
  async function doSave(opts: { silent: boolean }): Promise<boolean> {
    const sets = collectSets();
    const anyEntered = sets.some((s) => s.reps > 0 || s.done);
    if (!anyEntered) {
      if (!opts.silent) toast.error("Enter reps for at least one set before saving.");
      return false;
    }
    let e1rm: number | null = null;
    let overload = false;
    if (isMain) {
      const a = sets.find((s) => s.amrap && s.reps > 0);
      if (a) e1rm = estimate1RM(a.weight, a.reps);
    } else {
      const targets = (suppLift?.rep_targets ?? [10, 10, 10]);
      overload = sets.length === SUPP_SETS && sets.every((s, i) => s.reps >= (targets[i] ?? 10));
    }
    // P0 bug 2: preserve original date when editing an existing log; only stamp now for first save.
    const saveDate = existingLog?.date ?? new Date().toISOString();
    // P0 bug 1: in review mode, never let week-tab clicks rewrite the saved week.
    const saveWeek = isReview ? effectiveWeek : currentWeek;
    try {
      await upsertLog({
        program_id: prog!.id,
        lift_id: `${type}-${idx}`,
        lift_name: lift!.name,
        type: isMain ? "main" : "supp",
        bodyweight: lift!.bodyweight,
        week: saveWeek,
        day: effectiveDay,
        cycle: effectiveCycle,
        sets,
        e1rm,
        overload_earned: overload,
        date: saveDate,
      });
    } catch (e) {
      console.error("Save failed:", e);
      if (!opts.silent) toast.error(`Save failed: ${(e as Error).message}`);
      return false;
    }
    if (!opts.silent) {
      toast.success("Workout saved");
      if (isMain && e1rm) {
        const liftName = lift!.name.trim().toLowerCase();
        const prevBest = Math.max(
          0,
          ...logs
            .filter((l) => l.type !== "skip" && (l.lift_name ?? "").trim().toLowerCase() === liftName && l.e1rm)
            .filter((l) => !existingLog || l.id !== existingLog.id)
            .map((l) => Number(l.e1rm)),
        );
        if (e1rm > prevBest) toast.success(`🎉 New estimated 1RM: ${e1rm} kg!`);
      }
      // P1 #8: AMRAP rep PR celebration (same %TM band = same week scheme).
      if (isMain) {
        const a = sets.find((s) => s.amrap && s.reps > 0);
        if (a && amrapPr && a.reps > amrapPr.reps) {
          toast.success(`🏆 New rep PR for ${WEEK_LABELS[currentWeek]}: ${a.reps} reps!`);
        }
      }
      // Supporting-lift load bump: prompt the user instead of bumping silently.
      if (!isMain && overload && !isReview && suppLift) {
        toast.success("🎯 All rep targets hit!");
        const inc = suppLift.increment ?? 2.5;
        const from = suppLift.weight ?? 0;
        const to = roundTo(from + inc, prog!.round);
        if (inc > 0 && to > from) {
          setBumpPrompt({ from, to });
        }
      }
    }
    return true;
  }

  // Auto-save: debounce changes to reps/done and save silently.
  const autosaveTimer = useRef<number | null>(null);
  const isInitialRender = useRef(true);
  useEffect(() => {
    if (!prog) return;
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      void doSave({ silent: true });
    }, 800);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reps, done, currentWeek]);

  if (!prog || !lift) {
    return <AppShell title="Exercise" hideTabBar back={() => navigate({ to: "/session" })}><Empty>No program.</Empty></AppShell>;
  }

  // Build full ordered list of exercises and find prev/next position
  function getOrdered() {
    const all: { type: "main" | "supp"; idx: number }[] = [];
    prog!.main_lifts.forEach((_, i) => all.push({ type: "main", idx: i }));
    prog!.supp_lifts.forEach((_, i) => all.push({ type: "supp", idx: i }));
    return all;
  }
  const ordered = getOrdered();
  const currentPos = ordered.findIndex((p) => p.type === type && p.idx === idx);
  const prevExercise = currentPos > 0 ? ordered[currentPos - 1] : null;
  const nextExerciseLinear = currentPos >= 0 && currentPos < ordered.length - 1 ? ordered[currentPos + 1] : null;
  const isLastExercise = currentPos === ordered.length - 1;
  const isLastSupportingExercise = !isMain && idx === prog.supp_lifts.length - 1;

  // Preserve search params (review mode) when navigating between session/workout pages.
  const navSearch = isReview ? { week: effectiveWeek, day: effectiveDay, cycle: effectiveCycle } : {};

  async function saveAndBack() {
    const ok = await doSave({ silent: false });
    if (ok) navigate({ to: "/session", search: navSearch });
  }
  async function saveAndNext() {
    const ok = await doSave({ silent: false });
    if (!ok) return;
    const next = findNextPos();
    if (!next) navigate({ to: "/session", search: navSearch });
    else navigate({ to: "/workout/$type/$idx", params: { type: next.type, idx: String(next.idx) }, search: navSearch });
  }
  async function finishProgram() {
    const ok = await doSave({ silent: false });
    if (!ok) return;
    navigate({ to: "/" });
  }
  async function gotoPrev() {
    if (!prevExercise) return;
    await doSave({ silent: true });
    navigate({ to: "/workout/$type/$idx", params: { type: prevExercise.type, idx: String(prevExercise.idx) }, search: navSearch });
  }
  async function gotoNext() {
    if (!nextExerciseLinear) return;
    await doSave({ silent: true });
    navigate({ to: "/workout/$type/$idx", params: { type: nextExerciseLinear.type, idx: String(nextExerciseLinear.idx) }, search: navSearch });
  }

  const rmEst = (() => {
    if (!isMain) return null;
    const liftName = lift.name.trim().toLowerCase();
    const log = [...logs].reverse().find((l) => (l.lift_name ?? "").trim().toLowerCase() === liftName && l.program_id === prog.id && l.e1rm);
    return log ? Number(log.e1rm) : null;
  })();

  const nextPos = findNextPos();
  const shouldShowFinish = isLastExercise || isLastSupportingExercise || !nextPos;

  return (
    <AppShell title={lift.name} hideTabBar back={() => navigate({ to: "/session", search: navSearch })}>
      {isMain && (
        <div className="flex gap-1.5 px-4 pt-3">
          {WEEK_LABELS.map((l, i) => {
            const active = i === currentWeek;
            const locked = isReview && i !== effectiveWeek;
            return (
              <button
                key={i}
                onClick={() => {
                  if (locked) {
                    toast.error("Reviewing a past workout — week is locked.");
                    return;
                  }
                  setCurrentWeek(i);
                }}
                aria-disabled={locked}
                className={`flex-1 rounded-lg border border-border px-2 py-2 text-[13px] ${
                  active
                    ? "border-foreground bg-primary font-semibold text-primary-foreground"
                    : locked
                      ? "text-muted-foreground/50"
                      : "text-muted-foreground"
                }`}
              >
                {l}
              </button>
            );
          })}
        </div>
      )}

      {isReview && (
        <div className="mx-4 mt-2 rounded-lg border border-info bg-info-bg px-3 py-1.5 text-[12px] text-info">
          Reviewing past workout · edits keep the original date.
        </div>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-medium">
            {lift.name}
            {isMain ? <LiftBadge kind="main" /> : <LiftBadge kind="supp" />}
            {lift.bodyweight && <LiftBadge kind="bw" />}
          </div>
          <div className="text-right">
            {isMain && mainLift ? (
              <>
                <div className="text-[13px] text-muted-foreground">TM: {mainLift.tm} kg</div>
                {rmEst && <div className="text-[13px] text-info">1RM: ~{rmEst} kg</div>}
              </>
            ) : suppLift ? (
              <div className="text-[15px] font-medium">
                {suppLift.bodyweight ? `+${suppLift.weight}` : suppLift.weight} kg
              </div>
            ) : null}
          </div>
        </div>
        {mainLift && mainLift.bodyweight && (
          <div className="mb-2.5 text-[12px] text-bw">
            BW {bodyweight} kg + {mainLift.addedLoad ?? 0} kg = {mainLift.tm} kg TM
          </div>
        )}

        <div className="grid grid-cols-[52px_1fr_1fr_36px] items-center gap-1.5 border-b border-border py-2 text-[12px] text-muted-foreground">
          <div>Set</div>
          <div className="text-center">Weight</div>
          <div className="text-center">Reps done</div>
          <div />
        </div>

        {Array.from({ length: numSets }).map((_, i) => {
          const s = isMain ? WEEK_SCHEME[currentWeek][i] : null;
          const totalKg = isMain && mainLift
            ? roundTo(mainLift.tm * s!.pct, prog.round)
            : (suppLift!.bodyweight ? bodyweight + suppLift!.weight : suppLift!.weight);
          const addedKg = isMain && mainLift
            ? (mainLift.bodyweight ? Math.max(0, totalKg - bodyweight) : totalKg)
            : suppLift!.weight;
          const isAmrap = isMain && typeof s!.reps === "string";
          const isCompleted = done[i];
          return (
            <div key={i} className="grid grid-cols-[52px_1fr_1fr_36px] items-center gap-1.5 border-b border-border py-2 last:border-0">
              <div>
                <div className="text-[13px] font-medium">Set {i + 1}</div>
                {isMain && <div className="text-center text-[12px] text-muted-foreground">{Math.round(s!.pct * 100)}%</div>}
              </div>
              <div className="text-center">
                <div className="text-[15px] font-medium">
                  {lift.bodyweight ? `+${addedKg.toFixed(1)}` : totalKg.toFixed(1)} kg
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {isMain
                    ? (lift.bodyweight ? `Total: ${totalKg.toFixed(1)} kg` : (isAmrap ? "AMRAP" : `${s!.reps} reps`))
                    : (lift.bodyweight ? `Total: ${totalKg} kg` : null)}
                  {!isMain && (
                    <button
                      type="button"
                      onClick={() => setEditingTargetIdx(i)}
                      className="ml-1 underline decoration-dotted underline-offset-2 hover:text-foreground"
                      aria-label={`Edit target for set ${i + 1}`}
                    >
                      Target: {(suppLift!.rep_targets ?? [10, 10, 10])[i] ?? 10} reps
                    </button>
                  )}
                </div>
                {isAmrap && <div className="text-[11px] font-semibold text-warning">go for max</div>}
                {isAmrap && amrapPr && (
                  <div className="text-[11px] text-muted-foreground">
                    Best: {amrapPr.reps} reps
                    {amrapPr.date ? ` · ${new Date(amrapPr.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                  </div>
                )}
              </div>
              <div>
                <input
                  ref={(el) => { repInputRefs.current[i] = el; }}
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint={i === numSets - 1 ? "done" : "next"}
                  min={0}
                  value={reps[i] ?? 0}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setRep(i, parseInt(e.target.value) || 0)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const next = repInputRefs.current[i + 1];
                      if (next) {
                        next.focus();
                        next.select();
                      } else {
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }
                  }}
                  className={`w-full rounded-lg border bg-input-bg px-2 py-1.5 text-center text-sm ${
                    isCompleted ? "border-success bg-success-bg" : "border-input"
                  }`}
                />
              </div>
              <button
                onClick={() => toggleDone(i)}
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-[13px] ${
                  isCompleted ? "border-success bg-success-bg text-success" : "border-input text-muted-foreground"
                }`}
              >
                ✓
              </button>
            </div>
          );
        })}
      </Card>

      <div className="flex gap-2.5 px-4 pt-2">
        <button
          onClick={gotoPrev}
          disabled={!prevExercise}
          className="flex-1 rounded-xl border border-input bg-card py-2.5 text-[14px] font-medium disabled:opacity-40"
        >
          ← Previous
        </button>
        <button
          onClick={gotoNext}
          disabled={!nextExerciseLinear}
          className="flex-1 rounded-xl border border-input bg-card py-2.5 text-[14px] font-medium disabled:opacity-40"
        >
          Next →
        </button>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-2.5 border-t border-border bg-background px-4 pb-4 pt-2.5">
        <button
          onClick={saveAndBack}
          className="flex-1 rounded-xl border border-input bg-card py-3 text-[15px] font-medium"
        >
          ↩ Save & back
        </button>
        {shouldShowFinish ? (
          <button
            onClick={finishProgram}
            className="flex-1 rounded-xl bg-success py-3 text-[15px] font-semibold text-primary-foreground"
          >
            ✓ Finish workout
          </button>
        ) : (
          <button
            onClick={saveAndNext}
            className="flex-1 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground"
          >
            Save & next →
          </button>
        )}
      </div>
      <div className="h-20 text-lg" />
    </AppShell>
  );
}
