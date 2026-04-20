
Fix the workout screen so the bottom action bar is actually visible above the global tab bar, which will reveal the missing “Finish workout” button on the final exercise.

1. Update the shared app shell
- Add an option to `AppShell` to hide the global bottom tab bar on full-screen workout flows.
- Keep the current default behavior for all other pages so the rest of the app is unchanged.

2. Apply the shell option to the workout route
- Render the workout page without the global tab bar.
- Preserve the existing sticky header and workout-specific controls.

3. Adjust the workout bottom action area
- Keep the fixed bottom save/finish bar, but ensure it sits at the true bottom of the viewport without being covered.
- Increase the page bottom spacer/padding so the last content row never sits under the action bar.

4. Keep finish-button logic simple and explicit
- Continue treating the last exercise in the ordered session as the finish state.
- Remove redundant conditions if needed so the button logic is easier to reason about and less likely to regress.

5. Correct supporting-lift initialization if still needed
- Ensure supporting exercise rep inputs start empty unless there is a saved log for the same program, week, cycle, type, and index.
- Keep autosave hydration only for the exact current exercise.

6. Verify the workout flow end to end
- Open a session, move through lifts, and confirm:
  - non-final exercises show “Save & next”
  - the final exercise shows “Finish workout”
  - the bottom action bar is fully visible on mobile-sized viewports
  - supporting lifts no longer start pre-filled unless previously saved
  - tapping Finish returns to the main page

Technical details
- Likely root cause: `TabBar` is fixed with higher stacking order than the workout action bar (`z-20` vs `z-10`), so the global nav overlays the workout footer.
- Expected file changes:
  - `src/components/AppShell.tsx`
  - `src/routes/workout.$type.$idx.tsx`
  - possibly minor spacing tweaks in `src/styles.css` only if needed
- No backend changes should be required for this fix.
