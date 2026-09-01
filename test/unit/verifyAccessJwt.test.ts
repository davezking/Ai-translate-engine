import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateTestKey, signToken, signTokenWithKid, type TestKey } from "../helpers/jwt";

const TEAM = "my-team.cloudflareaccess.com";
const AUD = "aud-tag";
const CERTS_URL = `https://${TEAM}/cdn-cgi/access/certs`;

let keyA: TestKey;
let keyB: TestKey;

beforeAll(async () => {
  // Key generation is the slow part; two keys cover the rotation cases.
  [keyA, keyB] = await Promise.all([generateTestKey("kid-a"), generateTestKey("kid-b")]);
});

afterEach(() => vi.unstubAllGlobals());

/**
 * The JWKS cache is module state, so each test needs a fresh copy of the
 * module to start from a cold cache.
 */
async function freshVerifier() {
  vi.resetModules();
  const mod = await import("../../functions/lib/auth");
  return mod.verifyAccessJwt;
}

/** Serves a JWKS containing `keys`, counting how many times it is fetched. */
function stubCerts(keys: TestKey[], opts: { status?: number } = {}) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(String(url));
    if (opts.status && opts.status !== 200) return new Response("nope", { status: opts.status });
    return new Response(JSON.stringify({ keys: keys.map((k) => k.jwk) }), { status: 200 });
  });
  return calls;
}

function claims(over: Partial<Parameters<typeof signToken>[1]> = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    email: "reviewer@example.com",
    aud: [AUD],
    iss: `https://${TEAM}`,
    exp: nowSec + 3600,
    ...over,
  };
}

describe("a valid token", () => {
  it("verifies and returns the email", async () => {
    stubCerts([keyA]);
    const verify = await freshVerifier();
    const token = await signToken(keyA, claims());

    await expect(verify(token, TEAM, AUD)).resolves.toBe("reviewer@example.com");
  });

  it("accepts aud as a bare string as well as an array", async () => {
    stubCerts([keyA]);
    const verify = await freshVerifier();
    const token = await signToken(keyA, claims({ aud: AUD }));

    await expect(verify(token, TEAM, AUD)).resolves.toBe("reviewer@example.com");
  });

  it("reuses the cached JWKS across requests", async () => {
    const calls = stubCerts([keyA]);
    const verify = await freshVerifier();
    const token = await signToken(keyA, claims());

    await verify(token, TEAM, AUD);
    await verify(token, TEAM, AUD);
    await verify(token, TEAM, AUD);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(CERTS_URL);
  });
});

describe("issuer", () => {
  it("rejects a token issued by a different team", async () => {
    stubCerts([keyA]);
    const verify = await freshVerifier();
    const token = await signToken(keyA, claims({ iss: "https://other-team.cloudflareaccess.com" }));

    await expect(verify(token, TEAM, AUD)).resolves.toBeNull();
  });

  it("rejects a token with no issuer at all", async () => {
    stubCerts([keyA]);
    const verify = await freshVerifier();
    const token = await signToken(keyA, claims({ iss: undefined }));

    await expect(verify(token, TEAM, AUD)).resolves.toBeNull();
  });

  it.each([`https://${TEAM}`, `${TEAM}/`, `  ${TEAM}  `, `HTTPS://${TEAM}`])(
    "still accepts a valid token when the team domain is configured as %p",
    async (configured) => {
      // A slightly-off env var must not silently reject every real token.
      stubCerts([keyA]);
      const verify = await freshVerifier();
      const token = await signToken(keyA, claims());

      await expect(verify(token, configured, AUD)).resolves.toBe("reviewer@example.com");
    },
  );
});

describe("validity window", () => {
  it("rejects an expired token", async () => {
    stubCerts([keyA]);
    const verify = await freshVerifier();
    const token = await signToken(keyA, claims({ exp: Math.floor(Date.now() / 1000) - 10 }));

    await expect(verify(token, TEAM, AUD)).resolves.toBeNull();
  });

  it("rejects a token with no expiry", async () => {
    stubCerts([keyA]);
    const verify = await freshVerifier();
    const token = await signToken(keyA, claims({ exp: undefined }));

    await expect(verify(token, TEAM, AUD)).resolves.toBeNull();
  });

  it("rejects a token that is not valid yet", async () => {
    stubCerts([keyA]);
    const verify = await freshVerifier();
    const token = await signToken(keyA, claims({ nbf: Math.floor(Date.now() / 1000) + 600 }));

    await expect(verify(token, TEAM, AUD)).resolves.toBeNull();
  });

  it("tolerates a small amount of clock skew on nbf", async () => {
    stubCerts([keyA]);
    const verify = await freshVerifier();
    const token = await signToken(keyA, claims({ nbf: Math.floor(Date.now() / 1000) + 5 }));

    await expect(verify(token, TEAM, AUD)).resolves.toBe("reviewer@example.com");
  });
});

describe("signature", () => {
  it("rejects a token signed by a key that is not in the JWKS", async () => {
    stubCerts([keyA]);
    const verify = await freshVerifier();
    // Signed by B, but claiming A's kid — the kid resolves, the signature does not.
    const token = await signTokenWithKid(keyB, keyA.kid, claims());

    await expect(verify(token, TEAM, AUD)).resolves.toBeNull();
  });

  it("rejects a tampered payload", async () => {
    stubCerts([keyA]);
    const verify = await freshVerifier();
    const token = await signToken(keyA, claims());
    const [h, , s] = token.split(".");
    const forged = btoa(JSON.stringify(claims({ email: "attacker@example.com" })))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await expect(verify(`${h}.${forged}.${s}`, TEAM, AUD)).resolves.toBeNull();
  });

  it("returns null rather than throwing when the certs endpoint is down", async () => {
    stubCerts([keyA], { status: 503 });
    const verify = await freshVerifier();
    const token = await signToken(keyA, claims());

    await expect(verify(token, TEAM, AUD)).resolves.toBeNull();
  });
});

describe("signing-key rotation", () => {
  it("refetches the JWKS when the token's kid is not in the cache", async () => {
    // Prime the cache with the old key only, then present a token signed by
    // the new one — what happens the moment Access rotates its keys.
    let served = [keyA];
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ keys: served.map((k) => k.jwk) }), { status: 200 });
    });

    const verify = await freshVerifier();
    await verify(await signToken(keyA, claims()), TEAM, AUD);
    expect(calls).toHaveLength(1);

    served = [keyB];
    const rotated = await signToken(keyB, claims());

    await expect(verify(rotated, TEAM, AUD)).resolves.toBe("reviewer@example.com");
    expect(calls).toHaveLength(2);
  });

  it("does not refetch once per request for an unknown kid", async () => {
    // A forged token with a random kid must not turn every request into a
    // fetch of the certs endpoint.
    const calls = stubCerts([keyA]);
    const verify = await freshVerifier();
    const bogus = await signTokenWithKid(keyB, "kid-does-not-exist", claims());

    for (let i = 0; i < 5; i++) {
      await expect(verify(bogus, TEAM, AUD)).resolves.toBeNull();
    }

    // One initial fetch plus at most one forced refresh inside the floor.
    expect(calls.length).toBeLessThanOrEqual(2);
  });
});
