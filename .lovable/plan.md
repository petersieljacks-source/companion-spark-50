

## Fix back navigation after reviewing a past workout

### Problem
Tapping a completed cell in the cycle grid currently *moves* the program pointer (`activeProgram.week/day`) to that past workout, then opens the session. When you press Back, home shows that older day instead of your real current day. Reviewing a past workout should never change where you are in the program.

### Solution
Stop mutating the active program when jumping into a past workout. Instead, pass the target week/day/cycle as URL search params, so review/edit happens "in context" without changing the user's true position. The home page always shows the real current day.

### Behavior after the fix
- Tap a **completed** cell → opens that workout's session view in review mode (URL: `/session?week=W&day=D&cycle=C`). Lifts are pre-filled with the logged data and remain editable. Pressing **Back** returns to home, which still shows the real current day (e.g. Cycle 2 · Week 1 · Day 2).
- Tap the **current** cell (●) → opens the live session, same as the Train button.
- Tap a **future** cell → still asks for confirmation; on confirm, this is a real "skip ahead" action that *does* move the pointer (current behavior preserved, since future = actually advancing the program).
- **Train** button and **Previous / Next** buttons keep working as today (they manipulate the real pointer).
- Inside a session opened in review mode, tapping a lift opens `/workout/main/0?week=W&day=D&cycle=C` so edits save against the correct historical slot. Back goes to the review session, then back to home (real day).

### Technical changes
- **`src/routes/session.tsx`**: add `validateSearch` for optional `week`, `day`, `cycle` (numbers). Use them when present, otherwise fall back to `prog.week/day/cycle`. Forward these params on the inner `<Link to="/workout/...">` so the workout page logs into the right cell.
- **`src/routes/workout.$type.$idx.tsx`**: add the same `validateSearch`. Replace every read of `prog.week/day/cycle` with the override-aware values (current week, day, cycle). Pass them into `upsertLog(...)` so edits write to the historical row, not today's. Keep `setCurrentWeek` initialised from the override week.
- **`src/routes/index.tsx`**: change `onJumpTo(week, day)` so it no longer calls `updateProgram`. It just navigates: `navigate({ to: "/session", search: { week, day, cycle: prog.cycle } })`. The future-cell branch keeps its confirm + `updateProgram` (real skip-ahead).
- **AppShell back button**: already routes to `/`, which now correctly shows the real current day because we never mutated it.

No database, store, or migration changes needed.

