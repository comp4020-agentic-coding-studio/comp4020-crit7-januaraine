import { sql } from "drizzle-orm";
import { check, int, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.
// One row per weekly class session the student has added to their personal
// timetable. day_of_week is 0=Mon..6=Sun; start/end are minutes since
// midnight (e.g. 09:00 -> 540) so overlap comparison is plain integer
// arithmetic — see src/lib/clashes.ts.
export const sessions = sqliteTable("sessions", {
  id: int().primaryKey({ autoIncrement: true }),
  courseCode: text("course_code").notNull(),
  activity: text().notNull(),
  dayOfWeek: int("day_of_week").notNull(),
  startMinutes: int("start_minutes").notNull(),
  endMinutes: int("end_minutes").notNull(),
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
