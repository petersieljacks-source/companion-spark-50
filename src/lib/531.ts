// 5/3/1 domain logic — ported from the original HTML app

export const WEEK_SCHEME: { pct: number; reps: number | string }[][] = [
  [{ pct: 0.65, reps: 5 }, { pct: 0.75, reps: 5 }, { pct: 0.85, reps: "5+" }],
  [{ pct: 0.70, reps: 3 }, { pct: 0.80, reps: 3 }, { pct: 0.90, reps: "3+" }],
  [{ pct: 0.75, reps: 5 }, { pct: 0.85, reps: 3 }, { pct: 0.95, reps: "1+" }],
  [{ pct: 0.40, reps: 5 }, { pct: 0.50, reps: 5 }, { pct: 0.60, reps: 5 }],
];

export const WEEK_LABELS = ["Week 1", "Week 2", "Week 3", "Deload"];
export const DAYS_PER_WEEK = 3;
export const DAY_LABELS = ["Day 1", "Day 2", "Day 3"];
export const SUPP_SETS = 3;

export type MainLift = {
  name: string;
  bodyweight: boolean;
  tm: number;
  addedLoad?: number;
};

export type SuppLift = {
  name: string;
  bodyweight: boolean;
  weight: number;
  /** Per-set rep targets. Length = SUPP_SETS. Defaults to [10,10,10] for legacy lifts. */
  rep_targets?: number[];
  /** Kg added when the user accepts the post-workout load-bump prompt. Defaults to 2.5. */
  increment?: number;
};

/** Default per-set rep targets for a supporting lift (matches legacy "all sets at 10" trigger). */
export function defaultRepTargets(): number[] {
  return Array(SUPP_SETS).fill(10);
}

export type SetLog = {
  weight: number;
  addedWeight: number;
  target?: number | string;
  reps: number;
  amrap?: boolean;
  done: boolean;
};

export type ProgramKind = "wendler531" | "custom";

export type ProgressionRule = "linear" | "double" | "percentage" | "manual";

export type CustomExercise = {
  id: string;
  name: string;
  bodyweight: boolean;
  sets: number;
  reps_low: number;
  reps_high: number; // === reps_low for fixed reps
  weight: number; // current working added weight (kg) — for BW lifts this is added load on top of bodyweight
  one_rm?: number | null;
  pct?: number | null;
  rule: ProgressionRule;
  increment: number;
  amrap_last: boolean;
  note?: string | null;
};

export type CustomSession = {
  id: string;
  name: string;
  exercises: CustomExercise[];
  /** Number of times this session has been performed (used as `cycle` in logs). */
  runs?: number;
};

export type Program = {
  id: string;
  user_id: string;
  name: string;
  variant: string;
  round: number;
  kind?: ProgramKind;
  main_lifts: MainLift[];
  supp_lifts: SuppLift[];
  sessions?: CustomSession[];
  default_rule?: ProgressionRule;
  default_increment?: number;
  archived?: boolean;
  week: number;
  day: number;
  cycle: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type WorkoutLog = {
  id: string;
  user_id: string;
  program_id: string;
  lift_id: string;
  lift_name: string;
  type: "main" | "supp" | "restart" | "test" | "skip" | "custom";
  bodyweight: boolean;
  week: number;
  day: number;
  cycle: number;
  sets: SetLog[];
  e1rm: number | null;
  overload_earned: boolean;
  note?: string | null;
  date: string;
};

export function roundTo(val: number, step: number) {
  return Math.round(val / step) * step;
}

export function estimate1RM(weight: number, reps: number) {
  return Math.round(weight * (1 + reps / 30));
}
