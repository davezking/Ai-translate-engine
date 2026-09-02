#!/usr/bin/env node
// Bootstraps the first password-login password, before any admin exists who
// could call PUT /api/admin/password. Prints a `pbkdf2:<iterations>:<salt>:<hash>`
// string in the exact format functions/lib/session.ts verifies, plus the
// ready-to-run `wrangler d1 execute` command to store it.
//
// Usage: node scripts/hash-password.mjs <email> <password>

import { pbkdf2Sync, randomBytes } from "node:crypto";

const ITERATIONS = 100_000;

function toBase64Url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/hash-password.mjs <email> <password>");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const stored = `pbkdf2:${ITERATIONS}:${toBase64Url(salt)}:${toBase64Url(hash)}`;

console.log("password_hash:");
console.log(stored);
console.log("\nRun this to store it (replace ai-translate-engine-db if you renamed the database):\n");
console.log(
  `npx wrangler d1 execute ai-translate-engine-db --remote --command "UPDATE users SET password_hash = '${stored}' WHERE email = '${email.replace(/'/g, "''")}'"`,
);
