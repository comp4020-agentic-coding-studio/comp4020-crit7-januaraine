# Process overview

## What I built

I built a timetable clash flow that detects overlapping sessions, keeps the conflicting sessions persisted, and presents the conflict to the user so they can decide how to resolve it. The idea was to keep clash detection as server-side domain logic while allowing the UI to expose the result through the normal HTTP request and redirect flow.

## The moments that mattered
### Moment 1: Choosing minutes-since-midnight over time-string storage

1. **what happened**: 
   Before writing any session-storage code, I planned the `sessions` schema in `docs/mvp-plan.md`. The obvious choice for start/end time was to store them the way a form naturally produces them — as `"HH:MM"` strings, or as `Date` objects.

2. **what you did instead of the obvious thing**: 
   I stored `start_minutes`/`end_minutes` as plain integers (minutes since midnight, e.g. `09:00` → `540`) instead. String comparison of times is a well-known silent-bug trap (`"9:00"` vs `"09:00"`, or a stray AM/PM), and `Date` objects drag in timezone handling that a same-day-of-week recurring class doesn't need. With integers, "do these two sessions overlap" becomes exact interval arithmetic (`a.start < b.end && b.start < a.end`) with no ambiguity at the boundary.

3. **how you knew it was right**: 
   `src/lib/clashes.ts`'s pure `sessionsClash`/`findClashes` functions are unit-tested against same-day overlap, back-to-back non-clash (an 11:00-ending session and an 11:00-starting one on the same day must not clash), disjoint times, different days, and full containment — every one of those cases is a plain integer comparison with no string-parsing edge case to get wrong. All of this landed before any API route or UI touched the table, so the representation was settled first and never had to be migrated later.

4. **the citation**: 
   [`3d33e4c...6b11ace`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-Januaraine/compare/3d33e4c...6b11ace)


### Moment 2: Making clash detection reflect the whole timetable

1. **what happened**: 
   During manual testing, I found that the clash warning only showed the most recently created conflict. If several sessions were already overlapping, deleting one session could also make the warning disappear even when another conflict still existed. This revealed that the UI was treating a clash as a property of the latest request rather than a property of the current timetable.

2. **what you did instead of the obvious thing**: 
   Instead of extending the existing `added`/`clashesWith` redirect parameters or adding more state to the create-session request, I changed the design so that the current timetable is re-evaluated on every `GET /`. A new pure `findAllClashes()` function computes every unique conflicting pair from the persisted sessions, and the UI renders those current conflicts independently of which session was most recently added or deleted.

3. **how you knew it was right**: 
   I added regression tests for multiple overlapping sessions and drove the real create/delete flow over HTTP. The tests verify that all conflict pairs are shown, that deleting one session removes only the conflicts involving that session, and that unrelated conflicts remain visible. `pnpm check` finished with 0 typecheck errors and 50/50 tests passing.

4. **the citation**: 
   [`f6dc148`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-Januaraine/commit/f6dc148)


### Moment 3: Recognising that a conflict is not always an error

1. **what happened**: 
   While testing the clash warning, I realised that detecting a timetable conflict does not necessarily mean that the student wants to remove one of the sessions. For example, a tutorial may have no attendance or assessment requirement, so a student may knowingly accept an overlap and keep both sessions. The original MVP treated removal as the only resolution, so I revised the plan to distinguish between an actual timetable conflict and whether the student has acknowledged that conflict.

2. **what you did instead of the obvious thing**: 
   Instead of making "Keep both" a temporary UI-only dismissal, I revised the MVP plan and introduced a small persistent acknowledgement state for specific conflicting pairs. The underlying clash remains entirely derived from the session times; acknowledgement is stored separately as a user decision. The UI therefore has two meanings: unacknowledged conflicts appear in the top "Unresolved schedule conflicts" alert, while all sessions that are currently involved in a conflict continue to show a ⚠ indicator in the timetable. There is deliberately no separate "un-acknowledge" flow in this MVP.

3. **how you knew it was right**: 
   The implementation validates that both sessions exist and currently clash before allowing a pair to be acknowledged. Tests cover canonical pair ordering, duplicate acknowledgement, multiple independent conflicts, acknowledgement persistence, and foreign-key cascade deletion. I also manually verified the complete flow: two sessions clash, "Keep both" removes that pair from the unresolved alert while retaining the ⚠ indicators, a new unacknowledged conflict still appears, and deleting either acknowledged session removes the acknowledgement naturally. `pnpm check` finished with 0 typecheck errors and 64/64 tests passing.

4. **the citation**: 
   [`c027e88`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-Januaraine/commit/c027e88)


### Moment 4: Retiring manual entry for a small, honestly-labelled course catalogue

1. **what happened**: 
   With the clash/acknowledgement mechanism solid, the remaining gap wasn't a bug — it was that the whole product still read as "type arbitrary text into a form that happens to detect overlaps," not as a slice of ANU timetabling. `docs/mvp-plan.md`'s own non-goal list had ruled out a course catalogue when the priority was proving the mechanism cheaply; that tradeoff no longer held once the mechanism was proven.

2. **what you did instead of the obvious thing**: 
   The obvious move would have been to bolt a course picker on *next to* the existing free-text fields, keeping both paths working. Instead I retired manual entry outright: `POST /api/sessions` now takes a single `class_session_id` looked up against a small seeded catalogue (`src/lib/catalogue-seed.ts`) of real, public ANU course codes/titles/units, with manually curated (and clearly documented as such) session day/time/activity/location data — no scraper, per this deliverable's own non-goal list. `sessions` and `clash_acknowledgements` kept every existing column and function signature; the new `courses` / `course_offerings` / `class_sessions` / `selected_offerings` tables are purely additive, and `class_sessions` is shaped identically to the existing clash-interval fields so `src/lib/clashes.ts` needed zero changes. `index.astro`'s information hierarchy was reordered around this: timetable and conflict status first, the new weekly grid second, course browsing/selection last.

3. **how you knew it was right**: 
   Every HTTP-level spec file that used to generate unique free-text course codes per test now instead reserves specific, non-overlapping catalogue sessions (documented at the top of each file), since duplicate-adding a real catalogue session for a clash fixture produces textually identical rows — tests anchor on each session's own delete-form action id instead of on course-code text. A new `spec/db-catalogue.test.ts` proves `removeSelectedOffering` cascades through both a course's sessions and any acknowledgement referencing them, while leaving an unrelated selected course untouched. `pnpm check` finished with 0 typecheck errors and the full suite passing.

4. **the citation**: 
   [`b34ac05`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-januaraine/commit/b34ac05854f8b7cef35c10c57149a2feb94e42d2)