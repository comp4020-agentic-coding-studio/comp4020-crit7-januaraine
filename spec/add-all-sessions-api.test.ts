import { describe, expect, inject, it } from "vitest";
import { seedClassSessionId, seedOfferingId } from "../src/lib/catalogue-seed";

// HTTP-level acceptance criteria for the course-card "Add all sessions"
// action: it must add every session for ONE course only, never touch
// another course's sessions, never duplicate a session that's already on
// the timetable, and feed the exact same persisted-session + clash-detection
// pipeline a one-by-one "Add" would (docs: README.md's course-selection
// flow; the Add-All UI-polish pass this file was added for).
//
// Drives the same running built server as the other *-api.test.ts files —
// this file reserves the whole of COMP3600 (Lecture/Tutorial/Lab), COMP3620
// (Lecture/Tutorial/Lab), and COMP4020's Lecture, none of which any other
// spec file's fixtures touch.
const baseUrl = inject("baseUrl");

const post = (path: string, body?: URLSearchParams) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin: baseUrl },
    body,
    redirect: "manual",
  });

const getPage = async (): Promise<string> => {
  const res = await fetch(baseUrl);
  expect(res.status).toBe(200);
  return res.text();
};

// Scopes a single course card's HTML so assertions about "Add all
// sessions"/"Added" text can't accidentally match a different course card
// (every course card repeats the same button labels).
function courseCardHtml(html: string, offeringId: number): string {
  const marker = `/api/courses/${offeringId}/add-all`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) throw new Error(`course card for offering ${offeringId} not found in "My Courses"`);
  const cardStart = html.lastIndexOf('<div class="card course-card">', markerIndex);
  const nextCardStart = html.indexOf('<div class="card course-card">', cardStart + 1);
  return html.slice(cardStart, nextCardStart === -1 ? html.length : nextCardStart);
}

// Scopes the weekly timetable grid, the same region acknowledgements-api's
// gridHtml() scopes — these exact heading strings are load-bearing.
function gridHtml(html: string): string {
  const start = html.indexOf("<h2>Weekly timetable</h2>");
  const end = html.indexOf("<h2>My Courses</h2>");
  return html.slice(start, end);
}

// Scopes the unresolved-conflicts alert, the same region
// acknowledgements-api's bannerHtml() scopes.
function bannerHtml(html: string): string {
  const start = html.indexOf("<h2>Unresolved schedule conflicts</h2>");
  if (start === -1) return "";
  const end = html.indexOf("<h2>Weekly timetable</h2>");
  return html.slice(start, end);
}

// Scopes one clash-group div (a specific overlapping pair, plus its Remove/
// Keep both forms) — other spec files share this same server/database for
// the whole test run, so more than one unresolved clash-group can be on the
// page at once, and assertions about "which two sessions" must not
// accidentally read a different pair's forms.
function clashGroupHtml(html: string, containing: string): string {
  const markerIndex = html.indexOf(containing);
  if (markerIndex === -1) throw new Error(`no clash-group mentions "${containing}"`);
  const groupStart = html.lastIndexOf('<div class="clash-group">', markerIndex);
  const nextGroupStart = html.indexOf('<div class="clash-group">', groupStart + 1);
  return html.slice(groupStart, nextGroupStart === -1 ? html.length : nextGroupStart);
}

const deleteMarker = (id: string) => `/api/sessions/${id}/delete`;

const countOccurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

const COMP3600_OFFERING = seedOfferingId("COMP3600");
const COMP3600_LECTURE = seedClassSessionId("COMP3600", "Lecture", 0); // Mon 11:00-12:00
const COMP3600_TUTORIAL = seedClassSessionId("COMP3600", "Tutorial", 4); // Fri 11:00-12:00
const COMP3600_LAB = seedClassSessionId("COMP3600", "Lab", 2); // Wed 15:00-17:00

const COMP3620_OFFERING = seedOfferingId("COMP3620");
const COMP3620_TUTORIAL = seedClassSessionId("COMP3620", "Tutorial", 2); // Wed 11:00-12:00

const COMP4020_OFFERING = seedOfferingId("COMP4020");
// COMP4020's Lecture (Mon 10:00-12:00) deliberately overlaps COMP3600's
// Lecture (Mon 11:00-12:00) above — used below to prove Add-All's resulting
// conflicts surface through the normal clash banner.
const COMP4020_LECTURE = seedClassSessionId("COMP4020", "Lecture", 0);

