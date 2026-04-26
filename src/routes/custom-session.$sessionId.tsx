import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card, LiftBadge, Empty } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import { estimate1RM, type SetLog, type CustomExercise, type CustomSession } from "@/lib/531";
import { applyProgression, prescribedWeight } from "@/lib/custom";

export const Route = createFileRoute("/custom-session/$sessionId")({
  component: CustomSessionPage,
});

type SetState = {
  exerciseId: string;
  reps: number[];
  done: boolean[];
  note: string;
};

function CustomSessionPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const {
    activeProgram: prog,
    logs,
    bodyweight,
    upsertLog,
    updateCustomExercise,
    bumpCustomSessionRuns,
  } = useStore();

  const session = useMemo<CustomSession | null>(() => {
    if (!prog || prog.kind !== "custom") return null;
    return (prog.sessions ?? []).find((s) => s.id === sessionId) ?? null;
  }, [prog, sessionId]);

  // Per-exercise input state
  const [byEx, setByEx] = useState<Record<string, SetState>>({});
  const [busy, setBusy] = useState(false);
  const initRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const key = `${prog?.id}-${session.id}-${session.runs ?? 0}`;
    if (initRef.current === key) return;
    initRef.current = key;
    const init: Record<string, SetState> = {};
    for (const ex of session.exercises) {
      init[ex.id] = {
        exerciseId: ex.id,
        reps: Array(ex.sets).fill(ex.reps_low),
        done: Array(ex.sets).fill(false),
        note: "",
      };
    }
    setByEx(init);
  }, [session, prog?.id]);

  if (!prog || prog.kind !== "custom" || !session) {
    return (
      <AppShell title="Session" hideTabBar back={() => navigate({ to: "/" })}>
        <Empty>Session not found.</Empty>
      </AppShell>
    );
  }

  function setRep(exId: string, i: number, v: number) {
    setByEx((m) => ({
      ...m,
      [exId]: {
        ...m[exId],
        reps: m[exId].reps.map((x, j) => (j === i ? v : x)),
        done: m[exId].done.map((x, j) => (j === i ? v > 0 : x)),
      },
    }));
  }
  function toggleDone(exId: string, i: number) {
    setByEx((m) => ({
      ...m,
      [exId]: {
        ...m[exId],
        done: m[exId].done.map((x, j) => (j === i ? !x : x)),
      },
    }));
  }
  function setNote(exId: string, note: string) {
    setByEx((m) => ({ ...m, [exId]: { ...m[exId], note } }));
  }

  // Find best prior log for one exercise (by lift_id) — used to show "Last time".
  function lastLogFor(ex: CustomExercise) {
    const liftId = `custom-${ex.id}`;
    const matches = logs
      .filter((l) => l.lift_id === liftId && l.program_id === prog!.id)
      .sort((a, b) => a.date.localeCompare(b.date));
    return matches.length ? matches[matches.length - 1] : null;
  }

  // Best e1rm ever for this exercise (PR).
  function prFor(ex: CustomExercise): number | null {
    const liftId = `custom-${ex.id}`;
    const vals = logs
      .filter((l) => l.lift_id === liftId && l.program_id === prog!.id && l.e1rm)
      .map((l) => Number(l.e1rm));
    if (!vals.length) return null;
    return Math.max(...vals);
  }

  async function finishSession() {
    if (!prog || !session) return;
    // Check at least one exercise has reps entered
    const anyAny = Object.values(byEx).some((s) => s.reps.some((r) => r > 0));
    if (!anyAny) {
      toast.error("Enter reps for at least one set before finishing.");
      return;
    }
    setBusy(true);
    try {
      const runNumber = await bumpCustomSessionRuns(prog.id, session.id);
      const dateIso = new Date().toISOString();
      const progressionMessages: string[] = [];
      const prMessages: string[] = [];

      // We need the latest sessions array (after bump). Re-read from local prog
      // is fine — applyProgression is pure and uses the exercise we already have.
      for (const ex of session.exercises) {
        const state = byEx[ex.id];
        if (!state) continue;
        const anyEntered = state.reps.some((r) => r > 0) || state.done.some(Boolean);
        if (!anyEntered) continue;

        // Build SetLog entries.
        const totalKg = prescribedWeight(ex, bodyweight, Number(prog.round || 2.5));
        const addedKg = ex.bodyweight ? Math.max(0, totalKg - bodyweight) : totalKg;
        const sets: SetLog[] = state.reps.map((r, i) => {
          const isAmrap = ex.amrap_last && i === ex.sets - 1;
          return {
            weight: totalKg,
            addedWeight: addedKg,
            target: ex.reps_low === ex.reps_high ? ex.reps_low : `${ex.reps_low}–${ex.reps_high}`,
            reps: r,
            amrap: isAmrap,
            done: !!state.done[i],
          };
        });

        // e1rm: from AMRAP set if any, else from heaviest completed set.
        let e1rm: number | null = null;
        const amrapSet = sets.find((s) => s.amrap && s.reps > 0);
        if (amrapSet) e1rm = estimate1RM(amrapSet.weight, amrapSet.reps);
        else {
          const top = sets.filter((s) => s.reps > 0).sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
          if (top) e1rm = estimate1RM(top.weight, top.reps);
        }

        const prevPr = prFor(ex);
        if (e1rm && prevPr && e1rm > prevPr) {
          prMessages.push(`🎉 New 1RM PR · ${ex.name}: ${e1rm} kg`);
        }

        await upsertLog({
          program_id: prog.id,
          lift_id: `custom-${ex.id}`,
          lift_name: ex.name,
          type: "custom",
          bodyweight: ex.bodyweight,
          week: 0,
          day: 0,
          cycle: runNumber,
          sets,
          e1rm,
          overload_earned: false,
          note: state.note.trim() || null,
          date: dateIso,
        });

        // Apply progression and persist back into the program if anything changed.
        const { next, changed, message } = applyProgression(ex, sets, Number(prog.round || 2.5));
        if (changed) {
          await updateCustomExercise(prog.id, session.id, next);
          if (message) progressionMessages.push(message);
        }
      }

      toast.success("Session saved");
      for (const m of prMessages) toast.success(m);
      for (const m of progressionMessages) toast.success(m);
      navigate({ to: "/" });
    } catch (e) {
      console.error(e);
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={session.name} hideTabBar back={() => navigate({ to: "/" })}>
      {session.exercises.length === 0 ? (
        <Empty>No exercises in this session.</Empty>
      ) : (
        session.exercises.map((ex) => {
          const state = byEx[ex.id];
          if (!state) return null;
          const totalKg = prescribedWeight(ex, bodyweight, Number(prog.round || 2.5));
          const addedKg = ex.bodyweight ? Math.max(0, totalKg - bodyweight) : totalKg;
          const last = lastLogFor(ex);
          const pr = prFor(ex);
          return (
            <Card key={ex.id}>
              <div className="mb-2 flex items-center justify-between">
                <div className="font-medium">
                  {ex.name}
                  <LiftBadge kind="custom" />
                  {ex.bodyweight && <LiftBadge kind="bw" />}
                </div>
                <div className="text-right text-[13px]">
                  <div className="font-medium">
                    {ex.bodyweight ? `+${addedKg.toFixed(1)} kg` : `${totalKg.toFixed(1)} kg`}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {ex.sets} × {ex.reps_low === ex.reps_high ? `${ex.reps_low}` : `${ex.reps_low}–${ex.reps_high}`}
                    {ex.amrap_last ? " (last AMRAP)" : ""}
                  </div>
                </div>
              </div>
              {(last || pr) && (
                <div className="mb-2 text-[11px] text-muted-foreground">
                  {last && (
                    <span>
                      Last: {(last.sets ?? []).map((s) => s.reps).join("/")} reps @ {(last.sets ?? [])[0]?.weight ?? "?"} kg
                      {" · "}
                      {new Date(last.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  {pr && <span className="ml-2">PR: {pr} kg e1RM</span>}
                </div>
              )}

              <div className="grid grid-cols-[52px_1fr_36px] items-center gap-1.5 border-b border-border py-1.5 text-[12px] text-muted-foreground">
                <div>Set</div>
                <div className="text-center">Reps done</div>
                <div />
              </div>
              {Array.from({ length: ex.sets }).map((_, i) => {
                const completed = state.done[i];
                const isAmrap = ex.amrap_last && i === ex.sets - 1;
                return (
                  <div key={i} className="grid grid-cols-[52px_1fr_36px] items-center gap-1.5 border-b border-border py-1.5 last:border-0">
                    <div className="text-[13px] font-medium">
                      Set {i + 1}
                      {isAmrap && <div className="text-[10px] font-semibold text-warning">AMRAP</div>}
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      enterKeyHint={i === ex.sets - 1 ? "done" : "next"}
                      value={state.reps[i] ?? 0}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setRep(ex.id, i, parseInt(e.target.value) || 0)}
                      className={`w-full rounded-lg border bg-input-bg px-2 py-1.5 text-center text-sm ${
                        completed ? "border-success bg-success-bg" : "border-input"
                      }`}
                    />
                    <button
                      onClick={() => toggleDone(ex.id, i)}
                      className={`flex h-7 w-7 items-center justify-center rounded-full border text-[13px] ${
                        completed ? "border-success bg-success-bg text-success" : "border-input text-muted-foreground"
                      }`}
                    >
                      ✓
                    </button>
                  </div>
                );
              })}

              <input
                type="text"
                value={state.note}
                onChange={(e) => setNote(ex.id, e.target.value)}
                placeholder="Note (optional)"
                maxLength={200}
                className="mt-2 w-full rounded-lg border border-input bg-input-bg px-2 py-1.5 text-[12px]"
              />
            </Card>
          );
        })
      )}

      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-2.5 border-t border-border bg-background px-4 pb-4 pt-2.5">
        <button
          onClick={() => navigate({ to: "/" })}
          className="flex-1 rounded-xl border border-input bg-card py-3 text-[15px] font-medium"
        >
          Cancel
        </button>
        <button
          disabled={busy}
          onClick={finishSession}
          className="flex-1 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Saving…" : "✓ Finish session"}
        </button>
      </div>
      <div className="h-20" />
    </AppShell>
  );
}
