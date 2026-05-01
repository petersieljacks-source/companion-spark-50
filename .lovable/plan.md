## Goal

Three related changes to make multi-program use first-class:

1. **Save & switch programs** — keep multiple programs in your library, switch the active one without deleting anything. Stats/PRs/history are preserved (logs are already keyed to `program_id`, so they survive untouched).
2. **Cycle-grid equivalent for custom programs** — give custom programs a recent-activity overview similar to the 5/3/1 cycle grid.
3. **Default session names "Lower" / "Upper"** when creating a custom program with two sessions.

---

## 1. Save & switch programs

### Today

- Programs already persist in the `programs` table per user.
- Exactly one is `active=true` at a time. `createProgram` auto-deactivates the previous active one — but the previous one is *not* deleted, so it's effectively already saved.
- There's no UI to see your saved programs or to switch between them.
- `archiveProgram(id)` exists in the store but is unused.

### Change

**A. Programs library page (`/programs`)**
New route file `src/routes/programs.tsx` showing a list of all the user's programs:

- Each row: program name, kind badge (5/3/1 / Custom), variant, "Active" badge if applicable, last-trained date (derived from `logs`), session/cycle counter.
- Row actions: **Switch to this program**, **Edit**, **Archive**, **Delete** (with confirm).
- "Switch" sets `active=true` on the chosen program and `active=false` on all others for the user. No data is touched on either program — TMs, cycle counter, week/day pointer, custom-session run counters, and all logs stay exactly as they were when you last left that program.
- Archived programs render in a collapsed "Archived" section with an **Unarchive** action.

**B. Entry points**
- Add a **"Programs"** link in the home-screen header (next to "Edit program" / "New Program").
- Add a **"Programs"** link in `/settings` under a new "Library" section.
- The existing "+ New Program" button stays where it is.

**C. Store additions**
In `src/lib/store.ts`:
- `setActiveProgram(id)` — single-shot switch (deactivate all others, activate `id`). No mutation of week/day/cycle/logs.
- `unarchiveProgram(id)` — sets `archived=false`. Does NOT auto-activate.

**D. Safety**
- Deletion warns that *all logs for that program* will also be removed (FK-less but filtered by `program_id`); offer **Archive instead** as the recommended action.
- Active program cannot be deleted directly — user must switch to another first.

### Result

You can keep, e.g., a 5/3/1 program and a custom Upper/Lower program side-by-side, switch between them from the Programs page, and resume each one exactly where you left it. PRs and history are global to the user and untouched by switching.

---

## 2. Custom-program "cycle grid" equivalent

### Constraint

Custom programs have no fixed weekly structure: sessions are user-named, run on demand, and have no week/day grid. A 4×3 calendar wouldn't map.

### Suggestion (recommended)

A **"Recent sessions" strip** on the custom home screen, modeled on the cycle-grid's at-a-glance density but adapted to session-based training:

```text
RECENT SESSIONS
┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │ Sun  │ Mon  │
│ Upper│  ·   │ Lower│  ·   │ Upper│  ·   │  ·   │ Lower│  → tap to view that session log
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
        last 14 days · 6 trained
```

- Horizontal grid of the last 14 (or 28) calendar days.
- Each cell shows the session name if a `custom`-type log exists for that day, otherwise a dot.
- Tapping a filled cell jumps to that day's history entry; tapping an empty cell does nothing.
- Below the strip: small counters "Sessions this week: 3 · This month: 11 · Streak: 4 days".

This mirrors the cycle-grid's purpose (see what you've done, see what's next) but respects the open-ended nature of custom programs. It sits between the existing `SessionPicker` (start a session) and the "Best estimated 1RM" card.

If you'd prefer something different — e.g. a per-session "last 5 runs" sparkline of top weight, or a heatmap-style monthly view — say which and I'll swap the design before building.

---

## 3. Default session names for custom programs

In `src/routes/program.new.tsx`, the session creator currently appends `"Session N"`. Change behaviour:

- When the user adds the **2nd** session to a brand-new custom program (and the first is still the default `"Session 1"`), auto-rename the two sessions to **"Lower"** and **"Upper"** respectively.
- More generally: provide a small preset chooser at the top of the Sessions section — **Upper/Lower (2)**, **Push/Pull/Legs (3)**, **4-day Upper/Lower**, **Custom names**. Selecting a preset seeds the session list with the named sessions (still empty exercises). User can rename freely afterwards.
- Existing programs are unaffected; this is creation-time only.

---

## Technical details

**Files to add**
- `src/routes/programs.tsx` — library/switcher page.

**Files to edit**
- `src/lib/store.ts` — add `setActiveProgram`, `unarchiveProgram`; export both.
- `src/routes/index.tsx` —
  - Add header link to `/programs`.
  - Add `RecentSessionsStrip` component used inside `CustomHome`.
- `src/routes/program.new.tsx` —
  - Add session-template preset row.
  - Update `addSession` to rename to Lower/Upper when the 2-session preset is implied.
- `src/routes/settings.tsx` — add a "Library" entry linking to `/programs`.

**Data model**
- No schema changes required. `programs.archived` and `programs.active` already exist; `workout_logs.program_id` already isolates history per program.
- Switching a program is a 2-row update on `programs` (deactivate current + activate target). RLS already restricts rows to `auth.uid() = user_id`.

**Edge cases handled**
- Switching to a program whose `week`/`day` pointer is past the end of its cycle: home screen already shows the cycle-complete banner — no new logic needed.
- Switching to a custom program: the `Home` component already branches on `kind === "custom"`.
- Deleting the active program is blocked in the UI (must switch first), preventing an "no active program" surprise.

---

## Open question

Before I build, confirm the preferred custom-program overview from §2:

- **(a) Recent sessions strip** (recommended above), or
- **(b)** something else — e.g. per-session sparklines of top weight, or a monthly heatmap.

If you say "go with (a)", I'll implement everything above as one batch.