describe("add all sessions for a course", () => {
  it("adds every session for that course only, leaving other selected courses untouched", async () => {
    const selectA = await post("/api/courses/select", new URLSearchParams({ offering_id: String(COMP3600_OFFERING) }));
    expect(selectA.status).toBe(303);
    const selectB = await post("/api/courses/select", new URLSearchParams({ offering_id: String(COMP3620_OFFERING) }));
    expect(selectB.status).toBe(303);

    let html = await getPage();
    let cardA = courseCardHtml(html, COMP3600_OFFERING);
    expect(cardA).toContain("Add all sessions");
    expect(cardA).not.toContain("All sessions added");
    expect(countOccurrences(cardA, ">Add<")).toBe(3);
    expect(countOccurrences(cardA, ">Added<")).toBe(0);
    expect(cardA).toContain(`value="${COMP3600_LECTURE}"`);
    expect(cardA).toContain(`value="${COMP3600_TUTORIAL}"`);
    expect(cardA).toContain(`value="${COMP3600_LAB}"`);

    const addAll = await post(`/api/courses/${COMP3600_OFFERING}/add-all`, undefined);
    expect(addAll.status).toBe(303);
    expect(addAll.headers.get("location")).toBe("/");

    html = await getPage();
    cardA = courseCardHtml(html, COMP3600_OFFERING);
    expect(cardA).toContain("All sessions added");
    expect(countOccurrences(cardA, ">Add<")).toBe(0);
    expect(countOccurrences(cardA, ">Added<")).toBe(3);

    // The other selected course's card is completely unaffected — no
    // cross-course leakage from the Add-All call above.
    const cardB = courseCardHtml(html, COMP3620_OFFERING);
    expect(cardB).toContain("Add all sessions");
    expect(cardB).not.toContain("All sessions added");
    expect(countOccurrences(cardB, ">Add<")).toBe(3);
    expect(countOccurrences(cardB, ">Added<")).toBe(0);

    // All three of COMP3600's sessions actually landed on the timetable —
    // exactly once each — and persisted across this fresh GET (a real
    // server round-trip, not client-only state).
    const grid = gridHtml(html);
    expect(countOccurrences(grid, "COMP3600")).toBe(3);
    expect(countOccurrences(grid, "COMP3620")).toBe(0);
  });

  it("only adds the sessions that aren't already on the timetable, without duplicating the rest", async () => {
    const addOne = await post("/api/sessions", new URLSearchParams({ class_session_id: String(COMP3620_TUTORIAL) }));
    expect(addOne.status).toBe(303);

    let html = await getPage();
    let card = courseCardHtml(html, COMP3620_OFFERING);
    expect(countOccurrences(card, ">Add<")).toBe(2);
    expect(countOccurrences(card, ">Added<")).toBe(1);

    const addAll = await post(`/api/courses/${COMP3620_OFFERING}/add-all`, undefined);
    expect(addAll.status).toBe(303);

    html = await getPage();
    card = courseCardHtml(html, COMP3620_OFFERING);
    expect(card).toContain("All sessions added");
    expect(countOccurrences(card, ">Add<")).toBe(0);
    expect(countOccurrences(card, ">Added<")).toBe(3);

    // The already-added Tutorial wasn't duplicated: exactly one delete form
    // for COMP3620's Tutorial content in the grid, not two.
    const grid = gridHtml(html);
    expect(countOccurrences(grid, "COMP3620")).toBe(3);

    // Calling add-all again is a harmless no-op — nothing left to add.
    const addAllAgain = await post(`/api/courses/${COMP3620_OFFERING}/add-all`, undefined);
    expect(addAllAgain.status).toBe(303);
    html = await getPage();
    expect(countOccurrences(gridHtml(html), "COMP3620")).toBe(3);
  });

  it("surfaces resulting conflicts through the normal unresolved-conflicts banner, resolvable with Keep both", async () => {
    const select = await post("/api/courses/select", new URLSearchParams({ offering_id: String(COMP4020_OFFERING) }));
    expect(select.status).toBe(303);

    const addAll = await post(`/api/courses/${COMP4020_OFFERING}/add-all`, undefined);
    expect(addAll.status).toBe(303);

    let html = await getPage();
    const card = courseCardHtml(html, COMP4020_OFFERING);
    expect(card).toContain("All sessions added");
    expect(card).toContain(`value="${COMP4020_LECTURE}"`);

    const group = clashGroupHtml(html, "COMP4020 Lecture");
    expect(group).toContain("COMP3600 Lecture");

    const sessionAMatch = group.match(/name="session_a_id" value="(\d+)"/);
    const sessionBMatch = group.match(/name="session_b_id" value="(\d+)"/);
    if (!sessionAMatch || !sessionBMatch) throw new Error("expected session_a_id/session_b_id in the matched clash-group");
    const sessionAId = sessionAMatch[1];
    const sessionBId = sessionBMatch[1];
    expect(group).toContain(deleteMarker(sessionAId));
    expect(group).toContain(deleteMarker(sessionBId));

    const acknowledge = await post(
      "/api/clashes/acknowledge",
      new URLSearchParams({ session_a_id: sessionAId, session_b_id: sessionBId }),
    );
    expect(acknowledge.status).toBe(303);

    html = await getPage();
    // This specific pair no longer appears in the unresolved-conflicts
    // banner — scoped, since other spec files' own unrelated unresolved
    // clashes may coexist on this shared server/database.
    expect(bannerHtml(html)).not.toContain(deleteMarker(sessionAId));
    expect(bannerHtml(html)).not.toContain(deleteMarker(sessionBId));
    // The ⚠ indicator still shows for an acknowledged clash — acknowledging
    // doesn't change whether the sessions clash, only whether it's alerted.
    expect(gridHtml(html)).toContain("clash-indicator");
  });

  it("is a harmless no-op for an offering that doesn't exist", async () => {
    const res = await post("/api/courses/999999/add-all", undefined);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
  });
});
