import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Like spec/db-acknowledgements.test.ts, this drives src/lib/db.ts directly
// against its own private, freshly-seeded database rather than the shared
// server's — the thing this proves (removeSelectedOffering cascading through
// both `sessions` and, via the existing FK, `clash_acknowledgements`) is
// easiest to check with full control over exactly what's in the database,
// not by fishing through a page shared with every other spec file.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "db-catalogue-test-")), "test.db");

const {
  acknowledgeClash,
  addSessionFromCatalogue,
  listAcknowledgedPairs,
  listClassSessions,
  listCourses,
  listSelectedOfferings,
  listSessions,
  removeSelectedOffering,
  searchCourses,
  selectOffering,
} = await import("../src/lib/db");

describe("listCourses / searchCourses", () => {
  it("lists every seeded course, sorted by code", () => {
    const courses = listCourses();
    expect(courses.length).toBeGreaterThanOrEqual(7);
    const codes = courses.map((c) => c.code);
    expect([...codes].sort()).toEqual(codes);
    expect(codes).toContain("COMP4020");
  });

  it("filters by code or title, case-insensitively", () => {
    expect(searchCourses("comp1100").map((c) => c.code)).toEqual(["COMP1100"]);
    expect(searchCourses("algorithms").map((c) => c.code)).toEqual(["COMP3600"]);
  });

  it("returns every course for a blank query", () => {
    expect(searchCourses("").length).toBe(listCourses().length);
    expect(searchCourses("   ").length).toBe(listCourses().length);
  });

  it("returns nothing for a query matching no course", () => {
    expect(searchCourses("no such course anywhere")).toEqual([]);
  });
});

describe("listClassSessions", () => {
  it("lists a course's sessions sorted by day then start time", () => {
    const comp4020 = listCourses().find((c) => c.code === "COMP4020");
    if (!comp4020) throw new Error("expected COMP4020 to be seeded");
    const classSessions = listClassSessions(comp4020.offeringId);
    expect(classSessions.length).toBeGreaterThan(0);
    for (let i = 1; i < classSessions.length; i++) {
      const prev = classSessions[i - 1];
      const cur = classSessions[i];
      expect(prev.dayOfWeek < cur.dayOfWeek || (prev.dayOfWeek === cur.dayOfWeek && prev.startMinutes <= cur.startMinutes)).toBe(
        true,
      );
    }
  });

  it("returns an empty list for an offering with no sessions", () => {
    expect(listClassSessions(999_999_999)).toEqual([]);
  });
});

describe("selectOffering / removeSelectedOffering", () => {
  it("adds a course to My Courses, idempotently", () => {
    const comp1130 = listCourses().find((c) => c.code === "COMP1130");
    if (!comp1130) throw new Error("expected COMP1130 to be seeded");

    expect(listSelectedOfferings().some((c) => c.offeringId === comp1130.offeringId)).toBe(false);
    selectOffering(comp1130.offeringId);
    selectOffering(comp1130.offeringId); // a second select is a harmless no-op
    expect(listSelectedOfferings().filter((c) => c.offeringId === comp1130.offeringId)).toHaveLength(1);
  });

  it("removing a course also removes its sessions and cascades any acknowledgement involving them, leaving unrelated offerings untouched", () => {
    const comp2100 = listCourses().find((c) => c.code === "COMP2100");
    const comp3600 = listCourses().find((c) => c.code === "COMP3600");
    if (!comp2100 || !comp3600) throw new Error("expected COMP2100 and COMP3600 to be seeded");

    selectOffering(comp2100.offeringId);
    selectOffering(comp3600.offeringId);

    const [compSession1, compSession2] = listClassSessions(comp2100.offeringId);
    const unrelatedClassSession = listClassSessions(comp3600.offeringId)[0];

    const a = addSessionFromCatalogue(compSession1.id);
    const b = addSessionFromCatalogue(compSession2.id);
    const unrelated = addSessionFromCatalogue(unrelatedClassSession.id);
    if (!a || !b || !unrelated) throw new Error("expected all three sessions to be added");

    acknowledgeClash(a.id, b.id);
    expect(listAcknowledgedPairs().some((p) => p.sessionAId === Math.min(a.id, b.id))).toBe(true);

    removeSelectedOffering(comp2100.offeringId);

    // COMP2100's sessions are gone from the timetable...
    const remaining = listSessions().map((s) => s.id);
    expect(remaining).not.toContain(a.id);
    expect(remaining).not.toContain(b.id);
    // ...its acknowledgement cascaded away with them...
    expect(listAcknowledgedPairs().some((p) => p.sessionAId === Math.min(a.id, b.id))).toBe(false);
    // ...COMP2100 is gone from My Courses...
    expect(listSelectedOfferings().some((c) => c.offeringId === comp2100.offeringId)).toBe(false);
    // ...but COMP3600's own selection and session are entirely unaffected.
    expect(remaining).toContain(unrelated.id);
    expect(listSelectedOfferings().some((c) => c.offeringId === comp3600.offeringId)).toBe(true);

    // The catalogue's own class_sessions rows are never deleted — the course
    // can still be browsed/re-selected after being removed.
    expect(listClassSessions(comp2100.offeringId).length).toBeGreaterThan(0);
  });
});
