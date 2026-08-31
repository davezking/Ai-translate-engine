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
