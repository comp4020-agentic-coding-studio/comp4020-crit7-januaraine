import { describe, it } from "vitest";

// Turns spec line 3 ("the core flow persists across a reload — create
// something, and it's still there") into a real check, once the domain is
// chosen. Follow spec/guestbook.test.ts's shape: POST to create, then fetch
// the page (or a fresh GET) and assert the created thing is present.
//
// This starts red on purpose — there's no prototype yet. Replace this test
// with the real one once you've agreed a plan for which ANU system, and
// which single flow, this covers.
describe("core flow persistence (spec line 3)", () => {
  it("TODO: replace with a real create-then-reload test for your chosen flow", () => {
    throw new Error(
      "Not written yet — decide the ANU system and core flow with the agent, " +
        "then write a guestbook.test.ts-style create/reload test here.",
    );
  });
});
