

## Scope

Fix all P0 bugs (1–5), implement P1 #8, #9, #11, and all P2 (#12–#19) — no kg/lb toggle.

---

## P0 — Bug fixes

**1. Lock week tabs in review mode** — `workout.$type.$idx.tsx`: when `isReview`, disable Week 1/2/3/Deload buttons (visually muted, not clickable). Prevents corrupting historical logs.

**2. Preserve original log date on edit** — `workout.$type.$idx.tsx` `doSave()`: if `existingLog` exists, pass `date: existingLog.date` into `upsertLog`; only stamp `new Date().toISOString()` for first save.

**3. Suppress supp overload bump in review mode** — `workout.$type.$idx.tsx`: gate the "All sets at 10 — load increased" branch on `!isReview`.

**4. Recompute BW main TMs when bodyweight changes** — `store.ts` `setBodyweight()`: after upserting `user_settings`, if `activeProgram` has BW main lifts, patch `tm = bw + (addedLoad ?? 0)` for each and `updateProgram`.

**5. Cross-cycle lift identity** — `index.tsx` `buildLift1RMData` and `performance.tsx`: extend log lookup to also match by `lift_name` (case-insensitive), and clamp array indices everywhere lifts are indexed.

---

## P1 features

**#8 AMRAP PR celebration & hint** — `workout.$type.$idx.tsx`:
- Show "Best at 85%: 8 reps · 12 Mar" under the AMRAP set's "go for max" label.
- After explicit save with a new AMRAP rep PR for the same %TM, toast with celebration emoji.

**#9 TM auto-progression on cycle complete** — `index.tsx`:
- Detect when all 12 cells of current cycle are done.
- Show banner card: "Cycle N complete! Bump training maxes and start cycle N+1?"
- Inline editable rows per main lift with default bumps (+2.5 kg upper-body lifts, +5 kg lower; heuristic: name contains "squat"/"deadlift" → +5, else +2.5). User can edit each.
- Confirm calls a new store helper `advanceCycle(programId, newTMs)` which updates main_lifts + sets week=0/day=0/cycle+1 and inserts a restart marker.
- Dismiss button to defer (won't show again same session via local state).

**#11 Mark workout as skipped** — `session.tsx`:
- Add "Skip this day" link/button (subtle, in header area). Opens confirm.
- New log type `"skip"` (added to `WorkoutLog` union, store helper `addSkipMarker(week,day,cycle,note)`).
- `index.tsx` `isWorkoutDone` ignores skip; new `isWorkoutSkipped` check renders cell with a different style (dashed border + "—" glyph).

---

## P2 — Polish

**#12 Dates on cycle grid cells** — `index.tsx` `WeekRow`: look up the latest non-restart/non-skip log for each cell and render `dd/mm` under the ✓ in muted text. Skip marker shows "skip".

**#13 Browse past cycles** — `index.tsx`: add prev/next arrows + cycle indicator above the schedule grid. Local state `viewedCycle` (defaults to current). Past cycles render read-only (taps just navigate to review mode for that cycle's cells; future cycles disabled).

**#14 History filters** — `history.tsx`:
- Top filter bar: lift dropdown (all + each main+supp lift name) + date range presets (All / 7d / 30d / Cycle).
- Group entries by week+day with a sticky-ish header `Cycle N · Week X · Day Y · dd Mon`.

**#15 CSV export** — `settings.tsx`:
- New "Data" section with "Export all logs (CSV)" button.
- Generates CSV client-side with columns: date, program, cycle, week, day, lift, type, BW?, set#, weight, reps, target, e1rm, note. Trigger download via `<a download>` blob.

**#16 Empty-state CTA** — `index.tsx`: replace the "No active program" `<Empty>` with a centered card containing icon + heading + prominent "Create your first program" button linking to `/program/new`.

**#17 (already covered)** — Verified `gotoNext`/`gotoPrev` and `back` already `await doSave({silent:true})`. No code change; will note this in implementation.

**#18 Keyboard hints on rep inputs** — `workout.$type.$idx.tsx`: add `enterKeyHint="next"` to every rep input. On Enter, focus the next set's input (refs array); on the last set, blur. Improves mobile rep entry speed.

**#19 Rename + confirm "Restart cycle"** — `settings.tsx`: rename button to "Start new cycle". Wrap the restart panel reveal in an explicit confirm flow that already exists; tighten copy and add secondary destructive styling so it's not a one-tap mistake.

---

## Technical sketch

### Files touched

| File | Changes |
|---|---|
| `src/lib/531.ts` | Add `"skip"` to `WorkoutLog.type` union |
| `src/lib/store.ts` | `setBodyweight` recomputes BW TMs; new `addSkipMarker`, `advanceCycle`; logs query unaffected |
| `src/routes/index.tsx` | Cycle browser, dates on cells, skip styling, empty-state CTA, cycle-complete banner, lift-name fallback in `buildLift1RMData` |
| `src/routes/session.tsx` | "Skip this day" action |
| `src/routes/workout.$type.$idx.tsx` | Review-mode week-tab lock, preserve date on edit, gate overload bump, AMRAP PR hint + celebration, enter-key navigation between rep inputs |
| `src/routes/history.tsx` | Lift + date-range filter, grouped headers |
| `src/routes/settings.tsx` | CSV export section; rename "Restart cycle" → "Start new cycle" with confirm |
| `src/routes/performance.tsx` | Lift-name fallback when filtering logs |

### Helpers / types

- `src/lib/csv.ts` — small `toCsv(rows)` utility (escape quotes, newlines, commas).
- `src/lib/cycle.ts` — `isCycleComplete(prog, logs, cycle)`, `defaultTmBump(liftName)`.
- `WorkoutLog.type` extended: `"main" | "supp" | "restart" | "test" | "skip"`. No DB change required (column is `text`).

### No DB migrations needed

`workout_logs.type` is a free `text` column, so `"skip"` is allowed without schema changes. Existing RLS policies cover all new writes.

### Scope notes (deferred for later)

- **Rest timer (P1 #6)** and **Plate calculator (P1 #7)** are not in this batch (you didn't include them). Easy to add later as isolated components.
- **Per-workout notes (P1 #10)** — not in scope this round.
- **kg/lb toggle (P2 #20)** — explicitly skipped per your direction.

