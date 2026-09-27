import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Unlike every other spec file, this one imports src/lib/db.ts directly
// instead of driving the running server over HTTP — deliberately, because
// the one thing this needs to prove (docs/mvp-plan.md section D/G) isn't
// HTTP-observable: session ids are never reused (AUTOINCREMENT), so an
// `on delete cascade` that silently never fired (foreign_keys pragma left
// off) would look IDENTICAL from outside to one that did — the orphaned
// clash_acknowledgements row would just sit inert forever, matching no
// future pair. A fresh, isolated database file, separate from the one
// spec/global-setup.ts boots the server against.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "db-ack-test-")), "test.db");

const { acknowledgeClash, addSession, deleteSession, listAcknowledgedPairs } = await import("../src/lib/db");

function newSession(overrides: Partial<Parameters<typeof addSession>[0]> = {}) {
  return addSession({
    courseCode: "TEST",
    activity: "Lecture",
    dayOfWeek: 0,
    startMinutes: 540,
    endMinutes: 600,
    ...overrides,
  });
}

describe("acknowledgeClash / listAcknowledgedPairs", () => {
  it("stores a pair once regardless of call order, and a duplicate is a no-op", () => {
    const a = newSession({ courseCode: "A" });
    const b = newSession({ courseCode: "B", startMinutes: 570, endMinutes: 630 });

    acknowledgeClash(a.id, b.id);
    acknowledgeClash(b.id, a.id); // reversed order, same pair — must not create a second row

    const matching = listAcknowledgedPairs().filter(
      (p) => (p.sessionAId === a.id && p.sessionBId === b.id) || (p.sessionAId === b.id && p.sessionBId === a.id),
    );
    expect(matching).toHaveLength(1);
    // Canonical ordering: the lower id is always session_a_id.
    expect(matching[0]).toMatchObject({ sessionAId: Math.min(a.id, b.id), sessionBId: Math.max(a.id, b.id) });
  });

  it("removes the acknowledgement when either session in the pair is deleted (on delete cascade)", () => {
    const a = newSession({ courseCode: "C", dayOfWeek: 1 });
    const b = newSession({ courseCode: "D", dayOfWeek: 1, startMinutes: 570, endMinutes: 630 });
    acknowledgeClash(a.id, b.id);

    const involvesPair = (p: { sessionAId: number; sessionBId: number }) =>
      (p.sessionAId === a.id && p.sessionBId === b.id) || (p.sessionAId === b.id && p.sessionBId === a.id);
    expect(listAcknowledgedPairs().some(involvesPair)).toBe(true);

    deleteSession(a.id);

    expect(listAcknowledgedPairs().some(involvesPair)).toBe(false);
  });

  it("removes only the deleted session's acknowledgements, leaving unrelated ones intact", () => {
    const a = newSession({ courseCode: "E", dayOfWeek: 2 });
    const b = newSession({ courseCode: "F", dayOfWeek: 2, startMinutes: 570, endMinutes: 630 });
    const c = newSession({ courseCode: "G", dayOfWeek: 3 });
    const d = newSession({ courseCode: "H", dayOfWeek: 3, startMinutes: 570, endMinutes: 630 });
    acknowledgeClash(a.id, b.id);
    acknowledgeClash(c.id, d.id);

    deleteSession(a.id);

    const involves = (id: number) => (p: { sessionAId: number; sessionBId: number }) =>
      p.sessionAId === id || p.sessionBId === id;
    expect(listAcknowledgedPairs().some(involves(a.id))).toBe(false);
    expect(listAcknowledgedPairs().some((p) => involves(c.id)(p) && involves(d.id)(p))).toBe(true);
  });
});
