## Goal

Let the user run training programs that are *not* Wendler 5/3/1 — for example a custom upper/lower split, a Push/Pull/Legs week, or just a flat list of exercises with a simple progression rule — while keeping all existing 5/3/1 functionality intact. Every workout log and every PR is preserved across cycles, edits, and program switches, forever.

## Approach: introduce a `kind` on Program

Today every program is implicitly 5/3/1: 4 weeks × 3 days, percentage scheme baked into `WEEK_SCHEME`, supporting lifts at 8–10 reps. We add a second engine — `kind: "custom"` — selected when creating the program. The two engines share the same logs table, the same History/Performance tabs, and the same PR system. 5/3/1 programs keep working unchanged.

```text
Program
 ├── kind: "wendler531"   → existing UI (cycle grid, AMRAP, TM bumps)
 └── kind: "custom"       → new UI (list of sessions, free sets, custom progression)
```

## What "custom" means in this app

A custom program is:

- **A list of *sessions*** the user defines (e.g. "Upper A", "Lower A", "Upper B", "Lower B"). No fixed week/day count.
- **Each session contains *exercises*** with: name, bodyweight flag, target sets, target reps (or rep range like `6–8`), starting weight or %1RM, and optional RPE.
- **A progression rule per exercise** (or a program-wide default), chosen from a small menu:
  - **Linear**: +X kg every session if all target reps hit (e.g. +2.5 upper / +5 lower).
  - **Double progression**: add reps within a range, then add weight and reset reps.
  - **Percentage**: weight = % of a stored 1RM, user updates 1RM manually or via test.
  - **Manual**: never auto-adjust; user edits weights themselves.
- **No cycle grid.** Instead a simple "Today's session" picker (which session do you want to do?) plus a History view per session and per exercise.

## User flows

### Creating a custom program
On the New Program screen, add a top-level choice:
- **5/3/1 (current)** — unchanged flow
- **Custom program** — opens a different builder

Custom builder:
1. Program name + progression default (Linear / Double / Percentage / Manual) + rounding.
2. Add sessions ("Upper A", etc.). For each session add exercises with: name, BW toggle, sets, reps (or range), start weight (or %1RM), progression rule (defaults to program default), increment.
3. Save → becomes the active program.

### Doing a workout
Home shows the active custom program with a "Start session" picker listing all defined sessions and the **last date trained** for each. The user taps one → goes to a session screen modeled on the existing workout page: rows of sets with weight + reps + done. AMRAP-style "as many reps as possible" can be enabled per exercise. Save logs the session to `workout_logs` exactly like a 5/3/1 log.

### Progression
On save, for each exercise the engine evaluates its rule:
- Linear: if every set hit target reps, next session's weight = current + increment.
- Double: if top-set reps reached the upper end of the range across all sets, bump weight and reset reps to lower end. Otherwise next session = current weight, target reps += 1 toward upper end.
- Percentage: weight is always derived from stored 1RM; "Test 1RM" action updates it.
- Manual: no change.

Result: the program's stored "current weight" / "current reps" for that exercise updates, and the user sees the new prescription next time. The user is shown a small toast like *"Bench: 60 → 62.5 kg next session"*.

### History & PRs (forever)
- **History tab** already lists `workout_logs` ordered by date — works unchanged for custom logs (lift_name + sets + e1rm).
- **Performance tab** already groups by `lift_name`; PRs (best e1rm, best weight at a given rep target) are computed from logs. We extend the chart picker to list every lift name that has ever been logged — across 5/3/1 programs, custom programs, deleted programs — so PRs persist for all time.
- A new **"All-time PRs"** section on Performance lists each unique `lift_name` with: best e1rm, heaviest weight × reps, date achieved.
- Logs are never deleted on program edit/delete (current behavior already preserves logs, except `deleteProgram` cascades — see Technical notes).

## Technical notes

