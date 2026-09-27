import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { canonicalPair } from "./acknowledgements";
import { CATALOGUE, CATALOGUE_SEMESTER, CATALOGUE_YEAR } from "./catalogue-seed";
import {
  type ClashAcknowledgement,
  type ClassSession,
  type Course,
  type CourseOffering,
  type Session,
  classSessions,
  clashAcknowledgements,
  courseOfferings,
  courses,
  selectedOfferings,
  sessions,
} from "./schema";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
// Off by default per SQLite connection — without this, the schema's
// `on delete cascade` on clash_acknowledgements would silently no-op. See
// docs/mvp-plan.md section D.
client.pragma("foreign_keys = ON");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — the
// recommended shape for SQLite on Fly, where there's no separate machine to
// run them from. The flow: edit src/lib/schema.ts, `pnpm db:generate`,
// commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

// Populates the course catalogue on first boot only (insert-if-empty), so a
// fresh database — locally or on the Fly volume — gets the seeded ANU
// courses/offerings/sessions the same way it already gets migrations,
// without a separate manual step. See src/lib/catalogue-seed.ts for what's
// seeded and why it's a small curated set rather than scraped data.
function seedCatalogue(): void {
  const alreadySeeded = db.select().from(courses).limit(1).all().length > 0;
  if (alreadySeeded) return;

  db.transaction((tx) => {
    for (const course of CATALOGUE) {
      const insertedCourse = tx
        .insert(courses)
        .values({ code: course.code, title: course.title, units: course.units })
        .returning()
        .get();
      const offering = tx
        .insert(courseOfferings)
        .values({ courseId: insertedCourse.id, year: CATALOGUE_YEAR, semester: CATALOGUE_SEMESTER })
        .returning()
        .get();
      for (const session of course.sessions) {
        tx.insert(classSessions)
          .values({
            offeringId: offering.id,
            activity: session.activity,
            dayOfWeek: session.dayOfWeek,
            startMinutes: session.startMinutes,
            endMinutes: session.endMinutes,
            location: session.location,
          })
          .run();
      }
    }
  });
}

seedCatalogue();

export type { Session, Course, CourseOffering, ClassSession };

export interface NewSession {
  courseCode: string;
  activity: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  // Which catalogue session this was added from, if any — see the
  // `class_session_id` column comment in src/lib/schema.ts.
  classSessionId?: number | null;
}

// Sorted by day then start time so callers can render a weekly timetable
// straight off this list without re-sorting.
export function listSessions(): Session[] {
  return db
    .select()
    .from(sessions)
    .orderBy(asc(sessions.dayOfWeek), asc(sessions.startMinutes))
    .all();
}

export function addSession(input: NewSession): Session {
  return db.insert(sessions).values(input).returning().get();
}

export function deleteSession(id: number): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
}

export function getSessionById(id: number): Session | undefined {
  return db.select().from(sessions).where(eq(sessions.id, id)).get();
}

export type { ClashAcknowledgement };

// Canonicalizes ordering before writing, so (A, B) and (B, A) always land on
// the same row — a repeat "Keep both" click is then a harmless upsert, not a
// second row or an error (the schema's own CHECK constraint would reject a
// non-canonical row anyway; canonicalizing here means that constraint is
// never actually exercised in normal use).
export function acknowledgeClash(sessionAId: number, sessionBId: number): void {
  const [a, b] = canonicalPair(sessionAId, sessionBId);
  db.insert(clashAcknowledgements).values({ sessionAId: a, sessionBId: b }).onConflictDoNothing().run();
}

export function listAcknowledgedPairs(): ClashAcknowledgement[] {
  return db.select().from(clashAcknowledgements).all();
}

export interface CourseWithOffering {
  offeringId: number;
  courseId: number;
  code: string;
  title: string;
  units: number;
  year: number;
  semester: number;
}

// Sorted by code — the catalogue is small enough (a handful of seeded
// courses) that listing/searching it in-memory is simpler and just as fast
// as a SQL LIKE query, and avoids building query-string escaping for it.
export function listCourses(): CourseWithOffering[] {
  return db
    .select({
      offeringId: courseOfferings.id,
      courseId: courses.id,
      code: courses.code,
      title: courses.title,
      units: courses.units,
      year: courseOfferings.year,
      semester: courseOfferings.semester,
    })
    .from(courseOfferings)
    .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
    .orderBy(asc(courses.code))
    .all();
}

export function searchCourses(query: string): CourseWithOffering[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return listCourses();
  return listCourses().filter(
    (course) => course.code.toLowerCase().includes(needle) || course.title.toLowerCase().includes(needle),
  );
}

export function listSelectedOfferings(): CourseWithOffering[] {
  const selectedIds = new Set(
    db
      .select({ offeringId: selectedOfferings.offeringId })
      .from(selectedOfferings)
      .all()
      .map((row) => row.offeringId),
  );
  return listCourses().filter((course) => selectedIds.has(course.offeringId));
}

// A no-op if the offering is already selected — matches acknowledgeClash's
// own "existence is the fact" idempotency.
export function selectOffering(offeringId: number): void {
  db.insert(selectedOfferings).values({ offeringId }).onConflictDoNothing().run();
}

// Removing a course also removes any of its sessions already added to the
// student's timetable — the catalogue's own class_sessions rows are never
// deleted (course_offerings/class_sessions are static reference data), but a
// session copied from them into `sessions` has no reason to survive its
// course being removed. Any acknowledgement referencing those sessions is
// then cleaned up automatically by the existing FK cascade.
export function removeSelectedOffering(offeringId: number): void {
  const offeringSessionIds = db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(eq(classSessions.offeringId, offeringId))
    .all()
    .map((row) => row.id);
  if (offeringSessionIds.length > 0) {
    db.delete(sessions).where(inArray(sessions.classSessionId, offeringSessionIds)).run();
  }
  db.delete(selectedOfferings).where(eq(selectedOfferings.offeringId, offeringId)).run();
}

// The "available sessions" list for a selected course, sorted the same way
// listSessions() is, so both render consistently.
export function listClassSessions(offeringId: number): ClassSession[] {
  return db
    .select()
    .from(classSessions)
    .where(eq(classSessions.offeringId, offeringId))
    .orderBy(asc(classSessions.dayOfWeek), asc(classSessions.startMinutes))
    .all();
}

export function getClassSessionById(id: number): ClassSession | undefined {
  return db.select().from(classSessions).where(eq(classSessions.id, id)).get();
}

// The "Add session" flow's only entry point once a course is selected: the
// student picks a catalogue session id, and this looks up everything
// addSession() needs (including its course code) instead of the student
// typing it.
export function addSessionFromCatalogue(classSessionId: number): Session | undefined {
  const classSession = getClassSessionById(classSessionId);
  if (!classSession) return undefined;
  const course = db
    .select({ code: courses.code })
    .from(courseOfferings)
    .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
    .where(eq(courseOfferings.id, classSession.offeringId))
    .get();
  if (!course) return undefined;
  return addSession({
    courseCode: course.code,
    activity: classSession.activity,
    dayOfWeek: classSession.dayOfWeek,
    startMinutes: classSession.startMinutes,
    endMinutes: classSession.endMinutes,
    classSessionId: classSession.id,
  });
}
