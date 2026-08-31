import type { UserRow } from "./db/types";

/** Returns a 403 Response if the user isn't admin, else null (caller proceeds). */
export function requireAdmin(user: UserRow): Response | null {
  if (user.role !== "admin") {
    return Response.json({ error: "Forbidden: admin only" }, { status: 403 });
  }
  return null;
}
