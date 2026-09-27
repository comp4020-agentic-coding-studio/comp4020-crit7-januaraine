import { describe, expect, inject, it } from "vitest";
import { seedClassSessionId, seedOfferingId } from "../src/lib/catalogue-seed";

// The real check behind spec line 3 ("the core flow persists across a
// reload — create something, and it's still there"), now that the app is a
// course-selection flow rather than a free-text form: select a course, add
// one of its sessions, select a second course, add a conflicting session,
// confirm the create redirect exposes the clash, resolve it by removing one
// side, then reload the page from scratch and check what's actually there —
// not what the handlers did internally.
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

// This is its own genuine two-different-real-courses clash — a session from
// COMP1100 and a session from COMP2100 that share a window — reserved here
// and touched by no other spec file (see spec/sessions-api.test.ts and
// spec/acknowledgements-api.test.ts for their own reservations against the
// same shared server + database, spec/global-setup.ts).
const COURSE_A_OFFERING = seedOfferingId("COMP1100");
const COURSE_A_SESSION = seedClassSessionId("COMP1100", "Tutorial", 1); // Tue 14:00-15:00
const COURSE_B_OFFERING = seedOfferingId("COMP2100");
const COURSE_B_SESSION = seedClassSessionId("COMP2100", "Tutorial", 1); // Tue 14:00-15:00

const selectCourse = (offeringId: number) => post("/api/courses/select", new URLSearchParams({ offering_id: String(offeringId) }));
const addFromCatalogue = (classSessionId: number) =>
  post("/api/sessions", new URLSearchParams({ class_session_id: String(classSessionId) }));

describe("core flow persistence (spec line 3)", () => {
  it("select course -> add session -> select conflicting course -> add its session -> clash -> resolve -> reload: B persists, A is gone", async () => {
    const selectA = await selectCourse(COURSE_A_OFFERING);
    expect(selectA.status).toBe(303);

    const a = await addFromCatalogue(COURSE_A_SESSION);
    expect(a.status).toBe(303);
    const aId = addedIdFrom(a);
    expect(aId).not.toBe("");

    const selectB = await selectCourse(COURSE_B_OFFERING);
    expect(selectB.status).toBe(303);

    const b = await addFromCatalogue(COURSE_B_SESSION);
    expect(b.status).toBe(303);
    const bId = addedIdFrom(b);
    expect(bId).not.toBe("");

    // The create response exposes the clash against A.
    expect(clashesWithFrom(b)).toEqual([aId]);

    // Resolve the clash by removing session A.
    const del = await post(`/api/sessions/${aId}/delete`);
    expect(del.status).toBe(303);

    // Reload the page from scratch: B is still there, A is not.
    const reload = await fetch(baseUrl);
    const html = await reload.text();
    expect(html).toContain(`/api/sessions/${bId}/delete`);
    expect(html).not.toContain(`/api/sessions/${aId}/delete`);
  });
});
