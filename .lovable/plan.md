## What the button does today

The "+ Program" button in the top-right of the home screen (`src/routes/index.tsx`, line 83–88) is a link to `/program/new` with no `edit` param. It opens the program creation form to create a brand-new training program (either Wendler 5/3/1 or a Custom program). The neighboring "Edit program" button reuses the same route but passes `search={{ edit: activeProgram.id }}` to enter edit mode.

So yes — the button creates a new program. "New Program" is the more accurate label.

## Change

Rename the button label from `+ Program` to `New Program` in `src/routes/index.tsx` (line 87).

I'll keep the leading `+` glyph dropped since "New" already conveys creation, matching the clearer wording you suggested. If you'd prefer to keep a plus icon for visual affordance (e.g. `+ New Program` or a `Plus` lucide icon like the empty-state card uses), say the word and I'll include it.
