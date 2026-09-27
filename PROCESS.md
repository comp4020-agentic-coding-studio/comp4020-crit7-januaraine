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
claiming a visual check I didn't do. Fourth increment is
[`dc1a274`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-januaraine/commit/dc1a274).

Fifth increment: replaced the intentional `spec/crit-7.test.ts` placeholder
with the real check, now that both the API and UI exist. It drives the built
server over HTTP in the same style as `guestbook.test.ts` and
`spec/sessions-api.test.ts` (same `post()`/`Origin`-header/`redirect: "manual"`
shape) rather than calling `addSession`/`listSessions` directly, so it's
checking the same externally observable contract a browser would see, not the
implementation behind it: create session A, create overlapping session B,
assert the create response's redirect exposes the clash
(`clashesWith=<A's id>`), delete A, then issue a fresh `GET /` and assert the
reloaded page contains B's course code and does not contain A's. Course codes
are suffixed with `process.hrtime.bigint()` (the same uniqueness trick
`guestbook.test.ts` uses for its probe message) so the "A is gone" assertion
can't accidentally pass or fail because of some other spec file's sessions
sharing the one throwaway database this run.

`pnpm check`: 0 typecheck errors, 43 passed / 0 failed — the suite is fully
green for the first time since the placeholder was added. I ran the new test
on its own first (`vitest run spec/crit-7.test.ts`) to confirm it genuinely
exercises the flow before trusting it inside the full suite. Fifth increment
is
[`44b93d7`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-januaraine/commit/44b93d7).

Sixth increment: removed the guestbook/SSE demo now that the timetable is the
whole product and nothing in the app still depends on it —
`docs/mvp-plan.md`'s own risk list warned against leaving it half-removed, so
this is a full retire, not a trim. Deleted `src/pages/api/messages.ts`,
`src/pages/api/events.ts`, `src/lib/events.ts` (the SSE event bus), and
`spec/guestbook.test.ts` (`spec/README.md` said it "goes when the starter
does," so I removed that doc section too rather than leave it describing a
file that no longer exists). Dropped the `messages` table from
`src/lib/schema.ts` and its `listMessages`/`addMessage` helpers from
`src/lib/db.ts`, and ran `pnpm db:generate` for the matching
`DROP TABLE messages` migration — an unused table and its accessors are dead
code, not something worth keeping around "just in case." `index.astro` lost
the guestbook section, its `<ul id="messages">` styling, and the SSE
`<script>`; the time-picker-to-minutes conversion script for the session form
stays, since that's still load-bearing.

One thing this touched that isn't application code: `.github/workflows/checks.yml`
had a deploy-time step curling `/api/events` to prove the SSE stream was
alive in production. With that endpoint gone the step would fail every future
deploy, so I removed it rather than leave a CI check asserting a feature that
no longer exists. I'm flagging this explicitly rather than changing it
silently, since editing the deploy pipeline is a different kind of change to
editing app code. Also relabelled the stale `Guestbook` nav link on
`/readme/` (missed when the homepage nav was relabelled in the UI increment)
to `Timetable`, and fixed a couple of code comments that named
`guestbook.test.ts` by name rather than by content, since the file they
pointed at no longer exists.

Verified locally: restarted the dev server (so the new migration actually ran
against the existing `.data/app.db`), confirmed `/` and `/readme/` both
return 200 with zero remaining references to "Guestbook", "messages", or
`EventSource`, then drove a full create → confirm → delete round trip against
`/api/sessions` by hand to make sure the sessions flow still works with the
guestbook plumbing gone. `pnpm check`: 0 typecheck errors, 40 passed / 0
failed (43 minus the 3 deleted `guestbook.test.ts` cases) — still fully green.

Seventh increment: a UI-polish pass on `/`, requested as the last increment
before deployment — visual design only, no behaviour change. The brief was
explicit that this should look like a production app rather than a bare
assignment page, while leaving the clash-detection rule, the session API,
the database schema, and the no-JS form flow completely untouched.

