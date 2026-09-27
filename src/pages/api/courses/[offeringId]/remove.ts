import type { APIRoute } from "astro";
import { removeSelectedOffering } from "../../../../lib/db";

// Mirrors src/pages/api/sessions/[id]/delete.ts: a plain form POST, then a
// 303 redirect back to "/" so the page re-renders from SQLite. Removing a
// course also removes any of its sessions already in the student's
// timetable — see removeSelectedOffering's own comment in src/lib/db.ts.
export const POST: APIRoute = async ({ params, redirect }) => {
  const offeringId = Number(params.offeringId);
  if (Number.isInteger(offeringId)) {
    removeSelectedOffering(offeringId);
  }
  return redirect("/", 303);
};
