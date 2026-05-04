import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type {
  Program,
  WorkoutLog,
  MainLift,
  SuppLift,
  CustomSession,
  CustomExercise,
  ProgramKind,
  ProgressionRule,
} from "@/lib/531";

type StoreState = {
  programs: Program[];
  logs: WorkoutLog[];
  bodyweight: number;
  loading: boolean;
};

export function useStore() {
  const { user } = useAuth();
  const [state, setState] = useState<StoreState>({
    programs: [],
    logs: [],
    bodyweight: 80,
    loading: true,
  });

  const refresh = useCallback(async () => {
    if (!user) return;
    setState((s) => ({ ...s, loading: true }));
    const [progRes, logRes, settingsRes] = await Promise.all([
      supabase.from("programs").select("*").order("created_at", { ascending: false }),
      supabase.from("workout_logs").select("*").order("date", { ascending: true }),
      supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    ]);

    let bw = 80;
    if (settingsRes.data) {
      bw = Number(settingsRes.data.bodyweight);
    } else {
      // initialize on first load
      await supabase.from("user_settings").insert({ user_id: user.id, bodyweight: 80 });
    }

    setState({
      programs: (progRes.data ?? []) as unknown as Program[],
      logs: (logRes.data ?? []) as unknown as WorkoutLog[],
      bodyweight: bw,
      loading: false,
    });
  }, [user]);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  const activeProgram = state.programs.find((p) => p.active && !p.archived) ?? null;

  // ── Mutations ──
  async function createProgram(p: {
    name: string;
    variant: string;
    round: number;
    main_lifts: MainLift[];
    supp_lifts: SuppLift[];
    kind?: ProgramKind;
    sessions?: CustomSession[];
    default_rule?: ProgressionRule;
    default_increment?: number;
  }) {
    if (!user) return;
    // Deactivate existing
    await supabase.from("programs").update({ active: false }).eq("user_id", user.id).eq("active", true);
    await supabase.from("programs").insert({
      user_id: user.id,
      name: p.name,
      variant: p.variant,
      round: p.round,
      kind: p.kind ?? "wendler531",
      main_lifts: p.main_lifts as never,
      supp_lifts: p.supp_lifts as never,
      sessions: (p.sessions ?? []) as never,
      default_rule: p.default_rule ?? "linear",
      default_increment: p.default_increment ?? 2.5,
      week: 0,
      cycle: 1,
      active: true,
    });
    await refresh();
  }

  async function updateProgram(id: string, patch: Partial<Program>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from("programs").update(patch as any).eq("id", id);
    await refresh();
  }

  // Edit a program in place. Preserves history (logs).
  // If the main lifts identity changes (added/removed/renamed/reordered), restart the cycle:
  //   set week=0, bump cycle, and insert a "restart" marker for clarity.
  async function editProgram(
    id: string,
    p: {
      name: string;
      variant: string;
      round: number;
      main_lifts: MainLift[];
      supp_lifts: SuppLift[];
    },
  ) {
    if (!user) return;
    const existing = state.programs.find((x) => x.id === id);
    if (!existing) return;
    const sameMain =
      existing.main_lifts.length === p.main_lifts.length &&
      existing.main_lifts.every(
        (l, i) =>
          l.name.trim().toLowerCase() === p.main_lifts[i].name.trim().toLowerCase() &&
          !!l.bodyweight === !!p.main_lifts[i].bodyweight,
      );
    const patch: Partial<Program> = {
      name: p.name,
      variant: p.variant,
      round: p.round,
      main_lifts: p.main_lifts,
      supp_lifts: p.supp_lifts,
    };
    let newCycle = existing.cycle;
    if (!sameMain) {
      newCycle = existing.cycle + 1;
      patch.week = 0;
      patch.day = 0;
      patch.cycle = newCycle;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from("programs").update(patch as any).eq("id", id);
    if (!sameMain) {
      await insertRestartMarker(id, newCycle, "Main lifts changed — cycle restarted");
    }
    await refresh();
  }

  async function deleteProgram(id: string) {
    await supabase.from("programs").delete().eq("id", id);
    await refresh();
  }

  async function resetAllData() {
    if (!user) throw new Error("Not signed in");
    const delLogs = await supabase.from("workout_logs").delete().eq("user_id", user.id);
    if (delLogs.error) throw delLogs.error;
    const delProgs = await supabase.from("programs").delete().eq("user_id", user.id);
    if (delProgs.error) throw delProgs.error;
    const upBw = await supabase.from("user_settings").update({ bodyweight: 80 }).eq("user_id", user.id);
    if (upBw.error) throw upBw.error;
    setState((s) => ({ ...s, programs: [], logs: [], bodyweight: 80 }));
  }

  async function upsertLog(log: Omit<WorkoutLog, "id" | "user_id">) {
    if (!user) throw new Error("Not signed in");
    // Remove any existing log for same lift in same week/day/cycle
    const del = await supabase
      .from("workout_logs")
      .delete()
      .eq("user_id", user.id)
      .eq("program_id", log.program_id)
      .eq("lift_id", log.lift_id)
      .eq("week", log.week)
      .eq("day", log.day)
      .eq("cycle", log.cycle);
    if (del.error) throw del.error;
    const ins = await supabase.from("workout_logs").insert({
      user_id: user.id,
      program_id: log.program_id,
      lift_id: log.lift_id,
      lift_name: log.lift_name,
      type: log.type,
      bodyweight: log.bodyweight,
      week: log.week,
      day: log.day,
      cycle: log.cycle,
      sets: log.sets as never,
      e1rm: log.e1rm,
      overload_earned: log.overload_earned,
      note: log.note ?? null,
      date: log.date,
    });
    if (ins.error) throw ins.error;
    await refresh();
  }

  async function insertRestartMarker(program_id: string, cycle: number, note: string) {
    if (!user) return;
    await supabase.from("workout_logs").insert({
      user_id: user.id,
      program_id,
      lift_id: "restart",
      lift_name: "—",
      type: "restart",
      bodyweight: false,
      week: 0,
      day: 0,
      cycle,
      sets: [] as never,
      e1rm: null,
      overload_earned: false,
      note,
      date: new Date().toISOString(),
    });
    await refresh();
  }

  async function setBodyweight(bw: number) {
    if (!user) return;
    await supabase.from("user_settings").upsert({ user_id: user.id, bodyweight: bw });
    // Recompute TM for any BW main lifts on the active program so historical
    // assumption (TM = BW + addedLoad) stays consistent.
    const active = state.programs.find((p) => p.active) ?? null;
    if (active && active.main_lifts.some((l) => l.bodyweight)) {
      const newMain = active.main_lifts.map((l) =>
        l.bodyweight ? { ...l, tm: bw + (l.addedLoad ?? 0) } : l,
      );
      await supabase.from("programs").update({ main_lifts: newMain as never }).eq("id", active.id);
    }
    setState((s) => ({ ...s, bodyweight: bw }));
    await refresh();
  }

  async function addSkipMarker(input: {
    program_id: string;
    week: number;
    day: number;
    cycle: number;
    note?: string | null;
  }) {
    if (!user) throw new Error("Not signed in");
    // Remove any existing skip marker for this slot, then insert.
    await supabase
      .from("workout_logs")
      .delete()
      .eq("user_id", user.id)
      .eq("program_id", input.program_id)
      .eq("lift_id", "skip")
      .eq("week", input.week)
      .eq("day", input.day)
      .eq("cycle", input.cycle);
    const ins = await supabase.from("workout_logs").insert({
      user_id: user.id,
      program_id: input.program_id,
      lift_id: "skip",
      lift_name: "—",
      type: "skip",
      bodyweight: false,
      week: input.week,
      day: input.day,
      cycle: input.cycle,
      sets: [] as never,
      e1rm: null,
      overload_earned: false,
      note: input.note ?? null,
      date: new Date().toISOString(),
    });
    if (ins.error) throw ins.error;
    await refresh();
  }

  async function advanceCycle(programId: string, newTms: number[]) {
    if (!user) return;
    const existing = state.programs.find((p) => p.id === programId);
    if (!existing) return;
    const newMain = existing.main_lifts.map((l, i) => {
      const v = newTms[i];
      if (l.bodyweight) {
        const added = typeof v === "number" && isFinite(v) ? Math.max(0, v - state.bodyweight) : (l.addedLoad ?? 0);
        return { ...l, addedLoad: added, tm: state.bodyweight + added };
      }
      return { ...l, tm: typeof v === "number" && isFinite(v) ? v : l.tm };
    });
    const newCycle = existing.cycle + 1;
    await insertRestartMarker(programId, newCycle, `Cycle ${existing.cycle} complete — TMs bumped`);
    await supabase
      .from("programs")
      .update({ main_lifts: newMain as never, week: 0, day: 0, cycle: newCycle })
      .eq("id", programId);
    await refresh();
  }

  async function addManualTest(input: {
    program_id: string;
    lift_idx: number;
    lift_name: string;
    date: string; // ISO
    weight: number;
    reps: number;
    e1rm: number;
    note?: string | null;
  }) {
    if (!user) throw new Error("Not signed in");
    const ins = await supabase.from("workout_logs").insert({
      user_id: user.id,
      program_id: input.program_id,
      lift_id: `main-${input.lift_idx}`,
      lift_name: input.lift_name,
      type: "test",
      bodyweight: false,
      week: 0,
      day: 0,
      cycle: 0,
      sets: [
        { weight: input.weight, addedWeight: 0, reps: input.reps, done: true },
      ] as never,
      e1rm: input.e1rm,
      overload_earned: false,
      note: input.note ?? null,
      date: input.date,
    });
    if (ins.error) throw ins.error;
    await refresh();
  }

  async function deleteLog(id: string) {
    if (!user) return;
    await supabase.from("workout_logs").delete().eq("id", id).eq("user_id", user.id);
    await refresh();
  }

  // ── Custom-program helpers ──

  /** Replace one exercise inside a custom program's session. */
  async function updateCustomExercise(programId: string, sessionId: string, exercise: CustomExercise) {
    if (!user) return;
    const prog = state.programs.find((p) => p.id === programId);
    if (!prog) return;
    const sessions = (prog.sessions ?? []).map((s) =>
      s.id === sessionId
        ? { ...s, exercises: s.exercises.map((e) => (e.id === exercise.id ? exercise : e)) }
        : s,
    );
    await supabase.from("programs").update({ sessions: sessions as never }).eq("id", programId);
    await refresh();
  }

  /** Bump the run counter on a custom session (used as `cycle` on logs to dedupe rows). */
  async function bumpCustomSessionRuns(programId: string, sessionId: string): Promise<number> {
    const prog = state.programs.find((p) => p.id === programId);
    if (!prog) return 1;
    const sessions = (prog.sessions ?? []).map((s) =>
      s.id === sessionId ? { ...s, runs: (s.runs ?? 0) + 1 } : s,
    );
    const target = sessions.find((s) => s.id === sessionId);
    await supabase.from("programs").update({ sessions: sessions as never }).eq("id", programId);
    await refresh();
    return target?.runs ?? 1;
  }

  /** Soft-archive: keep program + logs, just hide it from the active flow. */
  async function archiveProgram(id: string) {
    if (!user) return;
    await supabase.from("programs").update({ archived: true, active: false }).eq("id", id);
    await refresh();
  }

  /** Unarchive a program. Does NOT activate it. */
  async function unarchiveProgram(id: string) {
    if (!user) return;
    await supabase.from("programs").update({ archived: false }).eq("id", id);
    await refresh();
  }

  /** Switch the active program. Deactivates all others; activates the chosen one.
   *  No mutation of cycle/week/day/logs — picks up exactly where it left off. */
  async function setActiveProgram(id: string) {
    if (!user) return;
    await supabase.from("programs").update({ active: false }).eq("user_id", user.id).eq("active", true);
    await supabase.from("programs").update({ active: true, archived: false }).eq("id", id);
    await refresh();
  }

  return {
    ...state,
    activeProgram,
    refresh,
    createProgram,
    updateProgram,
    editProgram,
    deleteProgram,
    resetAllData,
    archiveProgram,
    unarchiveProgram,
    setActiveProgram,
    upsertLog,
    insertRestartMarker,
    setBodyweight,
    addManualTest,
    deleteLog,
    addSkipMarker,
    advanceCycle,
    updateCustomExercise,
    bumpCustomSessionRuns,
  };
}
