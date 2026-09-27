import { describe, expect, it } from "vitest";
import { inject } from "vitest";
import { seedClassSessionId } from "../src/lib/catalogue-seed";

// HTTP-level acceptance criteria for "Keep both" (docs/mvp-plan.md sections
// D/E/G), drives the running built server the same way spec/crit-7.test.ts
// and spec/sessions-api.test.ts do. spec/acknowledgements.test.ts covers the
// pure filtering logic in isolation; this file covers the actual
// create -> clash -> acknowledge -> reload behavior over HTTP.
const baseUrl = inject("baseUrl");

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

// Every spec file driving the shared server + database (spec/global-setup.ts)
// reserves catalogue sessions (src/lib/catalogue-seed.ts) that no other file
// touches — see spec/sessions-api.test.ts and spec/crit-7.test.ts for their
// own reservations. This file reserves both of COMP2310's remaining native
// sessions (its Lecture is spec/sessions-api.test.ts's CLASH_SESSION): the
// Tutorial, duplicate-added to build a self-contained A/B/C mutual clash, and
// the Lab, on a different day, as a genuinely non-clashing second fixture.
const CLASH_SESSION = seedClassSessionId("COMP2310", "Tutorial", 3); // Thu 13:00-14:00
const OTHER_SESSION = seedClassSessionId("COMP2310", "Lab", 4); // Fri 09:00-11:00

const addFromCatalogue = (classSessionId: number) =>
  post("/api/sessions", new URLSearchParams({ class_session_id: String(classSessionId) }));

const createSession = async (classSessionId: number): Promise<string> => {
  const res = await addFromCatalogue(classSessionId);
  expect(res.status).toBe(303);
  const id = addedIdFrom(res);
  expect(id).not.toBe("");
  return id;
};

const acknowledge = (sessionAId: string, sessionBId: string) =>
  post("/api/clashes/acknowledge", new URLSearchParams({ session_a_id: sessionAId, session_b_id: sessionBId }));

const getPage = async (): Promise<string> => {
  const res = await fetch(baseUrl);
  expect(res.status).toBe(200);
  return res.text();
};

// The banner ("Unresolved schedule conflicts") and the weekly grid are two
// distinct regions of the same page; a session can legitimately appear in
// both at once, so assertions about "is this pair still in the top alert"
// must be scoped to the banner region only.
function bannerHtml(html: string): string {
  const start = html.indexOf("<h2>Unresolved schedule conflicts</h2>");
  if (start === -1) return "";
  const end = html.indexOf("<h2>Weekly timetable</h2>", start);
  return html.slice(start, end === -1 ? undefined : end);
}

// A stable marker unique to one persisted session id, regardless of how many
// other rows happen to share its course/activity/time text (duplicate-adding
// the same catalogue session for a clash fixture makes those rows textually
// identical) — every rendered session carries a delete-form action naming
// its own id.
const deleteMarker = (id: string) => `/api/sessions/${id}/delete`;

// The ⚠ indicator only renders in the weekly grid (the banner's own rows just
// name the two sessions in plain text) — so this scopes to that region, not
// the whole page, and looks for the marker there specifically.
function gridHtml(html: string): string {
  const start = html.indexOf("<h2>Weekly timetable</h2>");
  if (start === -1) return "";
  const end = html.indexOf("<h2>My Courses</h2>", start);
  return html.slice(start, end === -1 ? undefined : end);
}

// True when the given session id's row in the weekly grid carries the ⚠
// indicator — the indicator sits just before the session's own text in the
// markup, ahead of its delete-form action.
function hasClashIndicator(html: string, id: string): boolean {
  const grid = gridHtml(html);
  const marker = deleteMarker(id);
  const markerIndex = grid.indexOf(marker);
  if (markerIndex === -1) throw new Error(`expected session ${id} in the weekly grid`);
  return grid.slice(Math.max(0, markerIndex - 400), markerIndex).includes("clash-indicator");
}

