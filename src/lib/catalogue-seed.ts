// The small ANU course catalogue this demo seeds at boot (src/lib/db.ts).
// Course `code`/`title`/`units` are real, public ANU course information
// (verified against programsandcourses.anu.edu.au; COMP4020 is this course
// itself). Session `activity`/`dayOfWeek`/`startMinutes`/`endMinutes` are
// manually curated for this demo, NOT scraped or sourced from a live
// timetable feed — see README.md's "Data sources" section for why, and
// docs/mvp-plan.md's course-catalogue revision for the decision. Curated so
// that combinations of real courses naturally produce some clashes (the
// point of the app), without hard-coding a clash as a catalogue "fact."
//
// This file is pure data + arithmetic, no database import, on purpose: tests
// that drive the running server over HTTP still need to name a specific
// offering/class-session id, and importing the seed (rather than querying a
// possibly-different database file) is what lets them compute the same id
// the server's own boot-time seeding produced — see seedOfferingId/
// seedClassSessionId below.
export interface SeedSession {
  activity: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  location?: string;
}

export interface SeedCourse {
  code: string;
  title: string;
  units: number;
  sessions: SeedSession[];
}

const YEAR = 2026;
const SEMESTER = 2;

export const CATALOGUE_YEAR = YEAR;
export const CATALOGUE_SEMESTER = SEMESTER;

// Times are minutes-since-midnight, same representation as `sessions`/
// `class_sessions` (src/lib/schema.ts) — no conversion needed between
// catalogue data and what gets copied into a student's personal timetable.
export const CATALOGUE: SeedCourse[] = [
  {
    code: "COMP1100",
    title: "Programming as Problem Solving",
    units: 6,
    sessions: [
      { activity: "Lecture", dayOfWeek: 0, startMinutes: 540, endMinutes: 600, location: "Manning Clark 1" },
      { activity: "Tutorial", dayOfWeek: 1, startMinutes: 840, endMinutes: 900, location: "CSIT N101" },
      { activity: "Lab", dayOfWeek: 3, startMinutes: 540, endMinutes: 660, location: "CSIT Lab 2" },
    ],
  },
  {
    code: "COMP1130",
    title: "Programming as Problem Solving (Advanced)",
    units: 6,
    sessions: [
      { activity: "Lecture", dayOfWeek: 1, startMinutes: 540, endMinutes: 600, location: "Manning Clark 2" },
      { activity: "Tutorial", dayOfWeek: 2, startMinutes: 840, endMinutes: 900, location: "CSIT N102" },
      { activity: "Lab", dayOfWeek: 3, startMinutes: 540, endMinutes: 660, location: "CSIT Lab 2" },
    ],
  },
  {
    code: "COMP2100",
    title: "Software Construction",
    units: 6,
    sessions: [
      { activity: "Lecture", dayOfWeek: 0, startMinutes: 600, endMinutes: 720, location: "Llewellyn Hall" },
      { activity: "Tutorial", dayOfWeek: 1, startMinutes: 840, endMinutes: 900, location: "CSIT N103" },
      { activity: "Lab", dayOfWeek: 2, startMinutes: 900, endMinutes: 1020, location: "CSIT Lab 3" },
    ],
  },
  {
    code: "COMP2310",
    title: "Systems, Networks and Concurrency",
    units: 6,
    sessions: [
      { activity: "Lecture", dayOfWeek: 2, startMinutes: 540, endMinutes: 600, location: "Copland G027" },
      { activity: "Tutorial", dayOfWeek: 3, startMinutes: 780, endMinutes: 840, location: "CSIT N104" },
      { activity: "Lab", dayOfWeek: 4, startMinutes: 540, endMinutes: 660, location: "CSIT Lab 1" },
    ],
  },
  {
    code: "COMP3600",
    title: "Algorithms",
    units: 6,
    sessions: [
      { activity: "Lecture", dayOfWeek: 0, startMinutes: 660, endMinutes: 720, location: "Copland G029" },
      { activity: "Tutorial", dayOfWeek: 4, startMinutes: 660, endMinutes: 720, location: "CSIT N105" },
      { activity: "Lab", dayOfWeek: 2, startMinutes: 900, endMinutes: 1020, location: "CSIT Lab 3" },
    ],
  },
  {
    code: "COMP3620",
    title: "Artificial Intelligence",
    units: 6,
    sessions: [
      { activity: "Lecture", dayOfWeek: 3, startMinutes: 600, endMinutes: 720, location: "Manning Clark 1" },
      { activity: "Tutorial", dayOfWeek: 2, startMinutes: 660, endMinutes: 720, location: "CSIT N106" },
      { activity: "Lab", dayOfWeek: 4, startMinutes: 780, endMinutes: 900, location: "CSIT Lab 2" },
    ],
  },
  {
    code: "COMP4020",
    title: "Agentic Coding Studio",
    units: 6,
    sessions: [
      { activity: "Lecture", dayOfWeek: 0, startMinutes: 600, endMinutes: 720, location: "Hanna Neumann G058" },
      { activity: "Tutorial", dayOfWeek: 1, startMinutes: 840, endMinutes: 900, location: "CSIT N107" },
      { activity: "Tutorial", dayOfWeek: 2, startMinutes: 660, endMinutes: 720, location: "CSIT N107" },
      { activity: "Lab", dayOfWeek: 3, startMinutes: 540, endMinutes: 660, location: "CSIT Lab 4" },
    ],
  },
];

// Both seedOfferingId and seedClassSessionId assume src/lib/db.ts's seed
// function inserts courses (then that course's one offering, then that
// offering's sessions) in exactly CATALOGUE's order — the same assumption
// AUTOINCREMENT ids make true, since ids are assigned in insertion order on
// a fresh database and this seed only ever runs once (see the
// insert-if-empty guard in src/lib/db.ts).
export function seedOfferingId(courseCode: string): number {
  const index = CATALOGUE.findIndex((c) => c.code === courseCode);
  if (index === -1) throw new Error(`unknown seeded course code: ${courseCode}`);
  return index + 1;
}

export function seedClassSessionId(courseCode: string, activity: string, dayOfWeek: number): number {
  let id = 0;
  for (const course of CATALOGUE) {
    for (const session of course.sessions) {
      id += 1;
      if (course.code === courseCode && session.activity === activity && session.dayOfWeek === dayOfWeek) {
        return id;
      }
    }
  }
  throw new Error(`unknown seeded session: ${courseCode} ${activity} day ${dayOfWeek}`);
}
