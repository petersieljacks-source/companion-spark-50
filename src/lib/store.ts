import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Program, WorkoutLog, MainLift, SuppLift } from "@/lib/531";

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

  const activeProgram = state.programs.find((p) => p.active) ?? null;

  // ── Mutations ──
  async function createProgram(p: {
    name: string;
    variant: string;
    round: number;
    main_lifts: MainLift[];
    supp_lifts: SuppLift[];
  }) {
    if (!user) return;
    // Deactivate existing
    await supabase.from("programs").update({ active: false }).eq("user_id", user.id).eq("active", true);
    await supabase.from("programs").insert({
      user_id: user.id,
      name: p.name,
      variant: p.variant,
      round: p.round,
      main_lifts: p.main_lifts as never,
      supp_lifts: p.supp_lifts as never,
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
    setState((s) => ({ ...s, bodyweight: bw }));
  }

  return {
    ...state,
    activeProgram,
    refresh,
    createProgram,
    updateProgram,
    editProgram,
    deleteProgram,
    upsertLog,
    insertRestartMarker,
    setBodyweight,
  };
}
