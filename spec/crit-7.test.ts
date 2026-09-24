import { beforeAll, describe, expect, inject, it } from "vitest";

// The real check behind spec line 3 ("the core flow persists across a
// reload — create something, and it's still there"), now that the sessions
// API (spec/sessions-api.test.ts) and the UI both exist. Drives the running
// built server over HTTP, the same way guestbook.test.ts does: create a
// session, create one that overlaps it, confirm the create redirect exposes
// the clash, resolve it by removing one side, then reload the page from
// scratch and check what's actually there — not what the handlers did
// internally.
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

describe("core flow persistence (spec line 3)", () => {
  // Unique per run so this test can't be confused by course codes any other
  // spec file happens to have left in the shared throwaway database.
  let courseA: string;
  let courseB: string;

  beforeAll(() => {
    const probe = process.hrtime.bigint();
    courseA = `C7A${probe}`;
    courseB = `C7B${probe}`;
  });

  it("create -> clash -> resolve -> reload: B persists, A is gone", async () => {
    // Create session A: Monday 09:00-10:00.
    const a = await post(
      "/api/sessions",
      new URLSearchParams({
        course_code: courseA,
        activity: "Lecture",
        day_of_week: "0",
        start_minutes: "540",
        end_minutes: "600",
      }),
    );
    expect(a.status).toBe(303);
    const aId = addedIdFrom(a);
    expect(aId).not.toBe("");

    // Create session B, overlapping A on the same day (09:30-10:30).
    const b = await post(
      "/api/sessions",
      new URLSearchParams({
        course_code: courseB,
        activity: "Tutorial",
        day_of_week: "0",
        start_minutes: "570",
        end_minutes: "630",
      }),
    );
    expect(b.status).toBe(303);
    expect(addedIdFrom(b)).not.toBe("");

    // The create response exposes the clash against A.
    expect(clashesWithFrom(b)).toEqual([aId]);

    // Resolve the clash by removing session A.
    const del = await post(`/api/sessions/${aId}/delete`);
    expect(del.status).toBe(303);

    // Reload the page from scratch: B is still there, A is not.
    const reload = await fetch(baseUrl);
    const html = await reload.text();
    expect(html).toContain(courseB);
    expect(html).not.toContain(courseA);
  });
});
