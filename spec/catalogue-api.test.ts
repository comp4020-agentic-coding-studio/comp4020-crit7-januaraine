import { describe, expect, inject, it } from "vitest";
import { seedClassSessionId, seedOfferingId } from "../src/lib/catalogue-seed";

// HTTP-level acceptance criteria for the course-selection half of the flow
// (docs/mvp-plan.md's course-catalogue revision): browse the seeded
// catalogue, select a course into "My Courses," add one of its sessions,
// then remove the course and confirm both it and its session are gone.
// Drives the same running built server as spec/sessions-api.test.ts,
// spec/acknowledgements-api.test.ts and spec/crit-7.test.ts — this file
// reserves COMP1130's Tutorial (Wednesday), a session no other spec file's
// fixtures touch and which doesn't naturally clash with anything, since this
// file isn't testing clash behaviour.
const baseUrl = inject("baseUrl");

const post = (path: string, body?: URLSearchParams) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin: baseUrl },
    body,
    redirect: "manual",
  });

const OFFERING_ID = seedOfferingId("COMP1130");
const CLASS_SESSION_ID = seedClassSessionId("COMP1130", "Tutorial", 2); // Wed 14:00-15:00

const getPage = async (): Promise<string> => {
  const res = await fetch(baseUrl);
  expect(res.status).toBe(200);
  return res.text();
};

describe("course browsing and selection", () => {
  it("lists seeded courses (real ANU codes/titles) in the browse section before any are selected", async () => {
    const html = await getPage();
    expect(html).toContain("COMP1130");
    expect(html).toContain("Programming as Problem Solving (Advanced)");
  });

  it("rejects a select with a missing offering_id", async () => {
    const res = await post("/api/courses/select", new URLSearchParams());
    expect(res.status).toBe(400);
  });

  it("select -> add a session -> remove course: the course and its session both disappear together", async () => {
    const select = await post("/api/courses/select", new URLSearchParams({ offering_id: String(OFFERING_ID) }));
    expect(select.status).toBe(303);
    const selectLocation = select.headers.get("location") ?? "";
    expect(selectLocation.startsWith("/")).toBe(true);
    expect(new URL(selectLocation, baseUrl).searchParams.get("selectedOffering")).toBe(String(OFFERING_ID));

    let html = await getPage();
    // Now in "My Courses", offering a "Remove course" action.
    expect(html).toContain(`/api/courses/${OFFERING_ID}/remove`);
    // Its Tutorial session is offered as an addable session, naming its
    // catalogue id.
    expect(html).toContain(`value="${CLASS_SESSION_ID}"`);

    const add = await post("/api/sessions", new URLSearchParams({ class_session_id: String(CLASS_SESSION_ID) }));
    expect(add.status).toBe(303);
    const location = add.headers.get("location");
    if (!location) throw new Error("expected a redirect with a Location header");
    const addedId = new URL(location, baseUrl).searchParams.get("added");
    if (!addedId) throw new Error("expected an added session id");

    html = await getPage();
    expect(html).toContain(`/api/sessions/${addedId}/delete`);

    // A second select of the same course is a harmless no-op (idempotent
    // membership, matching acknowledgeClash's own existence-is-the-fact
    // pattern) — it doesn't create a duplicate "My Courses" entry.
    const selectAgain = await post("/api/courses/select", new URLSearchParams({ offering_id: String(OFFERING_ID) }));
    expect(selectAgain.status).toBe(303);
    html = await getPage();
    expect(html.split(`/api/courses/${OFFERING_ID}/remove`).length - 1).toBe(1);

    const remove = await post(`/api/courses/${OFFERING_ID}/remove`, undefined);
    expect(remove.status).toBe(303);
    expect(remove.headers.get("location")).toBe("/");

    html = await getPage();
    // The course is back in "Browse courses," and its session is gone from
    // the timetable along with it.
    expect(html).not.toContain(`/api/courses/${OFFERING_ID}/remove`);
    expect(html).not.toContain(`/api/sessions/${addedId}/delete`);
  });
});
