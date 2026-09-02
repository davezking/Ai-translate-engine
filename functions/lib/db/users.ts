import type { UserRow } from "./types";

export async function getUserByEmail(d1: D1Database, email: string): Promise<UserRow | null> {
  const row = await d1
    .prepare("SELECT id, email, role FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  return row ?? null;
}

export async function listUsers(d1: D1Database): Promise<UserRow[]> {
  const { results } = await d1.prepare("SELECT id, email, role FROM users").all<UserRow>();
  return results;
}

export interface UserCredentials extends UserRow {
  password_hash: string | null;
}

/** Includes password_hash — only for the login route, never returned to a client as-is. */
export async function getUserCredentialsByEmail(
  d1: D1Database,
  email: string,
): Promise<UserCredentials | null> {
  const row = await d1
    .prepare("SELECT id, email, role, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<UserCredentials>();
  return row ?? null;
}

/** Caller checks the user exists first (e.g. via getUserByEmail) — this never reports whether a row matched. */
export async function setPasswordHash(
  d1: D1Database,
  email: string,
  passwordHash: string,
): Promise<void> {
  await d1.prepare("UPDATE users SET password_hash = ? WHERE email = ?").bind(passwordHash, email).run();
}
