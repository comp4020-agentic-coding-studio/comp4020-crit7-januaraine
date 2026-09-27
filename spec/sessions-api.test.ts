import { describe, expect, it } from "vitest";
import { inject } from "vitest";

// Focused tests for the API: validation, clash reporting, and that delete
// actually removes a session rather than just redirecting. Drives the
// running built server over HTTP, like spec/crit-7.test.ts does for the full
// create -> clash -> resolve -> reload flow.
const baseUrl = inject("baseUrl");

// Astro checks form POSTs carry a same-origin Origin header (CSRF
// protection); browsers send it automatically, a bare fetch doesn't.
const post = (path: string, body?: URLSearchParams) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin: baseUrl },
    body,
    redirect: "manual",
  });

const addedIdFrom = (res: Response): string => {
  const location = res.headers.get("location");
  if (!location) throw new Error("expected a redirect with a Location header");
  return new URL(location, baseUrl).searchParams.get("added") ?? "";
};

const clashesWithFrom = (res: Response): string[] => {
  const location = res.headers.get("location");
  if (!location) throw new Error("expected a redirect with a Location header");
  const raw = new URL(location, baseUrl).searchParams.get("clashesWith");
  return raw ? raw.split(",") : [];
};

const addedIdsFrom = (res: Response): string[] => {
  const location = res.headers.get("location");
  if (!location) throw new Error("expected a redirect with a Location header");
  const raw = new URL(location, baseUrl).searchParams.get("added");
  return raw ? raw.split(",") : [];
};

// clashDetail entries look like "<createdId>:<clashId1>,<clashId2>", joined
// by ";" — one entry per created session that actually clashed.
const clashDetailFrom = (res: Response): Record<string, string[]> => {
  const location = res.headers.get("location");
  if (!location) throw new Error("expected a redirect with a Location header");
  const raw = new URL(location, baseUrl).searchParams.get("clashDetail") ?? "";
  const detail: Record<string, string[]> = {};
  for (const entry of raw.split(";").filter(Boolean)) {
    const [id, clashes] = entry.split(":");
    detail[id] = clashes.split(",");
  }
  return detail;
};

const session = (overrides: Record<string, string> = {}) =>
  new URLSearchParams({
    course_code: "COMP4020",
    activity: "Lecture",
    day_of_week: "0",
    start_minutes: "540",
    end_minutes: "600",
    ...overrides,
  });

// URLSearchParams can carry the same key more than once, matching how a
// browser encodes several checked checkboxes that share one `name`.
const multiDaySession = (days: string[], overrides: Record<string, string> = {}) => {
  const params = session(overrides);
  params.delete("day_of_week");
  for (const day of days) params.append("day_of_week", day);
  return params;
};

