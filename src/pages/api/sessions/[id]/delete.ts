import type { APIRoute } from "astro";
import { deleteSession } from "../../../../lib/db";

// The resolve half of the clash flow: remove one side of a conflict (or any
// session outright). No-JS-friendly, same shape as /api/messages: a plain
// form POST, then a 303 redirect back to "/" so the page re-renders from
// SQLite.
export const POST: APIRoute = async ({ params, redirect }) => {
  const id = Number(params.id);
  if (Number.isInteger(id)) {
    deleteSession(id);
  }
  return redirect("/", 303);
};
