import type { APIRoute } from "astro";
import { deleteSession } from "../../../../lib/db";

// The resolve half of the clash flow: remove one side of a conflict (or any
// session outright). No-JS-friendly: a plain form POST, then a 303 redirect
// back to "/" so the page re-renders from SQLite.
//
// The submitting form carries a `mode` field mirroring the page's current
// `?mode=edit` state (see index.astro's editMode), so this redirect can
// return the user to the same Edit/Done state they deleted from — deletion
// is a change to `sessions`, not to `isEditing`, and the two must not be
// coupled through a redirect that silently drops the query param.
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = Number(params.id);
  if (Number.isInteger(id)) {
    deleteSession(id);
  }
  let mode: FormDataEntryValue | null = null;
  try {
    mode = (await request.formData()).get("mode");
  } catch {
    // No body (e.g. a bare POST with no form fields) — fall back to "/".
  }
  return redirect(mode === "edit" ? "/?mode=edit" : "/", 303);
};
