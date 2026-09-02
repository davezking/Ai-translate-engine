import type { Env } from "./env";

const PBKDF2_ITERATIONS = 100_000;
const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

/** Hashes a password for storage in users.password_hash: "pbkdf2:<iterations>:<saltB64url>:<hashB64url>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toBase64Url(salt)}:${toBase64Url(hash)}`;
}

/**
 * Verifies a password against a stored hash. Never throws — a malformed or
 * unrecognized hash (e.g. a NULL password_hash coerced to "") fails closed
 * rather than rejecting the request with a 500.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split(":");
    if (scheme !== "pbkdf2" || !saltB64 || !hashB64) return false;
    const iterations = Number(iterStr);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    const salt = fromBase64Url(saltB64);
    const expected = fromBase64Url(hashB64);
    const actual = await pbkdf2(password, salt, iterations);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

interface SessionPayload {
  email: string;
  exp: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Signs a session token binding an email to an expiry, using env.SESSION_SECRET. */
export async function createSessionToken(
  email: string,
  secret: string,
  ttlMs: number = SESSION_TTL_MS,
): Promise<string> {
  const payload: SessionPayload = { email, exp: Date.now() + ttlMs };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verifies a session token's HMAC signature and expiry. Returns the bound
 * email on success, or null on any failure — never throws, so a
 * malformed/forged/expired token always fails closed.
 */
export async function verifySessionToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;

  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signatureB64) as BufferSource,
      new TextEncoder().encode(payloadB64),
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payloadB64)),
    ) as SessionPayload;
    if (!payload.email || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload.email;
  } catch {
    return null;
  }
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
 * Resolves the session-authenticated email from the session cookie, or null.
 * Returns null outright when SESSION_SECRET isn't configured, so this path
 * is inert unless a deployment has explicitly opted into password auth.
 */
export async function resolveSessionEmail(request: Request, env: Env): Promise<string | null> {
  if (!env.SESSION_SECRET) return null;
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return verifySessionToken(token, env.SESSION_SECRET);
}

/**
 * Set-Cookie value for a fresh session. Marked Secure, so it is only ever
 * sent back over HTTPS — the local-dev path uses DEV_BYPASS_EMAIL instead,
 * never this cookie, so that's not a loss for local http:// testing.
 */
export function sessionCookieHeader(token: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
