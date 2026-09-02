import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { onRequestPost as onLogin } from "../../functions/api/auth/login";
import { onRequestPost as onLogout } from "../../functions/api/auth/logout";
import { onRequestPut as onSetPassword } from "../../functions/api/admin/password";
import { setPasswordHash, getUserCredentialsByEmail } from "../../functions/lib/db/users";
import { hashPassword } from "../../functions/lib/session";
import { createTestDb, type TestDb } from "../helpers/d1";
import { testEnv } from "../helpers/env";
import { ADMIN, REVIEWER, call } from "../helpers/route";
import type { Env } from "../../functions/lib/env";

const ADMIN_EMAIL = "yegnatop10@gmail.com"; // seeded by migrations/0002
const REVIEWER_EMAIL = "itzone04@gmail.com";

let db: TestDb;
let env: Env;
beforeEach(() => {
  db = createTestDb();
  env = testEnv({ DB: db.d1 });
});
afterEach(() => db.close());

function postJson(handler: typeof onLogin, body: unknown, extraEnv: Partial<Env> = {}) {
  const request = new Request("https://test.local/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  const context = {
    request,
    env: { ...env, ...extraEnv },
    params: {},
    data: {},
    next: async () => new Response(null, { status: 404 }),
    waitUntil: () => {},
    passThroughOnException: () => {},
    functionPath: "/api/auth/login",
  } as unknown as Parameters<typeof onLogin>[0];
  return handler(context);
}

describe("POST /api/auth/login", () => {
  it("501s when SESSION_SECRET is not configured", async () => {
    await setPasswordHash(db.d1, ADMIN_EMAIL, await hashPassword("correct-password"));
    const res = await postJson(
      onLogin,
      { email: ADMIN_EMAIL, password: "correct-password" },
      { SESSION_SECRET: undefined },
    );
    expect(res.status).toBe(501);
  });

  it("logs in with the right password and sets a session cookie", async () => {
    await setPasswordHash(db.d1, ADMIN_EMAIL, await hashPassword("correct-password"));
    const res = await postJson(
      onLogin,
      { email: ADMIN_EMAIL, password: "correct-password" },
      { SESSION_SECRET: "s3cret" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; role: string };
    expect(body).toEqual({ email: ADMIN_EMAIL, role: "admin" });
    const cookie = res.headers.get("Set-Cookie");
    expect(cookie).toMatch(/^session=/);
    expect(cookie).toContain("HttpOnly");
  });

  it("401s on a wrong password", async () => {
    await setPasswordHash(db.d1, ADMIN_EMAIL, await hashPassword("correct-password"));
    const res = await postJson(
      onLogin,
      { email: ADMIN_EMAIL, password: "wrong-password" },
      { SESSION_SECRET: "s3cret" },
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("401s on an unknown email", async () => {
    const res = await postJson(
      onLogin,
      { email: "nobody@example.com", password: "whatever" },
      { SESSION_SECRET: "s3cret" },
    );
    expect(res.status).toBe(401);
  });

  it("401s a known user with no password set yet", async () => {
    const res = await postJson(
      onLogin,
      { email: REVIEWER_EMAIL, password: "whatever" },
      { SESSION_SECRET: "s3cret" },
    );
    expect(res.status).toBe(401);
  });

  it.each([
    [{ email: ADMIN_EMAIL }, "missing password"],
    [{ password: "x" }, "missing email"],
    [{}, "missing both"],
  ] as const)("400s on %s (%s)", async (body, _label) => {
    const res = await postJson(onLogin, body, { SESSION_SECRET: "s3cret" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    const request = new Request("https://test.local/api/auth/logout", { method: "POST" });
    const context = {
      request,
      env,
      params: {},
      data: {},
      next: async () => new Response(null, { status: 404 }),
      waitUntil: () => {},
      passThroughOnException: () => {},
      functionPath: "/api/auth/logout",
    } as unknown as Parameters<typeof onLogout>[0];
    const res = await onLogout(context);
    expect(res.status).toBe(204);
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});

describe("PUT /api/admin/password", () => {
  it("403s a non-admin", async () => {
    const res = await call(onSetPassword, {
      env,
      user: REVIEWER,
      body: { email: REVIEWER_EMAIL, password: "new-password-1" },
    });
    expect(res.status).toBe(403);
  });

  it("lets an admin set another user's password, which then logs in", async () => {
    const res = await call(onSetPassword, {
      env,
      user: ADMIN,
      body: { email: REVIEWER_EMAIL, password: "new-password-1" },
    });
    expect(res.status).toBe(200);

    const creds = await getUserCredentialsByEmail(db.d1, REVIEWER_EMAIL);
    expect(creds?.password_hash).toBeTruthy();

    const loginRes = await postJson(
      onLogin,
      { email: REVIEWER_EMAIL, password: "new-password-1" },
      { SESSION_SECRET: "s3cret" },
    );
    expect(loginRes.status).toBe(200);
  });

  it("404s for an unknown email", async () => {
    const res = await call(onSetPassword, {
      env,
      user: ADMIN,
      body: { email: "nobody@example.com", password: "new-password-1" },
    });
    expect(res.status).toBe(404);
  });

  it("400s a too-short password", async () => {
    const res = await call(onSetPassword, {
      env,
      user: ADMIN,
      body: { email: REVIEWER_EMAIL, password: "short" },
    });
    expect(res.status).toBe(400);
  });
});
