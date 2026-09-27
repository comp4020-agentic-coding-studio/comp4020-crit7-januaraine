import type { APIRoute } from "astro";
import { findClashes } from "../../lib/clashes";
import { addSessionFromCatalogue, listSessions } from "../../lib/db";

function requiredInt(form: FormData, key: string): number | null {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}

// The write half of the timetable flow: a plain HTML form POSTs the id of a
// catalogue session (src/lib/catalogue-seed.ts, table class_sessions) that
// the student picked from a selected course's "Available sessions" list —
// never a hand-typed course/activity/day/time, per docs/mvp-plan.md's
// course-catalogue revision. Every existing session it clashes with is
// reported back so the UI can render a clash banner — see docs/mvp-plan.md
// sections C and E. class_session_id is re-validated server-side (looked up,
// 400 if unknown); the client only ever offers ids that exist, but that's a
// convenience, never a guarantee.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();

  const classSessionId = requiredInt(form, "class_session_id");
  if (classSessionId === null) return badRequest("class_session_id is required");

  // Snapshot before inserting so a new session never clashes with itself.
  const existing = listSessions();
  const created = addSessionFromCatalogue(classSessionId);
  if (!created) return badRequest("unknown class_session_id");

  const clashes = findClashes(created, existing);

  const params = new URLSearchParams({ added: String(created.id) });
  if (clashes.length > 0) {
    const clashIds = clashes.map((s) => s.id);
    params.set("clashesWith", clashIds.join(","));
    params.set("clashDetail", `${created.id}:${clashIds.join(",")}`);
  }
  return redirect(`/?${params.toString()}`, 303);
};
