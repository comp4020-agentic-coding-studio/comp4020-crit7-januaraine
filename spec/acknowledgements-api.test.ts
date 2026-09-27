import { describe, expect, it } from "vitest";
import { inject } from "vitest";

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

// Every other spec file's fixtures live on days 0-4 at various times (see
// spec/sessions-api.test.ts, spec/crit-7.test.ts) — all these tests share
// one server and one database (spec/global-setup.ts), so this file sticks
// to day 5 (Saturday, unused elsewhere) to avoid an unrelated fixture
// accidentally clashing with a session created here.
const session = (overrides: Record<string, string> = {}) =>
  new URLSearchParams({
    course_code: "COMP4020",
    activity: "Lecture",
    day_of_week: "5",
    start_minutes: "60",
    end_minutes: "120",
    ...overrides,
  });

const createSession = async (overrides: Record<string, string> = {}): Promise<string> => {
  const res = await post("/api/sessions", session(overrides));
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

// The banner ("Unresolved schedule conflicts") and the day-grouped
// timetable list are two distinct regions of the same page; a course code
// can legitimately appear in both at once, so assertions about "is this
// pair still in the top alert" must be scoped to the banner region only.
function bannerHtml(html: string): string {
  const start = html.indexOf("<h2>Unresolved schedule conflicts</h2>");
  if (start === -1) return "";
  const end = html.indexOf("<h2>Add a session</h2>", start);
  return html.slice(start, end === -1 ? undefined : end);
}

function timetableHtml(html: string): string {
  const start = html.indexOf("Your timetable");
  return start === -1 ? "" : html.slice(start);
}

// True when the given course code's row in the timetable list (not the
// banner) carries the ⚠ indicator.
function hasClashIndicator(html: string, courseCode: string): boolean {
  const table = timetableHtml(html);
  const rowIndex = table.indexOf(courseCode);
  if (rowIndex === -1) throw new Error(`expected ${courseCode} in the timetable`);
  return table.slice(Math.max(0, rowIndex - 300), rowIndex).includes("clash-indicator");
}

describe("POST /api/clashes/acknowledge — rejects invalid requests", () => {
  it("rejects a pair naming a session id that doesn't exist", async () => {
    const a = await createSession({ course_code: `ACK-MISSING-${Date.now()}` });
    const res = await acknowledge(a, "999999999");
    expect(res.status).toBe(400);
  });

  it("rejects a pair that does not currently clash", async () => {
    const suffix = String(process.hrtime.bigint());
    const a = await createSession({
      course_code: `ACK-NOCLASH-A-${suffix}`,
      day_of_week: "5",
      start_minutes: "240",
      end_minutes: "300",
    });
    const b = await createSession({
      course_code: `ACK-NOCLASH-B-${suffix}`,
      day_of_week: "5",
      start_minutes: "360",
      end_minutes: "420",
    });
    const res = await acknowledge(a, b);
    expect(res.status).toBe(400);
  });

  it("rejects missing or non-integer session ids", async () => {
    const res = await post("/api/clashes/acknowledge", new URLSearchParams({ session_a_id: "abc", session_b_id: "1" }));
    expect(res.status).toBe(400);
  });

  it("rejects naming the same session twice", async () => {
    const a = await createSession({ course_code: `ACK-SAME-${Date.now()}` });
    const res = await acknowledge(a, a);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/clashes/acknowledge — accepted pair", () => {
  it("acknowledging a pair drops it from the top alert but keeps the ⚠ indicator, while other clashes and the underlying overlap stay unaffected", async () => {
    const suffix = String(process.hrtime.bigint());
    const courseA = `ACKOK-A-${suffix}`;
    const courseB = `ACKOK-B-${suffix}`;
    const courseC = `ACKOK-C-${suffix}`;

    // A and B clash on Saturday 15:00-16:00 / 15:30-16:30.
    const a = await createSession({ course_code: courseA, day_of_week: "5", start_minutes: "900", end_minutes: "960" });
    const b = await createSession({ course_code: courseB, day_of_week: "5", start_minutes: "930", end_minutes: "990" });

    let html = await getPage();
    expect(bannerHtml(html)).toContain(courseA);
    expect(bannerHtml(html)).toContain(courseB);
    expect(hasClashIndicator(html, courseA)).toBe(true);
    expect(hasClashIndicator(html, courseB)).toBe(true);

    // Keep both.
    const ackRes = await acknowledge(a, b);
    expect(ackRes.status).toBe(303);

    html = await getPage();
    expect(html).toContain(courseA);
    expect(html).toContain(courseB);
    // No longer in the top alert...
    expect(bannerHtml(html)).not.toContain(courseA);
    expect(bannerHtml(html)).not.toContain(courseB);
    // ...but the underlying clash is still true, so the ⚠ stays.
    expect(hasClashIndicator(html, courseA)).toBe(true);
    expect(hasClashIndicator(html, courseB)).toBe(true);

    // A duplicate "Keep both" click is a harmless no-op.
    const ackAgain = await acknowledge(a, b);
    expect(ackAgain.status).toBe(303);
    html = await getPage();
    expect(bannerHtml(html)).not.toContain(courseA);
    expect(bannerHtml(html)).not.toContain(courseB);

    // A third session C clashes with B only (Saturday 16:00-17:00 overlaps
    // B's 15:30-16:30, but not A's 15:00-16:00).
    await createSession({ course_code: courseC, day_of_week: "5", start_minutes: "960", end_minutes: "1020" });

    html = await getPage();
    // (B, C) is unacknowledged and shows up in the alert...
    expect(bannerHtml(html)).toContain(courseB);
    expect(bannerHtml(html)).toContain(courseC);
    // ...but the already-acknowledged (A, B) still doesn't reappear.
    expect(bannerHtml(html)).not.toContain(courseA);

    // Deleting A cascades: its acknowledgement with B is gone along with it
    // (nothing left for it to refer to), and B/C are unaffected.
    const delRes = await post(`/api/sessions/${a}/delete`);
    expect(delRes.status).toBe(303);

    html = await getPage();
    expect(html).not.toContain(courseA);
    expect(html).toContain(courseB);
    expect(html).toContain(courseC);
    expect(bannerHtml(html)).toContain(courseB);
    expect(bannerHtml(html)).toContain(courseC);
    expect(hasClashIndicator(html, courseB)).toBe(true);
    expect(hasClashIndicator(html, courseC)).toBe(true);
  });
});
