# Timetable Clash Resolver — MVP Plan

Crit 7 ("Build the ANU system you wish existed"), due 2026-09-28T12:00
Canberra. This is the agreed plan, written before any implementation code —
see `spec/README.md` for how the fixed spec below turns into tests.

## Spec recap (fixed contract, from the course site)

1. The app loads at its `*.fly.dev` URL by the cutoff.
2. It models a slice of a real ANU system you actually deal with, wired end
   to end.
3. The core flow persists across a reload — create something, and it's
   still there.
4. The repo shows the process — commits that grew with the work, a process
   overview in `PROCESS.md`, and the week's reflection in
   `reflections/crit-7.md`.
5. You can account for how you directed, grounded and corrected the work.

## Revision — 2026-09-27: acknowledged conflicts

Manual testing surfaced a real product gap: not every clash is a mistake.
A student who double-books an assessed lecture against an ungraded,
unattended tutorial hasn't made an error — they've made a call, and the
app should let them record it without forcing a deletion. This revision
adds that: acknowledging a specific clashing pair ("Keep both"), so it
stops nagging in the top alert but stays visibly flagged, since the
overlap is still real. It's a plan update only — see section D for the new
persistence model, section H for the (not-yet-done) implementation steps.

## A. Product definition

**Timetable Clash Resolver** — a single-student tool for building a
personal weekly class timetable by hand-adding sessions (course code,
activity type, day, start/end time), where the app automatically flags
overlapping sessions and lets the student resolve the clash — either by
dropping one side, or by acknowledging the pair and keeping both, when the
overlap is one they've decided is acceptable (e.g. skipping an ungraded,
unassessed tutorial in favour of something that clashes with it). Not a
scrape of MyTimetable, not multi-student, not a scheduling optimizer — a
small, honest slice: the part of timetabling that actually causes pain
(accidentally double-booking yourself), solved end to end.

## B. MVP scope and non-goals

**In scope**

- Manually add a session: course code, activity label
  (Lecture/Tutorial/Lab/Seminar), day of week, start time, end time.
- List/view the current timetable, grouped by day, sorted by time.
- Detect a clash automatically the moment a new session is added.
- Resolve a clash one of two ways: remove one of the two conflicting
  sessions, or acknowledge the specific pair and keep both (kept simple: no
  "merge" or "auto-reschedule," and no automatic choice between the two
  resolution paths — the student picks).
- Acknowledge a specific clashing pair ("Keep both"): the pair stops
  appearing in the top unresolved-clash alert, but both sessions stay in
  the timetable and both keep showing a ⚠ indicator, since they are still,
  factually, overlapping.
- Delete any session outright.
- Persist to SQLite; reload the page and the timetable (post-resolution),
  along with any acknowledged clashes, is unchanged.

**Explicit non-goals**

- No login/auth, no multiple users/timetables — one shared timetable is the
  "slice."
- No real ANU course catalog / MyTimetable scraping or import.
- No semester date ranges, teaching-break weeks, or public-holiday
  exceptions.
- No drag-and-drop grid editing, no editing a session in place (delete +
  re-add instead).
- No notifications, no ICS/CSV export.
- No automatic "best fit" resolution algorithm — the student picks.
- No real-time multi-tab sync (the SSE bus from the starter is not needed
  here and should go).
- No "un-acknowledge" control and no editable acknowledgement history —
  once a pair is acknowledged, the only way back to "unresolved" is
  deleting one of the two sessions, which removes the clash itself, not
  just the acknowledgement.

## C. Core user flow

The one the spec's persistence line checks:

1. Open `/` — see the current timetable (empty on first run).
2. Submit "add session" form (course code, activity, day, start, end).
3. Server validates and checks the new session's day + time against all
   existing sessions.
   - No clash — session is saved, page re-renders with it in place.
   - Clash — session is still saved (so nothing is silently dropped), and
     the page renders a **clash banner** naming the two conflicting
     sessions with a "remove this one" action for each.
4. Student resolves the clash one of two ways:
   - Clicks "remove" on one of the two clashing sessions — it's deleted,
     the banner clears (nothing to acknowledge, since one side is gone).
   - Clicks "Keep both" on the clash banner — the pair is recorded as
     acknowledged; both sessions remain, and the banner clears for *that
     pair*, but each still shows a ⚠ indicator in the timetable list,
     because they are still, factually, overlapping.
