import type { SQLiteBunDatabase } from "drizzle-orm/bun-sqlite";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { runtimeKind } from "../runtime";

export type SqliteBinding = bigint | number | string | Uint8Array | null;

export interface SqliteRunResult {
  readonly changes: number | bigint;
  readonly lastInsertRowid: number | bigint;
}

export interface SqliteStatement<
  TRow = unknown,
  TBindings extends ReadonlyArray<SqliteBinding> = ReadonlyArray<SqliteBinding>,
> {
  readonly all: (...bindings: TBindings) => Array<TRow>;
  readonly get: (...bindings: TBindings) => TRow | null;
  readonly run: (...bindings: TBindings) => SqliteRunResult;
}

export interface SqliteDatabase {
  readonly close: () => void;
  readonly prepare: <
    TRow = unknown,
    TBindings extends ReadonlyArray<SqliteBinding> = ReadonlyArray<SqliteBinding>,
  >(
    sql: string
  ) => SqliteStatement<TRow, TBindings>;
  readonly query: <
    TRow = unknown,
    TBindings extends ReadonlyArray<SqliteBinding> = ReadonlyArray<SqliteBinding>,
  >(
    sql: string
  ) => SqliteStatement<TRow, TBindings>;
  readonly run: (sql: string, bindings?: ReadonlyArray<SqliteBinding>) => void;
  readonly transaction: <A>(operation: () => A) => () => A;
}

export type DrizzleDatabase = SQLiteBunDatabase | NodeSQLiteDatabase;

export interface OpenedDatabase {
  readonly db: SqliteDatabase;
  readonly drizzle: DrizzleDatabase;
}

const openBunDatabase = async (dbPath: string): Promise<OpenedDatabase> => {
  const [{ Database }, { drizzle }] = await Promise.all([
    import("bun:sqlite"),
    import("drizzle-orm/bun-sqlite"),
  ]);
  const client = new Database(dbPath, { create: true });
  const prepare = <
    TRow,
    TBindings extends ReadonlyArray<SqliteBinding> = ReadonlyArray<SqliteBinding>,
  >(
    sql: string
  ): SqliteStatement<TRow, TBindings> => {
    const statement = client.query(sql);
    return {
      // SAFETY: Callers specify the row decoded from their static SQL statement.
      all: (...bindings) => statement.all(...bindings) as Array<TRow>,
      // SAFETY: Callers specify the row decoded from their static SQL statement.
      get: (...bindings) => statement.get(...bindings) as TRow | null,
      run: (...bindings) => statement.run(...bindings),
    };
  };
  const db: SqliteDatabase = {
    close: () => client.close(),
    prepare,
    query: prepare,
    run: (sql, bindings) => {
      if (bindings === undefined) {
        client.run(sql);
        return;
      }
      client.run(sql, [...bindings]);
    },
    transaction: (operation) => client.transaction(operation),
  };
  return {
    db,
    drizzle: drizzle({ client }),
  };
};

const openNodeDatabase = async (dbPath: string): Promise<OpenedDatabase> => {
  const [{ DatabaseSync }, { drizzle }] = await Promise.all([
    import("node:sqlite"),
    import("drizzle-orm/node-sqlite"),
  ]);
  const client = new DatabaseSync(dbPath);
  const prepare = <
    TRow,
    TBindings extends ReadonlyArray<SqliteBinding> = ReadonlyArray<SqliteBinding>,
  >(
    sql: string
  ): SqliteStatement<TRow, TBindings> => {
    const statement = client.prepare(sql);
    return {
      // SAFETY: Callers specify the row decoded from their static SQL statement.
      all: (...bindings) => statement.all(...bindings) as Array<TRow>,
      // SAFETY: Callers specify the row decoded from their static SQL statement.
      get: (...bindings) => (statement.get(...bindings) as TRow | undefined) ?? null,
      run: (...bindings) => statement.run(...bindings),
    };
  };
  const db: SqliteDatabase = {
    close: () => client.close(),
    prepare,
    query: prepare,
    run: (sql, bindings) => {
      if (bindings === undefined) {
        client.exec(sql);
        return;
      }
      client.prepare(sql).run(...bindings);
    },
    transaction: (operation) => () => {
      client.exec("BEGIN");
      try {
        const result = operation();
        client.exec("COMMIT");
        return result;
      } catch (error) {
        client.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, drizzle: drizzle({ client }) };
};

export const openDatabase = (dbPath: string): Promise<OpenedDatabase> =>
  runtimeKind === "bun" ? openBunDatabase(dbPath) : openNodeDatabase(dbPath);
