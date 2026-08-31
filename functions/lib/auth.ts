import type { Env } from "./env";

interface AccessJwtPayload {
  email?: string;
  aud?: string[] | string;
  exp?: number;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

let cachedJwks: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

function base64UrlDecode(input: string): Uint8Array {
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeToString(input: string): string {
  return new TextDecoder().decode(base64UrlDecode(input));
}

async function getJwks(teamDomain: string): Promise<Jwk[]> {
  const now = Date.now();
  if (cachedJwks && now - cachedJwks.fetchedAt < JWKS_TTL_MS) {
    return cachedJwks.keys;
  }
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Failed to fetch Access certs: ${res.status}`);
  const data = await res.json<{ keys: Jwk[] }>();
  cachedJwks = { keys: data.keys, fetchedAt: now };
  return data.keys;
}

async function importJwk(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/**
 * Verifies a Cloudflare Access JWT's signature, audience, and expiry.
 * Returns the authenticated email on success, or null on any failure —
 * never throws, so a malformed/forged token always fails closed.
 */
export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  aud: string,
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { kid?: string; alg?: string };
  let payload: AccessJwtPayload;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64));
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audience.includes(aud)) return null;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  if (!payload.email) return null;

  try {
    const jwks = await getJwks(teamDomain);
    const jwk = jwks.find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const key = await importJwk(jwk);
    const signature = base64UrlDecode(signatureB64);
    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signedData);
    if (!valid) return null;
  } catch {
    return null;
  }

  return payload.email;
}

function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * Resolves the Access-authenticated email for a request, or null if unauthenticated.
 * Falls back to env.DEV_BYPASS_EMAIL only when ACCESS_TEAM_DOMAIN/ACCESS_AUD are
 * unset — i.e. only in local dev, since a deployed environment must configure both.
 */
export async function resolveAccessEmail(request: Request, env: Env): Promise<string | null> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;

  if (!teamDomain || !aud) {
    return env.DEV_BYPASS_EMAIL ?? null;
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion") ?? getCookie(request, "CF_Authorization");
  if (!token) return null;

  return verifyAccessJwt(token, teamDomain, aud);
}