5. Reload the page (or a fresh `GET /`):
   - After "remove": the surviving session is present, the removed one is
     gone. This is the create → clash → resolve → reload → still-there
     chain `spec/crit-7.test.ts` asserts over HTTP.
   - After "Keep both": both sessions are still present, both still show
     ⚠, and the top alert stays quiet for that pair — the acknowledgement
     persists across reload, exactly like the sessions themselves.
6. If a new session is later added that clashes with either side of an
   already-acknowledged pair, that *new* pair is unacknowledged and shows
   up in the top alert normally — acknowledging (A, B) says nothing about
   (A, C) or (B, C).
7. If either side of an acknowledged pair is deleted, the acknowledgement
   goes with it — there's no longer a pair for it to describe. This falls
   out of the persistence model in section D, not extra application logic.

## D. Database schema proposal

One table is enough:

```
sessions
  id            integer primary key autoincrement
  course_code   text not null        -- e.g. "COMP4020"
  activity      text not null        -- "Lecture" | "Tutorial" | "Lab" | "Seminar"
  day_of_week   integer not null     -- 0=Mon .. 4=Fri (or 6 if weekend sessions matter)
  start_minutes integer not null     -- minutes since midnight, e.g. 09:00 -> 540
  end_minutes   integer not null
  created_at    text not null default (datetime('now'))
```

**Why minutes-since-midnight, not `"HH:MM"` text or Date objects:** interval
comparison (`startA < endB && startB < endA`) is correct and trivial on
integers; string comparison of times is a classic silent-bug trap, and Date
objects drag in timezone handling we don't need for a same-day-of-week
recurring class.

**Clash status is still computed, never stored** — whether two sessions
overlap is a pure function of their `day_of_week`/`start_minutes`/
`end_minutes` (`src/lib/clashes.ts`), recomputed on every read. That
decision doesn't change. What changed, after manual testing surfaced a real
product need: a student's *decision* to accept a specific overlap ("Keep
both") is not a derived fact — it's a choice made at a point in time, about
a specific pair of sessions. That has to survive a reload, so — unlike the
clash itself — it needs its own row, in its own table, separate from the
computed relationship:

```
clash_acknowledgements
  session_a_id    integer not null references sessions(id) on delete cascade
  session_b_id    integer not null references sessions(id) on delete cascade
  acknowledged_at text    not null default (datetime('now'))
  primary key (session_a_id, session_b_id)
  check (session_a_id < session_b_id)
```

- **One row per acknowledged pair**, not per session — acknowledging
  (A, B) says nothing about A or B's other clashes. "Keep both" is an
  action on a *pair*: its input is two session ids, not one, and it has no
  meaning applied to a single session.
- **Canonical ordering, enforced by the schema, not just app code**: the
  `check (session_a_id < session_b_id)` constraint means the database
  itself rejects a row stored the "wrong" way round — the app can't
  accidentally create a duplicate row for the same pair under a different
  ordering, even if a future code path forgets to sort before inserting.
  Combined with the `(session_a_id, session_b_id)` primary key, this is
  what guarantees the same pair always maps to the same row, and a
  duplicate "Keep both" click is a harmless upsert, not a second row.
- **`on delete cascade`**: deleting either session removes the
  acknowledgement automatically. No code path has to remember to clean it
  up, and no acknowledgement can outlive the sessions it refers to — this
  is what makes "an acknowledged pair that stops clashing becomes
  irrelevant" (section C, point 7) fall out of the schema instead of
  needing extra logic. **This only works if SQLite's foreign-key
  enforcement is actually on** — it's off by default per connection, and
  `src/lib/db.ts` currently only sets `journal_mode = WAL`, not
  `foreign_keys = ON`. Implementation must add
  `client.pragma("foreign_keys = ON")` alongside the existing pragma, and
  a test must prove the cascade actually fires (section G/H) — a `on
  delete cascade` clause that silently no-ops because the pragma was never
  set would be worse than not writing it, since it reads as a guarantee
  that isn't there.
- **No status/soft-delete column, no "unacknowledge"**: the row's
  existence *is* "acknowledged"; its absence *is* "not acknowledged" —
  matching the new non-goal in section B.
