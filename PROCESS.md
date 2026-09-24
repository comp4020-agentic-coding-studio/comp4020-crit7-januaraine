# Process overview

## What I built

A Timetable Clash Resolver: a single-student tool for building a personal
weekly class timetable, where adding a session that overlaps an existing one
is flagged automatically and can be resolved by removing one side. `README.md`
carries the account of what the app is and what good looks like here; this
file is how I got there.

## How I got here

I agreed the MVP scope with the agent before writing any code: one core flow
(add a session → detect a clash → resolve it → reload and confirm it
persisted), one `sessions` table, no auth, no real ANU catalog integration —
written up as
[`3d33e4c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-januaraine/commit/3d33e4c).

> The MVP plan is approved. Start implementation incrementally. For this
> first implementation step, do ONLY: add the sessions schema, generate the
> migration, add the pure clash-detection function and its unit tests, run
> the tests and `pnpm check`, update PROCESS.md, commit. Do not implement the
> API, UI, guestbook removal, or deployment yet.

First increment: the `sessions` table (`day_of_week` + `start_minutes` /
`end_minutes` as integers, not time strings, so overlap is plain integer
comparison) and the pure `sessionsClash`/`findClashes` functions, with unit
tests covering same-day overlap, back-to-back non-clash, disjoint times,
different days, and full containment. Kept deliberately narrow — no API route
or UI touches this table yet — so each step lands green on its own rather than
landing one large, hard-to-review change.

I ran `pnpm check` after this step: the new schema, migration, and clash-rule
unit tests are green. `spec/crit-7.test.ts` is still the starter's own
placeholder — it's meant to start red until the create → clash → resolve →
reload flow actually exists, which is the next increment. That first
increment is [`6b11ace`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-januaraine/commit/6b11ace).

Second increment: the persistence layer for `sessions` in `src/lib/db.ts` —
`listSessions` (sorted by day then start time, so a caller can render a
weekly timetable straight off the list), `addSession`, `deleteSession` —
following the same shape as the starter's own `listMessages`/`addMessage`.
Still no API route or UI calls these yet, and `spec/crit-7.test.ts` is left
exactly as-is on purpose: it isn't weakened or removed to force a green
`pnpm check`, since the flow it checks genuinely doesn't exist yet. It gets
replaced with the real create → clash → resolve → reload test once the API
and UI land.

Second increment is
[`8beb13b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-januaraine/commit/8beb13b).

Third increment: the API — `POST /api/sessions` and
`POST /api/sessions/:id/delete` — following the starter's existing
`/api/messages` shape (a plain form POST, 303 redirect back to `/`, every
field re-validated server-side rather than trusted from the client). The
create route re-validates `course_code`, `activity`, `day_of_week` (0–6),
`start_minutes`/`end_minutes` (in range, and `end > start`), rejecting
anything invalid with a 400 rather than silently ignoring it. On success it
snapshots the existing sessions before inserting the new one, runs
`findClashes` against that snapshot, and carries every clashing session's id
back to the caller in the redirect's query string (`?added=<id>` and, if any,
`&clashesWith=<id,id,...>`) — the future UI reads that to render the clash
banner, without needing a second round trip.

Still no UI, and the guestbook/SSE plumbing is untouched. I added
`spec/sessions-api.test.ts` — the project's established pattern for this
(`guestbook.test.ts` drives the running built server over HTTP) — covering
validation rejections, clash reporting on create, and that delete actually
removes a session (proven by re-adding a session at the same time and
checking the deleted one no longer shows up as a clash) rather than just
redirecting. `spec/crit-7.test.ts` is still deliberately untouched and still
red: I did not weaken or remove it to force a green `pnpm check` — the real
create → clash → resolve → reload flow it checks needs the UI, which is the
next increment. `pnpm check` after this step: 42 passed, 1 failed (that same
placeholder), 0 typecheck errors. Third increment is
[`b86f551`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-januaraine/commit/b86f551).

Fourth increment: the UI on `/`. Both the guestbook's `<h1>Guestbook</h1>` and
the plan's own `<h1>My Timetable</h1>` can't coexist — `spec/invariants.test.ts`
requires exactly one `<h1>` per page — so I kept the guestbook exactly as it
was functionally (form, SSE script, message list all untouched) and demoted
its heading to `<h2>Guestbook</h2>`, letting the timetable take the page's one
`<h1>`. Everything else follows the same no-JS-friendly POST + 303 redirect +
re-render-from-SQLite pattern as the guestbook and the API increment: adding a
session, and removing one, are both plain `<form method="post">`s with no
script involved.

One genuine exception: the add-session form's start/end fields are native
`<input type="time">` pickers for usability, but `POST /api/sessions` expects
minutes-since-midnight integers (matching how they're stored and compared —
see `src/lib/schema.ts` and `src/lib/clashes.ts`), and I didn't want to change
that already-shipped API contract just to suit the form. A small inline script
converts the two time pickers into hidden `start_minutes`/`end_minutes` fields
right before submit. If JavaScript is disabled the hidden fields stay empty and
the server rejects the POST with its existing 400, rather than silently saving
a wrong value — so the failure mode without JS is a clear rejection, not
corrupted data. This is the one place I judged the existing architecture
(an already-fixed integer-minutes API, and a friendly time picker being much
better UX than typing raw minute counts) as genuinely requiring it, per the
brief for this increment.

The page reads `added` and `clashesWith` off `Astro.url.searchParams` (the
API's redirect carries them) and renders a `role="alert"` clash banner naming
both the just-added session and every session it overlaps, each with its own
"Remove this one" form. The persisted list below groups sessions by day and
sorts by start time within each day — `listSessions()` already returns that
order, so this is a plain filter, no re-sort. Every session in that list also
gets its own remove form, independent of whether it's currently flagged as a
clash.

`pnpm check` after this step: 0 typecheck errors, 42 passed / 1 failed (the
same `spec/crit-7.test.ts` placeholder, still untouched on purpose — it
becomes the real create → clash → resolve → reload test next, now that both
the API and UI exist). I drove the actual create → clash → remove flow over
HTTP against the dev server by hand (create a session, create an overlapping
one, confirm the banner names both sides, delete both, confirm the list empties
out again) since that's the flow no automated test yet covers. This project has
no Playwright/browser-automation tooling installed, so I did not produce actual
1920×1080 / 390×844 screenshots; I relied instead on the fact that every new
element reuses the exact same unstyled-width primitives (`form`, `input`,
`button`, `ul`/`li`) that the pre-existing guestbook form already renders
correctly at both sizes, plus the invariants suite passing against `/`. That's
weaker evidence than a real screenshot and I'm flagging it rather than
claiming a visual check I didn't do.

I'll keep extending this section, and citing the commits that carry each
step, as the build continues through the week.
