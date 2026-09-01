import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { DatabaseSync as DatabaseSyncClass } from "node:sqlite";

// Vite's builtin-module list predates node:sqlite, so a static import is
// rewritten to a bare "sqlite" specifier and fails to resolve. Loading it
// through createRequire keeps it a real Node builtin; the type-only import
// above is erased before Vite ever sees it, so the typings still apply.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: typeof DatabaseSyncClass;
};
type DatabaseSync = InstanceType<typeof DatabaseSyncClass>;

const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

/**
 * D1 bindings only accept these primitives; the codebase binds `null` for
 * absent values, and booleans only ever reach SQLite as 0/1 columns.
 */
function toSqliteParam(value: unknown): null | number | bigint | string | Uint8Array {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "string") {
    return value;
  }
  if (value instanceof Uint8Array) return value;
  throw new TypeError(`Unsupported D1 bind parameter: ${String(value)}`);
}

/** node:sqlite hands back null-prototype rows; plain objects compare cleanly in assertions. */
function plain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

class TestStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): TestStatement {
    return new TestStatement(this.db, this.sql, params);
  }

  private get bound(): (null | number | bigint | string | Uint8Array)[] {
    return this.params.map(toSqliteParam);
  }

  /** Executes synchronously — used by batch(), which must stay inside one transaction. */
  execSync(): { results: unknown[]; success: true; meta: Record<string, unknown> } {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...this.bound) as unknown[];
    return { results: rows.map((r) => plain(r)), success: true, meta: {} };
  }

  async first<T>(): Promise<T | null> {
    const { results } = this.execSync();
    return results.length > 0 ? (results[0] as T) : null;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    const { results } = this.execSync();
    return { results: results as T[], success: true, meta: {} };
  }

  async run(): Promise<{ results: unknown[]; success: true; meta: Record<string, unknown> }> {
    return this.execSync();
  }
}

class TestD1 {
  constructor(readonly raw: DatabaseSync) {}

  prepare(sql: string): TestStatement {
    return new TestStatement(this.raw, sql);
  }

  /**
   * D1's batch() is one transaction — the property publishPromptVersion relies
   * on so a losing concurrent publish rolls back whole instead of leaving a
   * dangling current_version_id. Modelled faithfully here, rollback included.
   */
  async batch(statements: TestStatement[]): Promise<unknown[]> {
    this.raw.exec("BEGIN");
    try {
      const results = statements.map((s) => s.execSync());
      this.raw.exec("COMMIT");
      return results;
    } catch (err) {
      this.raw.exec("ROLLBACK");
      throw err;
    }
  }
}

export interface TestDb {
  /** Structurally compatible with the D1Database surface the codebase uses. */
  d1: D1Database;
  raw: DatabaseSync;
  close(): void;
}

/**
 * An in-memory SQLite database with every migration in migrations/ applied, in
 * order, exposed behind the slice of the D1Database API this codebase calls
 * (prepare/bind/first/all/run/batch). Running the real SQL means the tests
 * cover the real schema — CHECK and UNIQUE constraints and foreign keys
 * included — rather than a hand-written stand-in that can drift from it.
 */
export function createTestDb(): TestDb {
  const raw = new DatabaseSync(":memory:");
  // D1 enforces foreign keys; plain SQLite does not unless asked.
  raw.exec("PRAGMA foreign_keys = ON");

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    raw.exec(readFileSync(MIGRATIONS_DIR + file, "utf8"));
  }

  return {
    d1: new TestD1(raw) as unknown as D1Database,
    raw,
    close: () => raw.close(),
  };
}