- **The read side is still a pure intersection**: "unacknowledged clashes"
  = `findAllClashes(listSessions())`, filtered to pairs whose canonical
  `(session_a_id, session_b_id)` is *not* in `clash_acknowledgements`. Even
  in a hypothetical where an acknowledgement row outlived its sessions (it
  can't, given the cascade — this is the belt-and-braces reason it would
  be harmless if it somehow did), it would just never match a
  currently-computed pair and sit inert.

**Entities & relationships**: two entities now. `Session` is unchanged —
still no foreign keys, "clash" between two `Session` rows is still a
computed relationship, not a stored edge. `ClashAcknowledgement` is new: a
join-like record over two `Session` ids that exists purely to remember a
user decision. It's the one place a relationship between sessions *is*
stored — deliberately, and only because it encodes a choice, not a fact
derivable from the sessions alone.

## E. Clash-detection rules

- Two sessions clash **iff** `day_of_week` is equal **and** their time
  intervals overlap.
- Overlap test (half-open intervals, so back-to-back classes don't clash):
  `a.start < b.end && b.start < a.end`.
- Boundary rule: a session ending at 11:00 and one starting at 11:00 on the
  same day do **not** clash.
- `end_minutes` must be strictly greater than `start_minutes` — reject
  (400) at the API boundary, not just in the UI.
- Clash detection runs against **all** existing sessions, not just the most
  recent — a new session can clash with more than one existing session;
  the banner should be able to list more than one conflict.
- Validation (day range, time range, required fields) happens server-side
  in the API handler — never trust the client, since a bare `fetch`/curl
  can hit the same endpoint the form does (mirrors the existing guestbook
  handler's own-origin check).
- Acknowledgement is layered on top of this, never inside it:
  `sessionsClash`/`findClashes`/`findAllClashes` stay exactly as they are
  and know nothing about acknowledgement — whether a pair is acknowledged
  never changes whether it clashes.
- The **top alert** shows a computed pair only when its canonical
  `(session_a_id, session_b_id)` is absent from `clash_acknowledgements`.
- The **per-session ⚠ indicator** ignores acknowledgement entirely: it's
  shown for any session appearing in *any* pair `findAllClashes` returns,
  acknowledged or not.
- **Acknowledging is not a free-form write.** `POST /api/clashes/acknowledge`
  must reject (400) any pair that isn't, at the moment of the request,
  both (a) two ids that exist in `sessions`, and (b) currently clashing per
  `sessionsClash(a, b)`. The endpoint takes two session ids — the pair —
  never a single session id; there is no such thing as "acknowledging"
  one session on its own. This closes off arbitrary/stale acknowledgements
  (e.g. a resubmitted form after one side was already deleted, or a
  crafted request for two sessions that never clashed) the same way
  session creation already validates server-side rather than trusting the
  client.

## F. UI structure

Single page (`/`), no client-side JS required for the core flow (mirrors
the starter's no-JS-needed form pattern):

- `<nav>` — Timetable / About (matches existing invariant: nav landmark).
- `<h1>My Timetable</h1>` (exactly one, per invariants).
- **Add session form**: course code text input, activity `<select>`, day
  `<select>`, start `<input type="time">`, end `<input type="time">`.
- **Clash banner**, one box per *unacknowledged* clashing pair, computed
  from the full persisted list on every `GET /` (not just the just-added
  session): "COMP4020 Lecture (Mon 09:00–10:00) clashes with COMP1100
  Tutorial (Mon 09:30–10:30)" with a "Remove this" button per side, plus a
  "Keep both" button that acknowledges the pair and drops it from this
  list on the next render. **Heading changes from "Clash detected" to
  "Unresolved schedule conflicts"** — acknowledging a pair doesn't make the
  conflict stop existing, only stop being *unresolved*, and the heading
  should say that rather than imply acknowledged pairs have gone away.
- **Timetable list**: grouped by day (Mon–Fri headings), sessions sorted by
  start time within each day, each with a "Remove" button and a ⚠
  indicator when it appears in any currently-clashing pair — acknowledged
  or not. The indicator's presence is the UI's honest signal that the
  underlying overlap is still true; only the top banner's membership
  changes with acknowledgement, never the ⚠.

`/readme/` stays as-is (renders `README.md`). `spec/routes.ts` doesn't need
a new route unless we add one — everything lives on `/`.

## G. Test plan

**Unit tests** (pure function, no server) for the clash rule itself — the
highest-value, cheapest tests:

- same day, overlapping → clash
- same day, back-to-back (end == start) → no clash
- same day, disjoint → no clash
- different day, identical times → no clash
- identical session twice → clash
- invalid interval (end ≤ start) → rejected

**Acknowledgement unit tests (new)**, pure, layered on top of the existing
clash rule:

- acknowledging (A, B) removes that pair from "unacknowledged clashes,"
  regardless of whether the caller passes them as (A, B) or (B, A) —
  canonical ordering makes the two calls equivalent.
- acknowledging (A, B) does not remove (A, C) or (B, C) from
  "unacknowledged clashes" when those also clash.
- acknowledging a pair does not change `findAllClashes`'s output — the raw
  computed clash list stays acknowledgement-agnostic.
- a duplicate "acknowledge (A, B)" is a no-op, not a second row or error.
- acknowledging two sessions that do **not** currently clash is rejected —
  the acknowledge path must call `sessionsClash` itself, not trust the
  caller's claim that a pair conflicts.
- acknowledging a pair naming a session id that doesn't exist is rejected.
- **deleting either session in an acknowledged pair removes the
  `clash_acknowledgements` row** (proves the `on delete cascade` +
  `foreign_keys = ON` pragma actually take effect, not just that the
  schema declares them) — this needs its own test, since a cascade clause
  with FK enforcement left off would pass every other test here while
  silently leaking orphaned rows.

**`spec/crit-7.test.ts`** (replaces the red stub) — drives the running app
over HTTP, `guestbook.test.ts`-style:

1. POST a session A.
2. POST a clashing session B (same day/overlapping time) → response
   indicates a clash (e.g. clash info in the redirect target's rendered
   page, or a JSON field if the endpoint returns one).
3. POST "remove session A" (resolving the clash).
4. `GET /` — assert session B is present, session A's course code is
   absent. This is the mechanical proof of spec line 3.

**Acknowledgement HTTP acceptance criteria (new)**, exercised the same way
— over HTTP, against the running app:

1. POST session A, then a clashing session B → `GET /` shows the pair in
   the top alert and ⚠ on both.
2. POST "acknowledge (A, B)" → `GET /` shows both sessions still present,
   ⚠ still on both, but the pair no longer in the top alert.
3. POST a third session C that clashes with B (not A) → `GET /` shows
   (B, C) in the top alert; (A, B) still doesn't appear there.
4. POST "remove session A" → `GET /` shows B and C, B still ⚠'d against C,
   and no trace of the (A, B) acknowledgement (there's nothing left for it
   to refer to).
5. Reload (`GET /`) at every step above — every one of these states must
   survive a reload, the same guarantee spec line 3 already requires of
   plain session persistence.

**Keep**: `invariants.test.ts`, `readme.test.ts` unchanged (they hold
regardless of domain).

**Retire**: `guestbook.test.ts` and the `messages`/`events` (SSE) code it
exercises, once the timetable replaces the guestbook — per
`spec/README.md`, it "goes when the starter does."

### Mechanically verifiable vs. human judgement

Spec line by line:

- ✅ Mechanical: "loads at `*.fly.dev`" (deploy + smoke fetch), "core flow
  persists across reload" (the test above), a11y/landmark floor (existing
  `invariants.test.ts`), README served in full (existing `readme.test.ts`).
- 🧑‍⚖️ Judgement only, for the crit: "models a slice of a real ANU
  system... wired end to end" (is this actually a believable slice of ANU
  timetabling, or a toy CRUD form?), "repo shows the process" (commit
  quality, not just existence), "you can account for how you
  directed/grounded/corrected the work" (only demonstrable live, not
  testable).

