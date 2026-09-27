import type { APIRoute } from "astro";
import { sessionsClash } from "../../../lib/clashes";
import { acknowledgeClash, getSessionById } from "../../../lib/db";

function requiredInt(form: FormData, key: string): number | null {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}

// The "Keep both" half of the clash flow (docs/mvp-plan.md sections D/E):
// acknowledges one specific clashing pair so it drops out of the top alert,
// without touching either session or the clash itself. Takes two session
// ids — the pair — never a single session id, and never trusts the form's
// claim that the pair clashes: both sessions are re-fetched and re-checked
// with sessionsClash() here, the same way session creation already
// re-validates server-side rather than trusting the client.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();

  const sessionAId = requiredInt(form, "session_a_id");
  const sessionBId = requiredInt(form, "session_b_id");
  if (sessionAId === null || sessionBId === null) {
    return badRequest("session_a_id and session_b_id are both required");
  }
  if (sessionAId === sessionBId) {
    return badRequest("session_a_id and session_b_id must name two different sessions");
  }

  const a = getSessionById(sessionAId);
  const b = getSessionById(sessionBId);
  if (!a || !b) {
    return badRequest("both sessions must exist");
  }

  if (!sessionsClash(a, b)) {
    return badRequest("the two sessions do not currently clash");
  }

  acknowledgeClash(a.id, b.id);
  return redirect("/", 303);
};
