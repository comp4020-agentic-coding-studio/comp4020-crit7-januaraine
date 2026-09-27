import type { APIRoute } from "astro";
import { selectOffering } from "../../../lib/db";

function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}

// The course-browser half of the flow: a plain form POSTs which offering to
// add to "My Courses." Selecting an already-selected offering is a harmless
// no-op (selectOffering's primary key is offeringId), so this route never
// needs to check first.
//
// The redirect's `selectedOffering` hint is informational only, for the
// client-side motion layer to animate the newly-appeared My Courses card —
// same pattern as the `added` hint on src/pages/api/sessions.ts.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const raw = form.get("offering_id");
  const offeringId = typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isInteger(offeringId)) return badRequest("offering_id is required");

  selectOffering(offeringId);
  return redirect(`/?${new URLSearchParams({ selectedOffering: String(offeringId) }).toString()}`, 303);
};
