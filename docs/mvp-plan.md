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

## A. Product definition

**Timetable Clash Resolver** — a single-student tool for building a
personal weekly class timetable by hand-adding sessions (course code,
activity type, day, start/end time), where the app automatically flags
overlapping sessions and lets the student resolve the clash by dropping one
side. Not a scrape of MyTimetable, not multi-student, not a scheduling
optimizer — a small, honest slice: the part of timetabling that actually
causes pain (accidentally double-booking yourself), solved end to end.

## B. MVP scope and non-goals

**In scope**

- Manually add a session: course code, activity label
  (Lecture/Tutorial/Lab/Seminar), day of week, start time, end time.
- List/view the current timetable, grouped by day, sorted by time.
- Detect a clash automatically the moment a new session is added.
- Resolve a clash by removing one of the two conflicting sessions (kept
  simple: no "merge" or "auto-reschedule").
- Delete any session outright.
- Persist to SQLite; reload the page and the timetable (post-resolution) is
  unchanged.

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
4. Student clicks "remove" on one of the two clashing sessions — it's
   deleted, banner clears.
5. Reload the page (or a fresh `GET /`) — the surviving session is present,
   the removed one is gone. This is the create → clash → resolve → reload →
   still-there chain `spec/crit-7.test.ts` asserts over HTTP.

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

No separate "clashes" table — clash status is *computed on read/write*, not
stored, since two sessions clashing is a derived fact, not new state.
Storing it would risk it going stale.

**Entities & relationships**: a single entity, `Session` (a scheduled
meeting of one course activity, recurring weekly). No foreign keys — every
session is independent, and "clash" is a computed relationship between two
`Session` rows sharing a `day_of_week` with overlapping
`[start_minutes, end_minutes)` ranges, not a stored edge.

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

## F. UI structure

Single page (`/`), no client-side JS required for the core flow (mirrors
the starter's no-JS-needed form pattern):

- `<nav>` — Timetable / About (matches existing invariant: nav landmark).
- `<h1>My Timetable</h1>` (exactly one, per invariants).
- **Add session form**: course code text input, activity `<select>`, day
  `<select>`, start `<input type="time">`, end `<input type="time">`.
- **Clash banner** (rendered only when the just-added session clashes):
  "COMP4020 Lecture (Mon 09:00–10:00) clashes with COMP1100 Tutorial
  (Mon 09:30–10:30)" with a "Remove this" button per side.
- **Timetable list**: grouped by day (Mon–Fri headings), sessions sorted by
  start time within each day, each with a "Remove" button.

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

**`spec/crit-7.test.ts`** (replaces the red stub) — drives the running app
over HTTP, `guestbook.test.ts`-style:

1. POST a session A.
2. POST a clashing session B (same day/overlapping time) → response
   indicates a clash (e.g. clash info in the redirect target's rendered
   page, or a JSON field if the endpoint returns one).
3. POST "remove session A" (resolving the clash).
4. `GET /` — assert session B is present, session A's course code is
   absent. This is the mechanical proof of spec line 3.

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
