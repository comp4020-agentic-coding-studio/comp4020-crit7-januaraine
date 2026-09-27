import { describe, expect, it } from "vitest";
import { inject } from "vitest";
import { seedClassSessionId } from "../src/lib/catalogue-seed";

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

const addFromCatalogue = (classSessionId: number) =>
  post("/api/sessions", new URLSearchParams({ class_session_id: String(classSessionId) }));

// Sessions can now only be created from the fixed seeded catalogue
// (src/lib/catalogue-seed.ts), so this file — like
// spec/acknowledgements-api.test.ts and spec/crit-7.test.ts — reserves
// specific catalogue sessions that no other spec file touches, instead of
// generating unique free-text course codes. Because every reserved session
// added here shares its window with copies of itself (never with another
// file's reservation), no fixture ever collides across files even though
// they all drive the same shared server + database (spec/global-setup.ts).
const NO_CLASH_SESSION = seedClassSessionId("COMP1130", "Lecture", 1); // Tue 09:00-10:00
const CLASH_SESSION = seedClassSessionId("COMP2310", "Lecture", 2); // Wed 09:00-10:00

// A stable marker unique to one persisted session id, regardless of how many
// other rows happen to share its course/activity/time text (duplicate-adding
// the same catalogue session for a clash fixture makes those rows textually
// identical) — every rendered session in both the clash banner and the
// weekly grid carries a delete-form action naming its own id.
const deleteMarker = (id: string) => `/api/sessions/${id}/delete`;

const bannerHtml = (html: string): string => {
  const start = html.indexOf("<h2>Unresolved schedule conflicts</h2>");
  if (start === -1) return "";
  const end = html.indexOf("<h2>Weekly timetable</h2>", start);
  return html.slice(start, end === -1 ? undefined : end);
};

describe("POST /api/sessions", () => {
  it("creates a session with no clash and redirects with its id", async () => {
    const res = await addFromCatalogue(NO_CLASH_SESSION);
    expect(res.status).toBe(303);
    expect(addedIdFrom(res)).not.toBe("");
    expect(clashesWithFrom(res)).toEqual([]);
  });

  it("rejects a missing class_session_id", async () => {
    const res = await post("/api/sessions", new URLSearchParams());
    expect(res.status).toBe(400);
  });

  it("rejects a non-integer class_session_id", async () => {
    const res = await post("/api/sessions", new URLSearchParams({ class_session_id: "not-a-number" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown class_session_id", async () => {
    const res = await addFromCatalogue(999_999_999);
    expect(res.status).toBe(400);
  });

  it("reports every existing session that clashes with the new one", async () => {
    const a = await addFromCatalogue(CLASH_SESSION);
    const aId = addedIdFrom(a);

    const b = await addFromCatalogue(CLASH_SESSION);
    const bId = addedIdFrom(b);
    expect(clashesWithFrom(b)).toEqual([aId]);

    await post(deleteMarker(aId));
    await post(deleteMarker(bId));
  });
});

describe("GET / after a clash redirect", () => {
  it("actually renders the clash banner instead of just exposing it in the Location header", async () => {
    // Every other clash test in this file (and spec/crit-7.test.ts) stops at
    // inspecting the redirect's Location header — none of them follow it and
    // render the resulting page the way a browser actually would. This is
    // that missing hop.
    const a = await addFromCatalogue(CLASH_SESSION);
    const aId = addedIdFrom(a);
    const b = await addFromCatalogue(CLASH_SESSION);
    const bId = addedIdFrom(b);
    expect(clashesWithFrom(b)).toEqual([aId]);

    const location = b.headers.get("location");
    if (!location) throw new Error("expected a redirect with a Location header");
    const page = await fetch(new URL(location, baseUrl));
    expect(page.status).toBe(200);

    const html = await page.text();
    expect(html).toContain("Unresolved schedule conflicts");
    expect(html).toContain(deleteMarker(aId));
    expect(html).toContain(deleteMarker(bId));

    await post(deleteMarker(aId));
    await post(deleteMarker(bId));
  });
});

describe("clash display reflects the full persisted timetable, not just the last create", () => {
  it("shows every pairwise clash among several mutually overlapping sessions, and keeps showing remaining clashes as sessions are removed", async () => {
    // Three copies of the same catalogue session all share one window, so
    // every pair among them clashes — the exact scenario a past bug report
    // gave: only the clash involving the most recently created/deleted
    // session used to show, dropping others that were still genuinely
    // active. Pure clash math for this (mutual 3-way vs. "hub" clashes) is
    // already covered exhaustively by spec/clashes.test.ts; this is the
    // integration-level check that persistence + banner rendering agree.
    const a = await addFromCatalogue(CLASH_SESSION);
    const aId = addedIdFrom(a);
    const b = await addFromCatalogue(CLASH_SESSION);
    const bId = addedIdFrom(b);
    const c = await addFromCatalogue(CLASH_SESSION);
    const cId = addedIdFrom(c);

    let html = bannerHtml(await (await fetch(baseUrl)).text());
    expect(html).toContain(deleteMarker(aId));
    expect(html).toContain(deleteMarker(bId));
    expect(html).toContain(deleteMarker(cId));

    // Remove C: A-B still clash, and neither side of that pair was just
    // created or just deleted, so the old redirect-query-param logic would
    // have shown nothing at all here.
    await post(deleteMarker(cId));
    html = bannerHtml(await (await fetch(baseUrl)).text());
    expect(html).toContain(deleteMarker(aId));
    expect(html).toContain(deleteMarker(bId));
    expect(html).not.toContain(deleteMarker(cId));

    // Remove B too: A has no remaining clash partner, so nothing naming A
    // appears in the banner any more — even though A itself would still be a
    // perfectly valid session sitting in the weekly grid, were it not also
    // removed here. (This checks the banner region specifically, not "no
    // banner on the whole page," since spec/acknowledgements-api.test.ts and
    // spec/crit-7.test.ts may be running concurrently against their own,
    // separately-reserved clashing fixtures.)
    await post(deleteMarker(bId));
    html = bannerHtml(await (await fetch(baseUrl)).text());
    expect(html).not.toContain(deleteMarker(aId));

    await post(deleteMarker(aId));
  });
});

describe("POST /api/sessions/:id/delete", () => {
  it("removes the session, so it no longer counts towards future clashes", async () => {
    const a = await addFromCatalogue(CLASH_SESSION);
    const aId = addedIdFrom(a);
    const b = await addFromCatalogue(CLASH_SESSION);
    const bId = addedIdFrom(b);
    expect(clashesWithFrom(b)).toEqual([aId]);

    const del = await post(deleteMarker(aId));
    expect(del.status).toBe(303);
    expect(del.headers.get("location")).toBe("/");

    // Re-adding the same catalogue session creates a brand new row — it must
    // clash with the still-persisted B, not with the now-deleted A.
    const c = await addFromCatalogue(CLASH_SESSION);
    const cId = addedIdFrom(c);
    expect(clashesWithFrom(c)).toEqual([bId]);

    await post(deleteMarker(bId));
    await post(deleteMarker(cId));
  });
});
