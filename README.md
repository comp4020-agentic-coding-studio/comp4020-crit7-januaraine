# Your prototype

## What this is

The Timetable Clash Resolver is a single-student timetable tool for building and checking a personal weekly timetable. A student can manually add one or more sessions, see them grouped by weekday, and immediately identify overlapping sessions. When a clash occurs, the student can either remove one of the sessions or acknowledge the specific conflict and keep both. The timetable and acknowledgement decisions persist across reloads, so the prototype models the core experience of managing a timetable rather than just demonstrating clash detection.

## What good looks like here

For this prototype, “good” means that the timetable is useful, predictable, and honest about its state. A student should be able to add sessions, reload the page without losing them, see every current clash, and make an explicit decision about each conflict. The system should never hide a real clash simply because another session was added or because the user previously acknowledged it.

I decided that a clash should be defined by two sessions occurring on the same weekday with overlapping half-open time intervals. Back-to-back sessions therefore do not clash. I also decided that conflict detection should always be derived from the persisted timetable rather than stored as a separate piece of state. This keeps the conflict information consistent with the sessions that actually exist.

I looked at the conventions of timetable-style interfaces and the existing ANU context to make the prototype feel like a believable university scheduling tool, while deliberately keeping the scope small enough to demonstrate one complete user flow. This led to a manual session-entry interface, weekday selection, constrained 30-minute time slots, grouped timetable display, clash indicators, and explicit conflict acknowledgement.

The prototype deliberately does **not** attempt to reproduce the full ANU timetabling system. It does not include an ANU course catalogue, authentication, automatic timetable import, enrolment data, drag-and-drop scheduling, notifications, multi-user collaboration, or an automatic conflict resolver. These would add substantial product and integration complexity without strengthening the core C7 slice.

Some parts of “good” are enforced automatically. The clash rule is covered by unit tests; persistence and API behaviour are covered by API and database tests; and the Crit 7 user journey is covered by an HTTP-level integration test. The tests also protect important invariants such as multiple simultaneous clashes, acknowledgement of only currently conflicting pairs, persistence across reloads, and cascade removal of acknowledgements when a session is deleted.

Other parts remain judgement calls. The visual design, the decision to use manual entry rather than an ANU catalogue, the 08:00–21:00 half-hour time range, and the choice to show an acknowledged conflict with `⚠` while removing it from the unresolved-conflict alert are product decisions rather than properties that can be completely captured by automated tests.

The rules behind these decisions live in `CLAUDE.md`, while the executable checks that protect the important behaviour live in `spec/`. Together, they turn the prototype's definition of “good” into both documented design constraints and testable behaviour.