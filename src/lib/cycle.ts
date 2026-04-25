import { DAYS_PER_WEEK, WEEK_LABELS, type Program, type WorkoutLog } from "@/lib/531";

export function isCycleComplete(prog: Program, logs: WorkoutLog[], cycle: number) {
  for (let w = 0; w < WEEK_LABELS.length; w++) {
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      const has = logs.some(
        (l) =>
          l.program_id === prog.id &&
          l.cycle === cycle &&
          l.week === w &&
          l.day === d &&
          (l.type === "main" || l.type === "supp" || l.type === "skip"),
      );
      if (!has) return false;
    }
  }
  return true;
}

/** Default training-max bump in kg by lift name. Lower body → +5, upper body → +2.5. */
export function defaultTmBump(name: string): number {
  const n = name.toLowerCase();
  if (
    n.includes("squat") ||
    n.includes("deadlift") ||
    n.includes("dl") ||
    n.includes("kreuzheben") ||
    n.includes("kniebeuge")
  ) {
    return 5;
  }
  return 2.5;
}
