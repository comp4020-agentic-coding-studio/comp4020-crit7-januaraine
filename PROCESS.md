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

I'll keep extending this section, and citing the commits that carry each
step, as the build continues through the week.
