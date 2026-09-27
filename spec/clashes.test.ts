import { describe, expect, it } from "vitest";
import { findAllClashes, findClashes, sessionsClash } from "../src/lib/clashes";

// Pure unit tests for the clash rule (docs/mvp-plan.md section E) — no
// server needed, so these don't touch `baseUrl` from global-setup.ts.
describe("sessionsClash", () => {
  it("clashes when the same day's intervals overlap", () => {
    expect(
      sessionsClash(
        { dayOfWeek: 0, startMinutes: 540, endMinutes: 600 },
        { dayOfWeek: 0, startMinutes: 570, endMinutes: 630 },
      ),
    ).toBe(true);
  });

  it("does not clash when one session ends as the other starts", () => {
    expect(
      sessionsClash(
        { dayOfWeek: 0, startMinutes: 540, endMinutes: 600 },
        { dayOfWeek: 0, startMinutes: 600, endMinutes: 660 },
      ),
    ).toBe(false);
  });

  it("does not clash when the same day's intervals are disjoint", () => {
    expect(
      sessionsClash(
        { dayOfWeek: 0, startMinutes: 540, endMinutes: 600 },
        { dayOfWeek: 0, startMinutes: 700, endMinutes: 760 },
      ),
    ).toBe(false);
  });

  it("does not clash across different days, even with identical times", () => {
    expect(
      sessionsClash(
        { dayOfWeek: 0, startMinutes: 540, endMinutes: 600 },
        { dayOfWeek: 1, startMinutes: 540, endMinutes: 600 },
      ),
    ).toBe(false);
  });

  it("clashes with an identical session", () => {
    const session = { dayOfWeek: 2, startMinutes: 540, endMinutes: 600 };
    expect(sessionsClash(session, { ...session })).toBe(true);
  });

  it("clashes when one interval fully contains the other", () => {
    expect(
      sessionsClash(
        { dayOfWeek: 0, startMinutes: 540, endMinutes: 660 },
        { dayOfWeek: 0, startMinutes: 570, endMinutes: 600 },
      ),
    ).toBe(true);
  });
});

describe("findClashes", () => {
  it("returns every existing session that clashes with the candidate", () => {
    const monday9to10 = { dayOfWeek: 0, startMinutes: 540, endMinutes: 600 };
    const existing = [
      { id: 1, dayOfWeek: 0, startMinutes: 570, endMinutes: 630 }, // overlaps
      { id: 2, dayOfWeek: 0, startMinutes: 600, endMinutes: 660 }, // back-to-back, no clash
      { id: 3, dayOfWeek: 1, startMinutes: 540, endMinutes: 600 }, // different day
      { id: 4, dayOfWeek: 0, startMinutes: 500, endMinutes: 545 }, // overlaps
    ];

    expect(findClashes(monday9to10, existing).map((s) => s.id)).toEqual([1, 4]);
  });

  it("returns an empty array when nothing clashes", () => {
    const candidate = { dayOfWeek: 4, startMinutes: 540, endMinutes: 600 };
    expect(findClashes(candidate, [{ dayOfWeek: 3, startMinutes: 540, endMinutes: 600 }])).toEqual(
      [],
    );
  });
});

describe("findAllClashes", () => {
  // A: 10:00-12:00, B: 11:00-13:00, C: 11:30-14:00, all Monday — every pair
  // overlaps, matching the reported bug's example.
  const a = { id: "A", dayOfWeek: 0, startMinutes: 600, endMinutes: 720 };
  const b = { id: "B", dayOfWeek: 0, startMinutes: 660, endMinutes: 780 };
  const c = { id: "C", dayOfWeek: 0, startMinutes: 690, endMinutes: 840 };

  it("finds every clashing pair when one session overlaps several others", () => {
    const solo = { id: "D", dayOfWeek: 1, startMinutes: 540, endMinutes: 600 };
    const pairs = findAllClashes([a, b, solo]).map(([x, y]) => [x.id, y.id]);
    expect(pairs).toEqual([["A", "B"]]);
  });

  it("finds every pairwise clash among several mutually overlapping sessions", () => {
    const pairs = findAllClashes([a, b, c]).map(([x, y]) => [x.id, y.id]);
    expect(pairs).toEqual([
      ["A", "B"],
      ["A", "C"],
      ["B", "C"],
    ]);
  });

  it("stops reporting a pair once one side is no longer in the list", () => {
    // Simulates removing C: only the A-B pair should remain.
    const pairs = findAllClashes([a, b]).map(([x, y]) => [x.id, y.id]);
    expect(pairs).toEqual([["A", "B"]]);
  });

  it("reports no clashes once every conflicting session is gone", () => {
    expect(findAllClashes([a])).toEqual([]);
    expect(findAllClashes([])).toEqual([]);
  });
});