describe("POST /api/clashes/acknowledge — rejects invalid requests", () => {
  it("rejects a pair naming a session id that doesn't exist", async () => {
    const a = await createSession(OTHER_SESSION);
    const res = await acknowledge(a, "999999999");
    expect(res.status).toBe(400);
    await post(deleteMarker(a));
  });

  it("rejects a pair that does not currently clash", async () => {
    const a = await createSession(CLASH_SESSION);
    const b = await createSession(OTHER_SESSION);
    const res = await acknowledge(a, b);
    expect(res.status).toBe(400);
    await post(deleteMarker(a));
    await post(deleteMarker(b));
  });

  it("rejects missing or non-integer session ids", async () => {
    const res = await post("/api/clashes/acknowledge", new URLSearchParams({ session_a_id: "abc", session_b_id: "1" }));
    expect(res.status).toBe(400);
  });

  it("rejects naming the same session twice", async () => {
    const a = await createSession(OTHER_SESSION);
    const res = await acknowledge(a, a);
    expect(res.status).toBe(400);
    await post(deleteMarker(a));
  });
});

describe("POST /api/clashes/acknowledge — accepted pair", () => {
  it("acknowledging a pair drops it from the top alert but keeps the ⚠ indicator, while other clashes and the underlying overlap stay unaffected", async () => {
    // A and B are two copies of the same catalogue session, so they clash
    // with an identical window.
    const a = await createSession(CLASH_SESSION);
    const b = await createSession(CLASH_SESSION);

    let html = await getPage();
    expect(bannerHtml(html)).toContain(deleteMarker(a));
    expect(bannerHtml(html)).toContain(deleteMarker(b));
    expect(hasClashIndicator(html, a)).toBe(true);
    expect(hasClashIndicator(html, b)).toBe(true);

    // Keep both.
    const ackRes = await acknowledge(a, b);
    expect(ackRes.status).toBe(303);

    html = await getPage();
    expect(html).toContain(deleteMarker(a));
    expect(html).toContain(deleteMarker(b));
    // No longer in the top alert...
    expect(bannerHtml(html)).not.toContain(deleteMarker(a));
    expect(bannerHtml(html)).not.toContain(deleteMarker(b));
    // ...but the underlying clash is still true, so the ⚠ stays.
    expect(hasClashIndicator(html, a)).toBe(true);
    expect(hasClashIndicator(html, b)).toBe(true);

    // A duplicate "Keep both" click is a harmless no-op.
    const ackAgain = await acknowledge(a, b);
    expect(ackAgain.status).toBe(303);
    html = await getPage();
    expect(bannerHtml(html)).not.toContain(deleteMarker(a));
    expect(bannerHtml(html)).not.toContain(deleteMarker(b));

    // A third copy, C, clashes with both A and B (identical window) but its
    // pairs with them are brand new, unacknowledged pairs.
    const c = await createSession(CLASH_SESSION);

    html = await getPage();
    // Acknowledging (A, B) doesn't blanket-suppress A or B's involvement in
    // any OTHER unresolved pair: C's arrival makes (A, C) and (B, C) both
    // unacknowledged, so A, B and C all show up in the alert again — even
    // though (A, B) itself still doesn't reappear as its own alert entry.
    expect(bannerHtml(html)).toContain(deleteMarker(a));
    expect(bannerHtml(html)).toContain(deleteMarker(b));
    expect(bannerHtml(html)).toContain(deleteMarker(c));

    const ackRes2 = await acknowledge(a, c);
    expect(ackRes2.status).toBe(303);
    const ackRes3 = await acknowledge(b, c);
    expect(ackRes3.status).toBe(303);
    html = await getPage();
    expect(bannerHtml(html)).not.toContain(deleteMarker(a));
    expect(bannerHtml(html)).not.toContain(deleteMarker(b));
    expect(bannerHtml(html)).not.toContain(deleteMarker(c));

    // Deleting A cascades: its acknowledgements (with B and with C) are gone
    // along with it (nothing left for them to refer to). B and C still
    // clash with each other, and that pair is still separately acknowledged,
    // so neither reappears in the alert, and both remain in the timetable.
    const delRes = await post(deleteMarker(a));
    expect(delRes.status).toBe(303);

    html = await getPage();
    expect(html).not.toContain(deleteMarker(a));
    expect(html).toContain(deleteMarker(b));
    expect(html).toContain(deleteMarker(c));
    expect(bannerHtml(html)).not.toContain(deleteMarker(b));
    expect(bannerHtml(html)).not.toContain(deleteMarker(c));
    expect(hasClashIndicator(html, b)).toBe(true);
    expect(hasClashIndicator(html, c)).toBe(true);

    await post(deleteMarker(b));
    await post(deleteMarker(c));
  });
});
