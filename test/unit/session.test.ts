import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  resolveSessionEmail,
  sessionCookieHeader,
  clearSessionCookieHeader,
} from "../../functions/lib/session";
import type { Env } from "../../functions/lib/env";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://test.local/api/x", { headers });
}

function env(secret?: string): Env {
  return { SESSION_SECRET: secret } as unknown as Env;
}

describe("password hashing", () => {
  it("verifies a correct password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash (different salt) each time", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it.each([
    ["", "empty string"],
    ["not-a-hash", "garbage"],
    ["bcrypt:10:abc:def", "unrecognized scheme"],
    ["pbkdf2:notanumber:abc:def", "non-numeric iterations"],
  ])("fails closed on a malformed stored hash (%s)", async (stored) => {
    expect(await verifyPassword("anything", stored)).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips: a token signed with a secret verifies with the same secret", async () => {
    const token = await createSessionToken("user@example.com", "s3cret");
    expect(await verifySessionToken(token, "s3cret")).toBe("user@example.com");
  });

  it("rejects a token verified against the wrong secret", async () => {
    const token = await createSessionToken("user@example.com", "s3cret");
    expect(await verifySessionToken(token, "other-secret")).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken("user@example.com", "s3cret", -1);
    expect(await verifySessionToken(token, "s3cret")).toBeNull();
  });

  it("rejects a tampered payload even with a valid-looking signature segment", async () => {
    const token = await createSessionToken("user@example.com", "s3cret");
    const [, sig] = token.split(".");
    const forgedPayload = btoa(JSON.stringify({ email: "attacker@example.com", exp: Date.now() + 999_999 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifySessionToken(`${forgedPayload}.${sig}`, "s3cret")).toBeNull();
  });

  it.each([["not-a-token"], ["a.b.c"], [""]])("rejects malformed token %s", async (token) => {
    expect(await verifySessionToken(token, "s3cret")).toBeNull();
  });
});

describe("resolveSessionEmail", () => {
  it("returns null when SESSION_SECRET is unset, even with a well-formed cookie", async () => {
    const token = await createSessionToken("user@example.com", "s3cret");
    const request = req({ Cookie: `session=${token}` });
    expect(await resolveSessionEmail(request, env(undefined))).toBeNull();
  });

  it("returns null when there is no session cookie", async () => {
    expect(await resolveSessionEmail(req(), env("s3cret"))).toBeNull();
  });

  it("returns the email for a valid session cookie", async () => {
    const token = await createSessionToken("user@example.com", "s3cret");
    const request = req({ Cookie: `other=1; session=${token}` });
    expect(await resolveSessionEmail(request, env("s3cret"))).toBe("user@example.com");
  });

  it("returns null for a forged cookie", async () => {
    const request = req({ Cookie: "session=forged.token" });
    expect(await resolveSessionEmail(request, env("s3cret"))).toBeNull();
  });
});

describe("cookie headers", () => {
  it("sets HttpOnly, Secure, SameSite=Lax on the session cookie", () => {
    const header = sessionCookieHeader("tok");
    expect(header).toMatch(/^session=tok;/);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
  });

  it("clears the cookie with Max-Age=0", () => {
    expect(clearSessionCookieHeader()).toContain("Max-Age=0");
  });
});
