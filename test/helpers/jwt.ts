/**
 * Mints real RS256 tokens and a matching JWKS, so the Access verifier can be
 * tested through its actual signature path rather than around it.
 */

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeSegment(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export interface TestKey {
  kid: string;
  privateKey: CryptoKey;
  /** The public half, in the shape Cloudflare's /cdn-cgi/access/certs returns. */
  jwk: { kid: string; kty: string; n: string; e: string };
}

export async function generateTestKey(kid: string): Promise<TestKey> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;

  const exported = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as {
    kty: string;
    n: string;
    e: string;
  };

  return {
    kid,
    privateKey: pair.privateKey,
    jwk: { kid, kty: exported.kty, n: exported.n, e: exported.e },
  };
}

export interface TokenClaims {
  email?: string;
  aud?: string[] | string;
  iss?: string;
  exp?: number;
  nbf?: number;
}

export async function signToken(key: TestKey, claims: TokenClaims): Promise<string> {
  const header = encodeSegment({ alg: "RS256", kid: key.kid, typ: "JWT" });
  const payload = encodeSegment(claims);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

/** Signs a token whose header claims a kid that is not the signing key's. */
export async function signTokenWithKid(
  key: TestKey,
  kid: string,
  claims: TokenClaims,
): Promise<string> {
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodeSegment(claims);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}