### Database
One additive migration:
- `programs.kind text not null default 'wendler531'` — values: `'wendler531' | 'custom'`.
- `programs.sessions jsonb not null default '[]'` — for custom programs, the array of session definitions:
  ```ts
  type CustomSession = {
    id: string;
    name: string;
    exercises: CustomExercise[];
  };
  type CustomExercise = {
    id: string;
    name: string;
    bodyweight: boolean;
    sets: number;
    reps_low: number;
    reps_high: number;        // === reps_low for fixed reps
    weight: number;            // current working weight (kg above BW if bodyweight)
    one_rm?: number | null;    // for percentage progression
    pct?: number | null;       // for percentage progression
    rule: "linear" | "double" | "percentage" | "manual";
    increment: number;         // kg, default 2.5
    amrap_last: boolean;
    note?: string | null;
  };
  ```
- `programs.default_rule text` and `programs.default_increment numeric` — program-wide defaults.
- `workout_logs`: no schema change. Custom logs use `type: "custom"` (add to the union in `src/lib/531.ts`) and `lift_id: "custom-{exerciseId}"`. `week`/`day`/`cycle` carry session index / session run number for grouping but are not surfaced to the user.

To keep PRs forever even if the program is deleted:
- Change `deleteProgram` in `src/lib/store.ts` to **only set `active=false`** and rename ("Archived: <name>") OR keep delete but first null out program_id on logs (requires DB nullable). Simpler: archive instead of delete in the UI; expose a "Delete forever (also removes logs)" only in Settings. Add an `archived boolean default false` column.

### Files to add
- `src/lib/custom.ts` — types (`CustomSession`, `CustomExercise`), pure progression functions (`applyProgression(exercise, lastSets) -> exercise`), helpers.
- `src/routes/program.custom.new.tsx` — builder UI for custom programs (or branch inside existing `program.new.tsx` based on `kind`).
- `src/routes/custom-session.$sessionId.tsx` — workout screen for a custom session (mirrors `workout.$type.$idx.tsx`).
- `src/components/PRBoard.tsx` — all-time PR list, used in Performance tab.

### Files to change
- `src/lib/531.ts` — extend `WorkoutLog["type"]` to include `"custom"`; export `Program["kind"]`.
- `src/lib/store.ts` — `createProgram` accepts `kind` + `sessions`; new `updateCustomExercise(programId, sessionId, exerciseId, patch)` to write progression updates; `deleteProgram` becomes archive-by-default.
- `src/routes/index.tsx` — when `activeProgram.kind === "custom"`, render the **session picker** instead of the cycle grid; keep AMRAP/PR banners working.
- `src/routes/program.new.tsx` — top-level "Program type" selector (5/3/1 vs Custom) that routes to the right builder.
- `src/routes/performance.tsx` — list lifts by `lift_name` over **all logs** (not filtered by active program), add the all-time PR board.
- `src/routes/history.tsx` — already program-agnostic; ensure custom logs render (lift name + sets are enough).
- `src/components/AppShell.tsx` / TabBar — no change.

### Engine boundary
All 5/3/1-specific UI (`WeekRow`, cycle complete banner, TM bumps, week tabs) is gated on `activeProgram.kind === "wendler531"`. Custom programs never see those screens.

### Migration safety
- Existing rows: `kind` defaults to `'wendler531'`, `sessions` to `[]`. No data backfill needed.
- RLS policies unchanged.
- `WorkoutLog.type` is a TypeScript union only; DB stores it as `text` already.

## Out of scope for this plan (can be follow-ups)
- Calendar / scheduling ("do Upper A on Mon/Thu").
- Importing templates (PPL, nSuns, GZCLP) — would be future presets that produce a custom program.
- Per-exercise rest timer presets.
- Body-part / muscle-group tagging for volume tracking.

## Deliverable summary
After this plan: the user can pick **Custom program** in New Program, define their own sessions and exercises with a progression rule, train them from the home screen, and see every workout and every PR in History + Performance — alongside, or instead of, their 5/3/1 program. Nothing about the existing 5/3/1 flow changes for users who stay on it.
