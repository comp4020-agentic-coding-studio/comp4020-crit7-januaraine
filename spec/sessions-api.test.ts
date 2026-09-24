import { describe, expect, it } from "vitest";
import { inject } from "vitest";

// Focused tests for the API only (no UI yet): validation, clash reporting,
// and that delete actually removes a session rather than just redirecting.
// Follows guestbook.test.ts's shape — drives the running built server over
// HTTP. spec/crit-7.test.ts is left untouched; it becomes the full
// create -> clash -> resolve -> reload test once the UI exists.
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

const session = (overrides: Record<string, string> = {}) =>
  new URLSearchParams({
    course_code: "COMP4020",
    activity: "Lecture",
    day_of_week: "0",
    start_minutes: "540",
    end_minutes: "600",
    ...overrides,
  });

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
