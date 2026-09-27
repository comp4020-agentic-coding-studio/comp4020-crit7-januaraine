import { sql } from "drizzle-orm";
import { check, int, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.

// The ANU course catalogue this app draws sessions from — see
// src/lib/catalogue-seed.ts for what's actually seeded and docs/mvp-plan.md
// section (the course-catalogue revision) for which fields are real public
// ANU data (code/title/units) versus manually curated for this demo
// (session day/time/activity). Never written to by the app itself — only
// read from, to populate the "add a session" flow.
export const courses = sqliteTable("courses", {
  id: int().primaryKey({ autoIncrement: true }),
  code: text().notNull().unique(),
  title: text().notNull(),
  units: int().notNull(),
});

export type Course = typeof courses.$inferSelect;

// One row per (course, year, semester) offering. The demo seeds exactly one
// offering per course (2026 Semester 2, matching this crit's timeframe), but
// the shape leaves room for more without a migration.
export const courseOfferings = sqliteTable("course_offerings", {
  id: int().primaryKey({ autoIncrement: true }),
  courseId: int("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  year: int().notNull(),
  semester: int().notNull(),
});

export type CourseOffering = typeof courseOfferings.$inferSelect;

// The catalogue's own available sessions for an offering (e.g. "Monday
// 10:00-12:00 Lecture") — what a student picks from, instead of typing a
// day/time by hand. Deliberately the same {dayOfWeek, startMinutes,
// endMinutes} shape as `sessions` below, so src/lib/clashes.ts's
// sessionsClash()/findClashes() work on catalogue rows unchanged.
export const classSessions = sqliteTable("class_sessions", {
  id: int().primaryKey({ autoIncrement: true }),
  offeringId: int("offering_id")
    .notNull()
    .references(() => courseOfferings.id, { onDelete: "cascade" }),
  activity: text().notNull(),
  dayOfWeek: int("day_of_week").notNull(),
  startMinutes: int("start_minutes").notNull(),
  endMinutes: int("end_minutes").notNull(),
  location: text(),
});

export type ClassSession = typeof classSessions.$inferSelect;

// "My Courses": which offerings the student has selected, independent of
// whether they've picked any of that offering's sessions yet. The primary
// key IS the offering id (not a separate autoincrement id), matching
// clash_acknowledgements' own "existence is the fact" pattern below —
// selecting an already-selected course is then a harmless upsert, not a
// second row.
export const selectedOfferings = sqliteTable("selected_offerings", {
  offeringId: int("offering_id")
    .primaryKey()
    .references(() => courseOfferings.id, { onDelete: "cascade" }),
  selectedAt: text("selected_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type SelectedOffering = typeof selectedOfferings.$inferSelect;

// One row per weekly class session the student has added to their personal
// timetable. day_of_week is 0=Mon..6=Sun; start/end are minutes since
// midnight (e.g. 09:00 -> 540) so overlap comparison is plain integer
// arithmetic — see src/lib/clashes.ts. `class_session_id` records which
// catalogue offering this was picked from; nullable (`on delete set null`)
// so a session never becomes unreadable if the catalogue row it came from
// is ever removed — the denormalized course_code/activity/day/start/end
// fields are what render and clash-check, same as before this revision.
export const sessions = sqliteTable("sessions", {
  id: int().primaryKey({ autoIncrement: true }),
  courseCode: text("course_code").notNull(),
  activity: text().notNull(),
  dayOfWeek: int("day_of_week").notNull(),
  startMinutes: int("start_minutes").notNull(),
  endMinutes: int("end_minutes").notNull(),
  classSessionId: int("class_session_id").references(() => classSessions.id, { onDelete: "set null" }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Session = typeof sessions.$inferSelect;

// A student's decision to keep a specific overlapping pair, not a derived
// fact — whether the pair still clashes is always recomputed from `sessions`
// (src/lib/clashes.ts); this table only remembers "acknowledged", never
// "clashing". One row per pair, never per session — see docs/mvp-plan.md
// section D. `on delete cascade` only takes effect because
// `foreign_keys = ON` is set in src/lib/db.ts.
export const clashAcknowledgements = sqliteTable(
  "clash_acknowledgements",
  {
    sessionAId: int("session_a_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    sessionBId: int("session_b_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    acknowledgedAt: text("acknowledged_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.sessionAId, table.sessionBId] }),
    // Canonical ordering enforced by the database, not just app code — see
    // docs/mvp-plan.md section D for why this matters beyond a lint rule.
    check("session_pair_order", sql`${table.sessionAId} < ${table.sessionBId}`),
  ],
);

export type ClashAcknowledgement = typeof clashAcknowledgements.$inferSelect;
