import type { APIRoute } from "astro";
import { addAllSessionsForOffering } from "../../../../lib/db";

// Mirrors remove.ts: a route-param POST with a plain 303 redirect back to
// "/" so the page re-renders from SQLite — same pattern, same permissive
// handling of a malformed offeringId (silently no-ops rather than 400ing),
// since neither route takes a form body to validate.
//
// The redirect carries an `added` hint (the ids of sessions actually
// created this call) purely so the client-side motion layer knows which
// timetable cards are new — mirrors the existing convention in
// src/pages/api/sessions.ts. It's informational only: the page always
// re-renders the real persisted state regardless of this param.
export const POST: APIRoute = async ({ params, redirect }) => {
  const offeringId = Number(params.offeringId);
  let createdIds: number[] = [];
  if (Number.isInteger(offeringId)) {
    createdIds = addAllSessionsForOffering(offeringId).map((s) => s.id);
  }
  if (createdIds.length === 0) return redirect("/", 303);
  return redirect(`/?${new URLSearchParams({ added: createdIds.join(",") }).toString()}`, 303);
};
