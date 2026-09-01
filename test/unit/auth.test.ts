import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAccessEmail } from "../../functions/lib/auth";
import type { Env } from "../../functions/lib/env";

afterEach(() => vi.restoreAllMocks());

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

function env(parts: Partial<Env> = {}): Env {
  return parts as Env;
}

describe("the local-dev bypass", () => {
  it("authenticates as the bypass email on localhost when Access is unconfigured", async () => {
    const email = await resolveAccessEmail(
      req("http://localhost:8788/api/articles"),
      env({ DEV_BYPASS_EMAIL: "dev@example.com" }),
    );
    expect(email).toBe("dev@example.com");
  });

  it.each([
    "http://127.0.0.1:8788/api/articles",
    "http://[::1]:8788/api/articles",
    "http://app.localhost:8788/api/articles",
  ])("accepts %s as local", async (url) => {
    expect(await resolveAccessEmail(req(url), env({ DEV_BYPASS_EMAIL: "dev@example.com" }))).toBe(
      "dev@example.com",
    );
  });

  it.each([
    "https://ai-translate-engine.pages.dev/api/articles",
    "https://abc123.ai-translate-engine.pages.dev/api/articles",
    "https://translate.example.com/api/articles",
    "https://localhost.example.com/api/articles",
    "https://evil.com/api/articles",
  ])("refuses the bypass on %s — a deployment with no auth must fail closed", async (url) => {
    // The scenario this guards: a deployed environment (a Pages preview, say)
    // that never received ACCESS_TEAM_DOMAIN/ACCESS_AUD but does have
    // DEV_BYPASS_EMAIL set. Before the host check that served every /api/*
    // route to the internet as an admin, silently.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const email = await resolveAccessEmail(
      req(url),
      env({ DEV_BYPASS_EMAIL: "admin@example.com" }),
    );

    expect(email).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0][0])).toMatch(/ACCESS_TEAM_DOMAIN/);
  });

  it("stays closed on localhost when no bypass email is set", async () => {
    expect(await resolveAccessEmail(req("http://localhost:8788/api/x"), env({}))).toBeNull();
  });

  it("does not log when there is no bypass email to refuse", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await resolveAccessEmail(req("https://translate.example.com/api/x"), env({}));
    expect(spy).not.toHaveBeenCalled();
  });

  it("is unreachable once Access is configured, even on localhost", async () => {
    const email = await resolveAccessEmail(
      req("http://localhost:8788/api/x"),
      env({
        ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
        ACCESS_AUD: "aud-tag",
        DEV_BYPASS_EMAIL: "dev@example.com",
      }),
    );
    expect(email).toBeNull();
  });

  it("requires both Access vars, not just one", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const partial of [
      { ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com" },
      { ACCESS_AUD: "aud-tag" },
    ]) {
      expect(
        await resolveAccessEmail(
          req("https://translate.example.com/api/x"),
          env({ ...partial, DEV_BYPASS_EMAIL: "admin@example.com" }),
        ),
      ).toBeNull();
    }
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("token handling when Access is configured", () => {
  const configured = env({
    ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
    ACCESS_AUD: "aud-tag",
  });

  it("returns null when no token is presented", async () => {
    expect(
      await resolveAccessEmail(req("https://translate.example.com/api/x"), configured),
    ).toBeNull();
  });

  it.each([
    ["not-a-jwt", "a token with the wrong shape"],
    ["a.b", "a token with too few segments"],
    ["!!!.!!!.!!!", "a token that is not valid base64"],
  ])("rejects %s (%s)", async (token) => {
    const request = req("https://translate.example.com/api/x", {
      "Cf-Access-Jwt-Assertion": token,
    });
    expect(await resolveAccessEmail(request, configured)).toBeNull();
  });

  it("rejects a well-formed but unsigned token", async () => {
    // alg none with a valid-looking payload — must never be honoured.
    const b64 = (o: unknown) =>
      btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const token = `${b64({ alg: "none", kid: "k" })}.${b64({
      email: "attacker@example.com",
      aud: ["aud-tag"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.`;

    const request = req("https://translate.example.com/api/x", {
      "Cf-Access-Jwt-Assertion": token,
    });
    expect(await resolveAccessEmail(request, configured)).toBeNull();
  });

  it("reads the token from the CF_Authorization cookie as well as the header", async () => {
    // Both paths reach the same verifier, so an invalid token fails either way.
    const request = req("https://translate.example.com/api/x", {
      Cookie: "other=1; CF_Authorization=not-a-jwt",
    });
    expect(await resolveAccessEmail(request, configured)).toBeNull();
  });
});