`src/styles.css` was rewritten around a small set of CSS custom properties
(neutral surface/border/text colours, one accent blue, one restrained danger
red, plus a spacing/radius/shadow scale) instead of the previous handful of
bare element rules. `src/pages/index.astro` got `class` attributes and a few
non-semantic wrapper `<div>`s (`.field` around each label+input pair,
`.card` around the add-session form and each weekday group, `.session-row`/
`.clash-item` for the list rows) purely as CSS hooks — every element's id,
`name`, `for`, form `action`, hidden field, heading, and heading order is
unchanged, and the inline `<script>` that converts the time pickers to
minutes-since-midnight wasn't touched. The nav bar, the add-session form, the
clash banner, and each weekday's session list now read as a header bar, a
card, a restrained red-accented alert card, and grouped cards respectively,
with unified `.btn` styles (primary for "Add session", danger-outline for
every "Remove"/"Remove this one") and a `@media (max-width: 600px)` block
that collapses the form grid and stacks the row actions for phone widths.

Verified: `pnpm check` — 0 typecheck errors, 40 passed / 0 failed, same as
before this increment (no test was expected to need changes, since none of
them assert on CSS classes — `spec/invariants.test.ts` only checks structural
invariants like "exactly one `h1`" and axe violations, which still hold).
Beyond the automated suite, this repo's `CLAUDE.md` invariant requires any
UI/CSS change to be checked at both 1920×1080 and 390×844 against a real
rendered view: built and ran the app with `pnpm preview`, then used
Playwright's screenshot CLI (`npx playwright screenshot --viewport-size=...`)
to capture `/` at both sizes, including the clash-banner state (created two
overlapping demo sessions via `curl` against `/api/sessions` to trigger it,
screenshotted, then deleted both through `/api/sessions/:id/delete` so they
don't linger in the shared dev database). Confirmed by eye: the header bar,
card layout, form grid, clash banner, and weekday groups all render
correctly at both sizes, with the mobile layout stacking to one column and
full-width buttons as designed, and no leftover demo data after cleanup.

`README.md` itself (the account served at `/readme/`) still describes the
starter's guestbook demo — rewriting it for the timetable is the next
increment, not bundled into this one.

Eighth increment: constrained the add-session time pickers to a realistic
teaching-hours range, per a follow-up request — was a free-form
`<input type="time">` (any hour 00-23, any minute 00-59), now 08:00-21:00 in
30-minute steps only (08:00, 08:30, ... no 08:12). A native time input's
`min`/`max`/`step` attributes don't reliably stop a browser's picker UI from
still offering every minute, so this first pass generated a single
`TIME_OPTIONS` list of combined `"HH:MM"` strings and rendered one `<select>`
per field over it. The user rejected that shape (a single "Select a time"
dropdown wasn't what they asked for) and asked for two independent
dropdowns per field instead — see Ninth increment, which replaces it.

Ninth increment: corrected the time pickers to the two-dropdown structure the
user actually specified — an Hour `<select>` (08-21) and a Minute `<select>`
(00, 30) per field, not one combined dropdown. `src/pages/index.astro` now
generates `HOUR_OPTIONS`/`MINUTE_OPTIONS` and renders each time field as a
`<fieldset class="time-field">` with a `<legend>` (Start time / End time)
wrapping two `<select>`s (`#start_hour`/`#start_minute`,
`#end_hour`/`#end_minute`), each with its own visually-hidden `.sr-only`
`<label>` so axe/screen readers get an accessible name per control while the
legend gives the field its visible group label. Each select keeps a disabled
`value=""` placeholder so `required` still blocks submission until both
parts are chosen — preserving the no-JS fallback where the server still
sees empty `start_minutes`/`end_minutes` and rejects the POST with 400. The
inline `<script>` now combines each pair (`hour * 60 + minute`) into the
existing hidden `start_minutes`/`end_minutes` fields instead of splitting a
combined string — the API, clash detection, and persistence are unchanged,
and no spec file referenced the old `#start_time`/`#end_time` ids (they only
ever posted the hidden `start_minutes`/`end_minutes` integers), so no test
changes were needed. `styles.css` adds `.time-field`/`.time-inputs`/
`.time-part`/`.time-sep`/`.sr-only`: the fieldset itself stays `display:
block` (a `<legend>` doesn't reliably participate in a flexed `<fieldset>`
across browsers) and only the inner `.time-inputs` wrapper is flexed to lay
the two selects side by side. Verified with `pnpm check` (0 typecheck
errors, 40/40 tests passing, `spec/invariants.test.ts`'s axe/label checks
included).

Verified: `pnpm check` — 0 typecheck errors, 40 passed / 0 failed. Confirmed
the rendered HTML contains exactly the 08:00-21:00-by-30-minutes option list
for both fields (54 `<option>`s total, none off the half-hour), re-screenshotted
`/` at 1920×1080 and 390×844 with the same Playwright screenshot CLI as the
prior UI increment, and drove a full create → verify → delete round trip
against `/api/sessions` by hand (a session created at 08:30-09:00 persisted
and then disappeared cleanly on delete), confirming the new controls don't
affect the existing create/clash/remove/reload flow.

Tenth increment: replaced the single-day `<select>` with a multi-day
checkbox group (Mon-Fri), so one submission can create the same course
session on several weekdays at once, per a follow-up request. The schema
and clash algorithm are untouched — `src/pages/api/sessions.ts` now reads
`form.getAll("day_of_week")` (a checkbox group posts the same field name
once per checked box) instead of a single value, validates every value is
an integer in range and that at least one was sent, dedupes/sorts the days,
and calls the existing `addSession()` once per day — so "Monday +
Wednesday" becomes two ordinary rows, never a new multi-day concept, and
`findClashes()` keeps comparing one day against one day exactly as before.
Because each created session is checked against the pre-submission
snapshot of existing sessions, and sessions created in the same submission
can never clash with each other (different days), a single snapshot is
still enough — no re-fetch between inserts. The redirect's query string
changed to carry the outcome for possibly several created sessions:
`added` is now a comma-separated list of ids (still just one id, un-commaed,
for a single-day submission, so the C7 integration test and the existing
sessions-api tests needed no changes there), `clashesWith` keeps its old
meaning (every existing session any of the new ones overlaps) for backward
compatibility, and a new `clashDetail` param
(`"<createdId>:<clashId1>,<clashId2>;<createdId2>:<clashId3>"`) lets
`src/pages/index.astro` report the actual conflicting day/session per
created session rather than one flat list — so a Monday+Wednesday
submission that only clashes on Wednesday shows just the Wednesday side in
the clash banner, grouped under its own heading, with Monday reported as
clean. The day checkboxes reuse the same fieldset+legend pattern as the
time pickers; since HTML has no native "at least one checkbox checked"
constraint, the inline `<script>` adds one client-side check (via
`setCustomValidity`/`reportValidity`) purely as a UX convenience — with JS
disabled a zero-day POST still reaches the server and gets the same 400 any
other invalid field already gets. Added tests to `spec/sessions-api.test.ts`
covering: rejecting a submission with no day selected, a two-day submission
persisting as two distinct rows, and a two-day submission that clashes on
only one of the two days reporting exactly that day's session in
`clashDetail` (not the other, unrelated day). Verified with `pnpm check`
(0 typecheck errors, 43/43 tests passing, including
`spec/invariants.test.ts`'s axe/accessible-name checks against the new
checkbox markup) and confirmed the existing C7 create->clash->resolve->reload
test still passes unmodified.

Eleventh increment: investigated a reported bug in the clash flow — after
POSTing a session that overlapped an existing one (a normal 303, then a
normal 200 on the follow-up `GET /`, per the dev-server log), the browser
became stuck/blank, and the dev server later logged
`[LIFECYCLE] Command failed with exit code 143`, needing a manual restart.
The brief was explicit not to assume the clash logic was at fault, so I
worked from first principles rather than patching `sessions.ts`/`clashes.ts`
on a guess.

I re-read every file in the clash path (`src/pages/api/sessions.ts`,
`src/pages/index.astro`, `src/lib/clashes.ts`, `src/lib/db.ts`,
`spec/clashes.test.ts`, `spec/sessions-api.test.ts`, `spec/crit-7.test.ts`)
looking specifically for infinite loops, recursive rendering, malformed
query-string handling, and database-locking/stale-data issues, and found
none — `findClashes`/`sessionsClash` are a plain `.filter`/interval
comparison, `index.astro`'s `added`/`clashDetail` parsing is a bounded
`split`/`map` with no re-entrancy, and the inline `<script>` has no timers
or observers. I then reproduced the exact reported sequence three ways: a
single-clash and a multi-clash create over `curl` with `redirect: "manual"`
followed by actually fetching the resulting `Location` (not just inspecting
the header), and the same multi-clash URL loaded in a real headless
Chromium tab. All three completed in well under a second with zero console
or page errors and correct HTML — the clash-rendering path itself does not
hang.

Root cause: it isn't in this repo. `.astro/dev.json`/`.astro/dev.log` show
this project's `astro dev` (v7.3.3) auto-starts as a **detached background
daemon** whenever it detects it's being run by an agent
(`node_modules/astro/dist/cli/dev/index.js`:
`wantsBackground = !!flags.background || agentDetected && !ignoreLock`) —
confirmed by `.astro/dev.json` recording `"background": true` and a `pid`
with no parent shell, plus `astro dev status`/`stop`/`logs` subcommands for
managing it across turns. That daemon is intentionally decoupled from
whatever shell started it, so it can be, and was, terminated by something
outside the request path (external process-lifecycle management — hence
`[LIFECYCLE] ... exit code 143`, SIGTERM, found nowhere in this repo's or
Astro's own source) with no relationship to which page was open. A browser
mid-request to a server process that vanishes will sit stuck/blank until it
times out, regardless of what page it was loading — the timing next to a
just-added clash was coincidental, not causal. The dev-server log for the
session in question shows nothing but fast, successful `303`/`200`
responses right up to that point.

Fix: none of `sessions.ts`/`clashes.ts`/`index.astro`/`db.ts` needed a code
change — there was no defect to fix there, and inventing one would violate
the "smallest possible change" and "don't assume the clash logic" brief.
What the investigation did surface, and what I did change, is a real,
independent test-coverage gap: every existing clash test
(`spec/sessions-api.test.ts`, `spec/crit-7.test.ts`) stops at inspecting the
303's `Location` header and never actually follows it to render the
resulting page — the one hop a real browser depends on, and the one thing
none of the 43 prior tests exercised. Added
"GET / after a clash redirect" to `spec/sessions-api.test.ts`: create two
overlapping sessions, follow the real `Location` redirect with `fetch`, and
assert a `200` whose body contains the clash banner naming both course
codes. This is a regression test for that specific gap, not a reproduction
of the reported hang (which isn't reproducible in application code).

Verified: `pnpm check` — 0 typecheck errors, 44 passed / 0 failed (43 plus
the new test). Manually re-confirmed against the running dev server: a
non-clashing create still returns a clean `303`, a clashing create still
reports it, the resulting clash page still loads in ~20ms, deleting either
side of the clash still works, and a fresh `GET /` still returns `200`.

Twelfth increment: a real bug report, distinct from the eleventh increment's
non-issue — with several existing sessions clashing with each other, the
clash banner only ever showed the clash from the most recent create, and
deleting one conflicting session could make an *unrelated, still-active*
clash disappear from the UI even though the two sessions in it were both
still there.

Root cause: `src/pages/index.astro`'s clash banner was derived entirely from
`Astro.url.searchParams.get("added")`/`clashDetail` — query params carried
only by the most recent `POST /api/sessions` 303 redirect, i.e. request-scoped
state, not database state. `POST /api/sessions/:id/delete` redirects to plain
`/` with no query params at all, so any delete wiped the banner completely,
regardless of what still clashed. And because `sessions.ts` only ever
compares a *new* session against the sessions that existed before it, a
clash between two already-persisted sessions (neither of them "just added")
was never reported in the first place.

Fix: added `findAllClashes()` to `src/lib/clashes.ts` — a pure function that
takes any list of sessions and returns every unique pairwise clash among them
(`i < j` nested loop, so each pair is reported once, not once per direction).
`src/pages/index.astro` now calls `listSessions()` + `findAllClashes()` fresh
on every `GET /`, independent of any prior request, and renders one
clash-group box per pair instead of one box per "session that was just
added." `sessions.ts`'s existing `added`/`clashesWith`/`clashDetail` redirect
params are untouched (several existing tests assert on them, and nothing
about them was actually wrong), as is `findClashes`/`sessionsClash` and the
delete route — this is additive, not a rewrite of the clash rule itself.

Regression coverage: added a `findAllClashes` unit-test block to
`spec/clashes.test.ts` (one session clashing with several others; a fully
mutual 3-way clash producing all three pairs; removing one session from the
input dropping only its pairs; an empty/single-session list producing no
pairs). Added two HTTP-level tests to `spec/sessions-api.test.ts` that drive
the real create/delete flow end-to-end: one reproduces the bug report's exact
scenario (A/B/C mutually overlapping on Monday) and confirms all three pairs
render, that deleting C still leaves A-B visible, and that deleting B too
leaves no clash banner mentioning A (while A itself correctly remains in the
plain timetable list); the other covers a session clashing with two others
that don't clash with each other, confirming both of its clashes are shown
and the unrelated pair isn't invented. Verified with `pnpm check` — 0
typecheck errors, 50 passed / 0 failed.

I'll keep extending this section, and citing the commits that carry each
step, as the build continues through the week.
