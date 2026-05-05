import type { CustomExercise, ProgressionRule, SetLog } from "@/lib/531";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultExercise(rule: ProgressionRule, increment: number): CustomExercise {
  return {
    id: newId(),
    name: "",
    bodyweight: false,
    sets: 3,
    reps_low: 5,
    reps_high: 5,
    weight: 0,
    one_rm: null,
    pct: null,
    rule,
    increment,
    amrap_last: false,
    note: null,
    group: null,
  };
}

/**
 * Compute display labels (e.g. "A1", "A2", "B1") for exercises within a session.
 * Returns a map of exerciseId -> label (or null when the exercise is standalone).
 * Numbering restarts whenever the consecutive run of a group ends.
 */
export function computeSupersetLabels(exercises: CustomExercise[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  let lastGroup: string | null = null;
  let counter = 0;
  for (const ex of exercises) {
    const g = ex.group || null;
    if (!g) {
      out[ex.id] = null;
      lastGroup = null;
      counter = 0;
      continue;
    }
    if (g === lastGroup) {
      counter += 1;
    } else {
      lastGroup = g;
      counter = 1;
    }
    out[ex.id] = `${g}${counter}`;
  }
  return out;
}

/** Find the next unused superset letter in a session (A, B, C...). */
export function nextSupersetLetter(exercises: CustomExercise[]): string {
  const used = new Set(exercises.map((e) => e.group).filter(Boolean) as string[]);
  for (const c of "ABCDEFGHIJ") {
    if (!used.has(c)) return c;
  }
  return "A";
}

function roundTo(value: number, step: number): number {
  if (!step || step <= 0) return value;
  return Math.round(value / step) * step;
}

/**
 * Pure progression: given an exercise and the user's reported sets for the
 * just-finished session, return the updated exercise (new working weight,
 * new rep target, etc.) for next time. Does not mutate input.
 */
export function applyProgression(
  exercise: CustomExercise,
  performedSets: SetLog[],
  rounding: number,
): { next: CustomExercise; changed: boolean; message: string | null } {
  const { rule } = exercise;

  if (rule === "manual") {
    return { next: exercise, changed: false, message: null };
  }

  const completedSets = performedSets.filter((s) => s.done || s.reps > 0);

  if (rule === "linear") {
    if (completedSets.length < exercise.sets) {
      return { next: exercise, changed: false, message: null };
    }
    const allHit = completedSets.every((s) => s.reps >= exercise.reps_low);
    if (allHit) {
      const nextWeight = roundTo(exercise.weight + (exercise.increment || 0), rounding || 2.5);
      if (nextWeight !== exercise.weight) {
        return {
          next: { ...exercise, weight: nextWeight },
          changed: true,
          message: `${exercise.name}: ${exercise.weight} → ${nextWeight} kg next session`,
        };
      }
    }
    return { next: exercise, changed: false, message: null };
  }

  if (rule === "double") {
    if (completedSets.length < exercise.sets) {
      return { next: exercise, changed: false, message: null };
    }
    const everyHitTop = completedSets.every((s) => s.reps >= exercise.reps_high);
    if (everyHitTop) {
      const nextWeight = roundTo(exercise.weight + (exercise.increment || 0), rounding || 2.5);
      return {
        next: { ...exercise, weight: nextWeight, reps_low: exercise.reps_low, reps_high: exercise.reps_high },
        changed: true,
        message: `${exercise.name}: ${exercise.weight} → ${nextWeight} kg, reset to ${exercise.reps_low} reps`,
      };
    }
    return { next: exercise, changed: false, message: null };
  }

  if (rule === "percentage") {
    // Weight is derived from one_rm * pct. No auto-update on session save —
    // the user updates one_rm separately (e.g. via a 1RM test).
    return { next: exercise, changed: false, message: null };
  }

  return { next: exercise, changed: false, message: null };
}

/** Compute the prescribed weight for one set at session start. */
export function prescribedWeight(exercise: CustomExercise, bodyweight: number, rounding: number): number {
  if (exercise.rule === "percentage" && exercise.one_rm && exercise.pct) {
    const w = roundTo(exercise.one_rm * exercise.pct, rounding || 2.5);
    return exercise.bodyweight ? bodyweight + Math.max(0, w - bodyweight) : w;
  }
  return exercise.bodyweight ? bodyweight + (exercise.weight || 0) : exercise.weight || 0;
}