## H. Implementation order

1. Schema: add `sessions` table to `src/lib/schema.ts`, `pnpm db:generate`,
   commit the migration.
2. Pure clash-detection function (`src/lib/clashes.ts` or similar) + its
   unit tests — no server involved, fastest feedback loop.
3. DB helpers in `src/lib/db.ts`: `listSessions`, `addSession`,
   `deleteSession`.
4. API routes: `POST /api/sessions` (create, returns clash info),
   `POST /api/sessions/:id/delete` (no-JS-friendly, mirrors the existing
   messages pattern).
5. Remove the guestbook remnants (`messages` table usage, SSE bus,
   `/api/events`, `/api/messages`) once the new flow supersedes them — keep
   the repo free of dead demo code.
6. `index.astro`: form + grouped list + clash banner.
7. Rewrite `spec/crit-7.test.ts` to the real create → clash → resolve →
   reload test; confirm `spec/routes.ts` still matches actual routes.
8. `README.md`, `PROCESS.md`, `reflections/crit-7.md`.
9. `pnpm check` green at every step (never commit red); dual-viewport check
   (1920×1080 and 390×844) once the UI exists.
10. `flyctl deploy` and verify the live `*.fly.dev` URL before the cutoff.

Steps 1–10 above are done. The rest is the acknowledgement feature — **not
implemented yet**, planned here for review before any code changes:

