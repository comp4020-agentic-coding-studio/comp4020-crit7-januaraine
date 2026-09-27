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

// One submission of the form can name more than one weekday (a checkbox
// group, not a single <select>): "day_of_week" may appear several times in
// the FormData. Each valid day becomes its own persisted row — the schema
// and findClashes() stay one-row-per-day, so a Monday+Wednesday lecture is
// just two ordinary sessions, never a new "multi-day session" concept.
function requiredDays(form: FormData): number[] | null {
  const raw = form.getAll("day_of_week");
  if (raw.length === 0) return null;

  const days: number[] = [];
  for (const value of raw) {
    if (typeof value !== "string") return null;
    const day = Number(value);
    if (!Number.isInteger(day) || day < MIN_DAY || day > MAX_DAY) return null;
    days.push(day);
  }
  return [...new Set(days)].sort((a, b) => a - b);
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

  const days = requiredDays(form);
  if (days === null) {
    return badRequest(`at least one day_of_week is required, each an integer between ${MIN_DAY} and ${MAX_DAY}`);
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

  // Snapshot before inserting so a new session never clashes with itself —
  // and since every day in `days` is distinct, sessions created in this same
  // submission never clash with each other either (findClashes requires a
  // matching dayOfWeek), so comparing only against this one snapshot is enough.
  const existing = listSessions();
  const created = days.map((dayOfWeek) => addSession({ courseCode, activity, dayOfWeek, startMinutes, endMinutes }));

  const clashesByCreatedId = new Map<number, number[]>();
  for (const session of created) {
    const clashes = findClashes(session, existing);
    if (clashes.length > 0) {
      clashesByCreatedId.set(session.id, clashes.map((s) => s.id));
    }
  }

  const params = new URLSearchParams({ added: created.map((s) => String(s.id)).join(",") });
  const allClashIds = [...new Set([...clashesByCreatedId.values()].flat())];
  if (allClashIds.length > 0) {
    params.set("clashesWith", allClashIds.map(String).join(","));
    // Per-created-session detail so the UI can report exactly which day's
    // session clashed with what, rather than one flat list across all days.
    params.set(
      "clashDetail",
      [...clashesByCreatedId.entries()].map(([id, clashIds]) => `${id}:${clashIds.join(",")}`).join(";"),
    );
  }
  return redirect(`/?${params.toString()}`, 303);
};
