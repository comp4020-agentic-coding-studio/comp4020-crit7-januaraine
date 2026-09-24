import type { APIRoute } from "astro";
import { findClashes } from "../../lib/clashes";
import { addSession, listSessions } from "../../lib/db";

const MIN_DAY = 0;
const MAX_DAY = 6;
const MINUTES_PER_DAY = 24 * 60;

function requiredString(form: FormData, key: string, maxLength: number): string | null {
  const raw = form.get(key);
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value.slice(0, maxLength) : null;
}

function requiredInt(form: FormData, key: string): number | null {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}

// The write half of the timetable flow: a plain HTML form (once the UI
// exists) POSTs here, the session is validated and saved, and every
// existing session it clashes with is reported back so the UI can render a
// clash banner — see docs/mvp-plan.md sections C and E. Every field is
// re-validated server-side; the client's <input> constraints are only a
// convenience, never trusted.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();

  const courseCode = requiredString(form, "course_code", 40);
  if (courseCode === null) return badRequest("course_code is required");

  const activity = requiredString(form, "activity", 40);
  if (activity === null) return badRequest("activity is required");

  const dayOfWeek = requiredInt(form, "day_of_week");
  if (dayOfWeek === null || dayOfWeek < MIN_DAY || dayOfWeek > MAX_DAY) {
    return badRequest(`day_of_week must be an integer between ${MIN_DAY} and ${MAX_DAY}`);
  }

  const startMinutes = requiredInt(form, "start_minutes");
  if (startMinutes === null || startMinutes < 0 || startMinutes >= MINUTES_PER_DAY) {
    return badRequest(`start_minutes must be an integer between 0 and ${MINUTES_PER_DAY - 1}`);
  }

  const endMinutes = requiredInt(form, "end_minutes");
  if (endMinutes === null || endMinutes <= 0 || endMinutes > MINUTES_PER_DAY) {
    return badRequest(`end_minutes must be an integer between 1 and ${MINUTES_PER_DAY}`);
  }

  if (endMinutes <= startMinutes) {
    return badRequest("end_minutes must be greater than start_minutes");
  }

  // Snapshot before inserting so the new session never clashes with itself.
  const existing = listSessions();
  const created = addSession({ courseCode, activity, dayOfWeek, startMinutes, endMinutes });
  const clashes = findClashes(created, existing);

  const params = new URLSearchParams({ added: String(created.id) });
  if (clashes.length > 0) {
    params.set("clashesWith", clashes.map((session) => String(session.id)).join(","));
  }
  return redirect(`/?${params.toString()}`, 303);
};