describe("POST /api/sessions", () => {
  it("creates a session with no clash and redirects with its id", async () => {
    const res = await post("/api/sessions", session({ day_of_week: "1", start_minutes: "60" }));
    expect(res.status).toBe(303);
    expect(addedIdFrom(res)).not.toBe("");
    expect(clashesWithFrom(res)).toEqual([]);
  });

  it("reports every existing session that clashes with the new one", async () => {
    const a = await post("/api/sessions", session({ day_of_week: "2", start_minutes: "540" }));
    const aId = addedIdFrom(a);

    const b = await post(
      "/api/sessions",
      session({ day_of_week: "2", start_minutes: "570", end_minutes: "630" }),
    );
    expect(clashesWithFrom(b)).toEqual([aId]);
  });

  it("rejects a missing course_code", async () => {
    const res = await post("/api/sessions", session({ course_code: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-range day_of_week", async () => {
    const res = await post("/api/sessions", session({ day_of_week: "7" }));
    expect(res.status).toBe(400);
  });

  it("rejects end_minutes <= start_minutes", async () => {
    const res = await post(
      "/api/sessions",
      session({ start_minutes: "600", end_minutes: "600" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a submission with no day selected", async () => {
    const res = await post("/api/sessions", multiDaySession([]));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/sessions with multiple days", () => {
  it("creates one persisted session per selected day", async () => {
    const courseCode = `MULTI${process.hrtime.bigint()}`;
    const res = await post(
      "/api/sessions",
      multiDaySession(["0", "2"], { course_code: courseCode, start_minutes: "810", end_minutes: "870" }),
    );
    expect(res.status).toBe(303);
    const ids = addedIdsFrom(res);
    expect(ids).toHaveLength(2);
    expect(clashesWithFrom(res)).toEqual([]);

    const html = await (await fetch(baseUrl)).text();
    // Two distinct persisted rows (one under the Monday group, one under
    // Wednesday), not a single row tagged with two days — the session-meta
    // text for this exact course code appears exactly twice.
    const meta = `${courseCode} Lecture (13:30–14:30)`;
    const occurrences = html.split(meta).length - 1;
    expect(occurrences).toBe(2);
  });

  it("reports the actual conflicting day/session when only one selected day clashes", async () => {
    // A distinctive, unique-per-run time window so this test can't be
    // confused by any other test's (or prior run's) leftover rows in the
    // shared throwaway database.
    const courseCode = `MULTICLASH${process.hrtime.bigint()}`;
    const startMinutes = "900";
    const endMinutes = "960";

    // Existing session on Wednesday only, matching the time window below.
    const existing = await post(
      "/api/sessions",
      session({ course_code: courseCode, day_of_week: "2", start_minutes: startMinutes, end_minutes: endMinutes }),
    );
    const existingId = addedIdsFrom(existing)[0];

    // New submission picks Monday + Wednesday for the same time window —
    // only the Wednesday copy should clash, not the Monday one.
    const res = await post(
      "/api/sessions",
      multiDaySession(["0", "2"], { start_minutes: startMinutes, end_minutes: endMinutes }),
    );
    expect(res.status).toBe(303);

    const ids = addedIdsFrom(res);
    expect(ids).toHaveLength(2);
    expect(clashesWithFrom(res)).toEqual([existingId]);

    const detail = clashDetailFrom(res);
    // Exactly one of the two created sessions clashed (the Wednesday one),
    // and it clashed with exactly the pre-existing Wednesday session.
    const clashedIds = Object.keys(detail);
    expect(clashedIds).toHaveLength(1);
    expect(detail[clashedIds[0]]).toEqual([existingId]);
  });
});

describe("GET / after a clash redirect", () => {
  it("actually renders the clash banner instead of just exposing it in the Location header", async () => {
    // Every other clash test in this file (and spec/crit-7.test.ts) stops at
    // inspecting the redirect's Location header — none of them follow it and
    // render the resulting page the way a browser actually would. This is
    // that missing hop: it exercises index.astro's `added`/`clashDetail`
    // query-string parsing and clash-banner render path for real.
    const courseCode = `RENDER${process.hrtime.bigint()}`;
    const a = await post(
      "/api/sessions",
      session({ course_code: courseCode, day_of_week: "4", start_minutes: "540" }),
    );
    const aId = addedIdFrom(a);

    const bCourseCode = `${courseCode}B`;
    const b = await post(
      "/api/sessions",
      session({ course_code: bCourseCode, day_of_week: "4", start_minutes: "570", end_minutes: "630" }),
    );
    expect(clashesWithFrom(b)).toEqual([aId]);

    const location = b.headers.get("location");
    if (!location) throw new Error("expected a redirect with a Location header");

    const page = await fetch(new URL(location, baseUrl));
    expect(page.status).toBe(200);

    const html = await page.text();
    expect(html).toContain("Clash detected");
    expect(html).toContain(courseCode);
    expect(html).toContain(bCourseCode);
  });
});

describe("POST /api/sessions/:id/delete", () => {
  it("removes the session, so it no longer counts towards future clashes", async () => {
    const a = await post("/api/sessions", session({ day_of_week: "3", start_minutes: "540" }));
    const aId = addedIdFrom(a);

    const b = await post(
      "/api/sessions",
      session({ day_of_week: "3", start_minutes: "570", end_minutes: "630" }),
    );
    const bId = addedIdFrom(b);
    expect(clashesWithFrom(b)).toEqual([aId]);

    const del = await post(`/api/sessions/${aId}/delete`);
    expect(del.status).toBe(303);
    expect(del.headers.get("location")).toBe("/");

    const c = await post(
      "/api/sessions",
      session({ day_of_week: "3", start_minutes: "570", end_minutes: "630" }),
    );
    expect(clashesWithFrom(c).sort()).toEqual([bId].sort());
  });
});
