import type { APIRoute } from "astro";
import { addAllSessionsForOffering } from "../../../../lib/db";

// Mirrors remove.ts: a route-param POST with a plain 303 redirect back to
// "/" so the page re-renders from SQLite — same pattern, same permissive
// handling of a malformed offeringId (silently no-ops rather than 400ing),
// since neither route takes a form body to validate.
export const POST: APIRoute = async ({ params, redirect }) => {
  const offeringId = Number(params.offeringId);
  if (Number.isInteger(offeringId)) {
    addAllSessionsForOffering(offeringId);
  }
  return redirect("/", 303);
};
