import { describe, expect, it } from "vitest";
import { requireAdmin } from "../../functions/lib/requireAdmin";
import type { UserRow } from "../../functions/lib/db/types";

const admin: UserRow = { id: "usr_admin", email: "a@x.com", role: "admin" };
const reviewer: UserRow = { id: "usr_reviewer", email: "r@x.com", role: "reviewer" };

describe("requireAdmin", () => {
  it("lets an admin through", () => {
    expect(requireAdmin(admin)).toBeNull();
  });

  it("returns a 403 for a reviewer", async () => {
    const res = requireAdmin(reviewer);
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "Forbidden: admin only" });
  });

  it("denies any role that is not exactly admin", () => {
    // Role comes from D1, never from a hardcoded email list — anything that is
    // not the admin role is denied, including a value the schema would reject.
    expect(requireAdmin({ ...reviewer, role: "Admin" } as unknown as UserRow)).not.toBeNull();
    expect(requireAdmin({ ...reviewer, role: "" } as unknown as UserRow)).not.toBeNull();
  });
});
