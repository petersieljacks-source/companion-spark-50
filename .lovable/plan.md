# Plan: Easier numeric editing + Superset labels

Two related improvements to the custom program editor and session screens.

## 1. Select-all-on-focus for numeric inputs

**Problem:** On mobile, tapping a pre-filled number field (e.g. "5" reps, "3" sets, "100" kg) places the cursor at the end. To replace the value the user has to long-press, select, then delete — multiple awkward steps.

**Fix:** When a numeric input gains focus, automatically select its full content so the next keystroke replaces it. Standard mobile pattern.

**Where:**
- The shared `NumberField` component in `src/routes/program.new.tsx` (used for sets, reps, weight, %, increment, etc.) — single change covers most program-creation fields.
- The other inline `type="number"` inputs in the same file (TM, addedLoad, supp weight, rep_targets S1/S2/S3, supp increment, default increment).
- Numeric inputs during workout logging: `src/routes/workout.$type.$idx.tsx`, `src/routes/custom-session.$sessionId.tsx`.
- Bodyweight, defaults, and PR fields in `src/routes/settings.tsx`, `src/routes/performance.tsx`, `src/routes/index.tsx`.

**How:** Add `onFocus={(e) => e.currentTarget.select()}` to each numeric input. For consistency, factor a tiny helper (`selectOnFocus`) and reuse, or just inline it. No behavior change for keyboard users on desktop — selection still works the same.

## 2. Superset grouping in custom programs (A1, A2, B1...)

**Goal:** In a custom session, mark exercises as part of a superset so they display as `A1 Bench Press`, `A2 Pull-ups`, `B1 ...` etc. — matching common programming notation.

### Data model

Add one optional field to `CustomExercise` in `src/lib/531.ts`:

```ts
group?: string | null;  // e.g. "A", "B", "C". null/undefined = standalone exercise
```

No migration needed — `sessions` is stored as JSON in the `programs` table, so old programs simply have `group === undefined` and render as standalone (no letter prefix).

The position label (`A1`, `A2`) is **derived** from order within the session: among consecutive exercises sharing the same `group`, the index = 1, 2, 3.... So the user only picks the letter; the number is automatic.

### Editor UX (in `src/routes/program.new.tsx` → `ExerciseEditor`)

Add a small "Superset" selector next to the BW checkbox at the top of each exercise card:

```text
[ Bench Press            ] [Group: – ▾] [□ BW] [×]
```

Dropdown options: `–` (none), `A`, `B`, `C`, `D`, `E`. Default `–`.

A helper button on the session header — `+ New superset` — appends two empty exercises with the next available group letter pre-filled, so a user can build "A1/A2" in one tap.

Above the exercise list, when a session contains supersets, we compute and show preview labels (`A1`, `A2`, then `B1`...) inline at the start of each row to confirm the grouping.

### Display

Anywhere a custom exercise name is shown, prefix with the derived label when grouped:

- Editor preview rows
- `src/routes/custom-session.$sessionId.tsx` — the live workout screen, so lifters see `A1 Bench Press` / `A2 Pull-ups` and know to alternate.
- History entries (optional polish — keep for later if it complicates the log schema; logs already store `lift_name`, so we'd just compute the prefix at render time from the program snapshot).

A small shared helper `computeSupersetLabels(exercises)` returns `Record<exerciseId, string | null>` so all screens share one rule.

### Notes / non-goals

- Rest-timer or alternation-prompt logic is **not** part of this change. Superset is purely a label/grouping for now.
- Reordering exercises within a session is already handled by editor order (no drag-and-drop changes needed); to break a superset apart, the user just changes the group dropdown back to `–`.
- The 5/3/1 program flow is untouched.

## Files touched

- `src/lib/531.ts` — add optional `group` to `CustomExercise`.
- `src/lib/custom.ts` — `defaultExercise` keeps `group` undefined; add `computeSupersetLabels` helper.
- `src/routes/program.new.tsx` — `NumberField` select-on-focus; group dropdown in `ExerciseEditor`; "+ New superset" button; preview labels.
- `src/routes/custom-session.$sessionId.tsx` — render `A1`/`A2` prefix in exercise headers; add select-on-focus to numeric inputs.
- `src/routes/workout.$type.$idx.tsx`, `src/routes/settings.tsx`, `src/routes/performance.tsx`, `src/routes/index.tsx` — select-on-focus on numeric inputs.

No DB migration. No new dependencies.
