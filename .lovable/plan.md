## Goal

Give you a one-click "Start over" that wipes every program, every workout log, and resets bodyweight — so the app is back to the same state as a brand-new account. Auth/login stays intact.

## What gets reset

- All programs (active, archived, custom, 5/3/1) — deleted
- All workout logs (sets, restarts, skips, PRs derived from logs) — deleted
- Bodyweight → reset to default 80 kg
- After reset, you land on the empty home screen and can create a fresh program from scratch

What is NOT touched: your account/login.

## Where it lives

A new **Danger zone** card at the bottom of `src/routes/settings.tsx`, below the existing "Export logs (CSV)" section. It uses the existing red destructive style (same look as the "Delete program" button).

Flow:
1. Tap **Reset all data**.
2. An `AlertDialog` confirmation appears listing exactly what will be deleted, with a final **"Yes, wipe everything"** red button. Cancel is the default.
3. On confirm: delete rows in Supabase, clear local store, toast "All data cleared", navigate to `/`.

## Technical changes

- **`src/lib/store.ts`**: add `resetAllData()` method.
  - `supabase.from("workout_logs").delete().eq("user_id", user.id)`
  - `supabase.from("programs").delete().eq("user_id", user.id)`
  - `supabase.from("user_settings").update({ bodyweight: 80 }).eq("user_id", user.id)`
  - On success: `set({ programs: [], logs: [], bodyweight: 80 })`
  - Existing RLS policies already allow delete/update scoped to `auth.uid()`, so no migration is needed.

- **`src/routes/settings.tsx`**: add the Danger zone card + AlertDialog using the existing `@/components/ui/alert-dialog` primitives. Wire the confirm button to `resetAllData()` then `navigate({ to: "/" })`.

No schema migration, no new dependencies.
