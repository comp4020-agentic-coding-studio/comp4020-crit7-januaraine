import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { canonicalPair } from "./acknowledgements";
import { type ClashAcknowledgement, type Session, clashAcknowledgements, sessions } from "./schema";

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

export type { Session };

export interface NewSession {
  courseCode: string;
  activity: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
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