11. Schema: add `clash_acknowledgements` to `src/lib/schema.ts`, including
    the `check (session_a_id < session_b_id)` constraint (section D),
    `pnpm db:generate`, commit the migration.
12. `src/lib/db.ts`: add `client.pragma("foreign_keys = ON")` alongside the
    existing `journal_mode = WAL` — required for `on delete cascade` to
    actually fire; without it the schema's cascade clause is a no-op.
13. DB helpers in `src/lib/db.ts`: `acknowledgeClash(sessionAId,
    sessionBId)` (canonicalizes ordering, upserts) and a way for the render
    path to check/filter against currently-acknowledged pairs.
14. API route: `POST /api/clashes/acknowledge` (no-JS-friendly redirect,
    mirrors the existing `sessions/:id/delete` pattern), taking the two
    session ids from the clash banner's own form. Validates server-side,
    per section E, that both ids exist and currently satisfy
    `sessionsClash` before writing the acknowledgement — reject (400)
    otherwise.
15. `index.astro`: add the "Keep both" button to the clash banner, rename
    its heading to "Unresolved schedule conflicts", filter the top-alert
    pairs against acknowledged pairs, add the ⚠ indicator to the timetable
    list (independent of acknowledgement).
16. Unit tests for the acknowledgement helpers, plus the HTTP acceptance
    criteria from section G — including the invalid-pair-rejection test
    and the cascade-delete test — (extend `spec/crit-7.test.ts` or add a
    dedicated `spec/acknowledgements.test.ts`).
17. `pnpm check` green; dual-viewport check on the updated banner/list.
18. `flyctl deploy` once the above is green — not before.

## I. Risks / scope traps

- **Time-string bugs**: comparing `"09:00"` vs `"9:00"` or AM/PM strings
  lexically silently breaks clash detection — mitigated by storing
  `start_minutes`/`end_minutes` as integers from the start.
- **Scope creep into a real grid/drag-and-drop UI** — a grouped-by-day list
  is enough to demonstrate the core flow; resist building a pixel-perfect
  weekly grid this week.
- **Scope creep into "smart" clash resolution** (auto-suggest alternate
  times) — MVP resolution is manual removal only; an optimizer is a
  different, much bigger project.
- **Leaving SSE/guestbook code half-removed** — either fully retire it or
  don't touch it; a half-migrated repo reads as unfinished process, which
  the crit judges on.
- **Trusting client-side time math** — validate `end > start` and field
  presence server-side, since the API is a public boundary.
- **Forgetting the dual-viewport + a11y checks** once the form/list UI
  exists — `invariants.test.ts` already enforces landmarks/heading/alt
  text/axe, but the 1920×1080 / 390×844 visual check is manual and easy to
  skip.
- **Conflating "wired end to end" with "looks impressive"** — the spec
  rewards a small honest slice with real persistence over a large
  half-working one.
- **Un-acknowledge creep** — resist adding an explicit "undo acknowledge"
  control. Per the non-goal in section B, deletion is the only supported
  way back to "unresolved," and it removes the clash itself, not just the
  acknowledgement.
- **Ordering bugs in the acknowledgement key** — `findAllClashes` orders a
  pair by each session's position in the day/start-sorted list, not by id.
  If the acknowledge/lookup path ever skips canonicalizing by
  `(min(id), max(id))`, the same pair could get stored and looked up under
  two different keys, and the banner would reappear after being "kept."
- **Treating acknowledgement as a second clash-detection mechanism** — it
  isn't. `clash_acknowledgements` never decides whether two sessions
  overlap; it only decides whether an already-computed overlap shows in
  the top alert. Keep `src/lib/clashes.ts` untouched by this feature.
