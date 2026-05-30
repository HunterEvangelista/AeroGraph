/**
 * CLI Configuration
 * Manages .kioku workspace configuration
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ConfigError, WorkspaceAlreadyExistsError, WorkspaceNotFoundError } from "@kioku/core";
import { Context, Effect, Layer } from "effect";

// ============================================================================
// Constants
// ============================================================================

export const KIOKU_DIR = ".kioku";
export const CONFIG_FILE = "config.json";
export const DB_FILE = "kioku.db";

// ============================================================================
// Config Types
// ============================================================================

export interface KiokuConfig {
  version: number;
  createdAt: string;
  repoPath?: string;
}

export interface WorkspaceInfo {
  rootPath: string;
  configPath: string;
  dbPath: string;
  config: KiokuConfig;
}

// ============================================================================
// Config Service Interface
// ============================================================================

export interface ConfigService {
  /**
   * Initialize a new kioku workspace
   */
  readonly init: (
    path?: string
  ) => Effect.Effect<WorkspaceInfo, WorkspaceAlreadyExistsError | ConfigError>;

  /**
   * Find and load the nearest kioku workspace
   */
  readonly load: (
    startPath?: string
  ) => Effect.Effect<WorkspaceInfo, WorkspaceNotFoundError | ConfigError>;

  /**
   * Check if a kioku workspace exists
   */
  readonly exists: (path?: string) => Effect.Effect<boolean, never>;

  /**
   * Get the workspace root path (walks up directory tree)
   */
  readonly findRoot: (startPath?: string) => Effect.Effect<string, WorkspaceNotFoundError>;

  /**
   * Update workspace configuration
   */
  readonly update: (
    updates: Partial<KiokuConfig>
  ) => Effect.Effect<KiokuConfig, WorkspaceNotFoundError | ConfigError>;
}

// ============================================================================
// Config Service Tag
// ============================================================================

export class ConfigServiceTag extends Context.Service<ConfigServiceTag, ConfigService>()(
  "ConfigService"
) {}

// ============================================================================
// Config Service Implementation
// ============================================================================

const findWorkspaceRoot = (startPath: string): string | null => {
  let current = resolve(startPath);

  while (current !== dirname(current)) {
    const kiokuPath = join(current, KIOKU_DIR);
    if (existsSync(kiokuPath)) {
      return current;
    }
    current = dirname(current);
  }

  return null;
};

export const ConfigServiceLive = Layer.succeed(ConfigServiceTag, {
  init: (path?: string) =>
    Effect.gen(function* () {
      const rootPath = resolve(path ?? process.cwd());
      const kiokuPath = join(rootPath, KIOKU_DIR);
      const configPath = join(kiokuPath, CONFIG_FILE);
      const dbPath = join(kiokuPath, DB_FILE);

      // Check if workspace already exists
      if (existsSync(kiokuPath)) {
        return yield* Effect.fail(
          new WorkspaceAlreadyExistsError({
            path: rootPath,
            message: `Kioku workspace already exists at ${kiokuPath}`,
          })
        );
      }

      // Create .kioku directory
      yield* Effect.try({
        try: () => mkdirSync(kiokuPath, { recursive: true }),
        catch: (error) =>
          new ConfigError({
            message: `Failed to create workspace directory: ${error instanceof Error ? error.message : String(error)}`,
            path: kiokuPath,
            cause: error,
          }),
      });

      // Create config file
      const config: KiokuConfig = {
        version: 1,
        createdAt: new Date().toISOString(),
        repoPath: rootPath,
      };

      yield* Effect.try({
        try: () => writeFileSync(configPath, JSON.stringify(config, null, 2)),
        catch: (error) =>
          new ConfigError({
            message: `Failed to write config file: ${error instanceof Error ? error.message : String(error)}`,
            path: configPath,
            cause: error,
          }),
      });

      return {
        rootPath,
        configPath,
        dbPath,
        config,
      } satisfies WorkspaceInfo;
    }),

  load: (startPath?: string) =>
    Effect.gen(function* () {
      const searchPath = resolve(startPath ?? process.cwd());
      const rootPath = findWorkspaceRoot(searchPath);

      if (!rootPath) {
        return yield* Effect.fail(
          new WorkspaceNotFoundError({
            path: searchPath,
            message: `No kioku workspace found. Run 'kioku init' to create one.`,
          })
        );
      }

      const kiokuPath = join(rootPath, KIOKU_DIR);
      const configPath = join(kiokuPath, CONFIG_FILE);
      const dbPath = join(kiokuPath, DB_FILE);

      const config = yield* Effect.try({
        try: () => {
          const content = readFileSync(configPath, "utf-8");
          return JSON.parse(content) as KiokuConfig;
        },
        catch: (error) =>
          new ConfigError({
            message: `Failed to read config file: ${error instanceof Error ? error.message : String(error)}`,
            path: configPath,
            cause: error,
          }),
      });

      return {
        rootPath,
        configPath,
        dbPath,
        config,
      } satisfies WorkspaceInfo;
    }),

  exists: (path?: string) =>
    Effect.sync(() => {
      const searchPath = resolve(path ?? process.cwd());
      return findWorkspaceRoot(searchPath) !== null;
    }),

  findRoot: (startPath?: string) =>
    Effect.gen(function* () {
      const searchPath = resolve(startPath ?? process.cwd());
      const rootPath = findWorkspaceRoot(searchPath);

      if (!rootPath) {
        return yield* Effect.fail(
          new WorkspaceNotFoundError({
            path: searchPath,
            message: `No kioku workspace found. Run 'kioku init' to create one.`,
          })
        );
      }

      return rootPath;
    }),

  update: (updates: Partial<KiokuConfig>) =>
    Effect.gen(function* () {
      const searchPath = resolve(process.cwd());
      const rootPath = findWorkspaceRoot(searchPath);

      if (!rootPath) {
        return yield* Effect.fail(
          new WorkspaceNotFoundError({
            path: searchPath,
            message: `No kioku workspace found. Run 'kioku init' to create one.`,
          })
        );
      }

      const configPath = join(rootPath, KIOKU_DIR, CONFIG_FILE);

      const existingConfig = yield* Effect.try({
        try: () => {
          const content = readFileSync(configPath, "utf-8");
          return JSON.parse(content) as KiokuConfig;
        },
        catch: (error) =>
          new ConfigError({
            message: `Failed to read config file: ${error instanceof Error ? error.message : String(error)}`,
            path: configPath,
            cause: error,
          }),
      });

      const newConfig = { ...existingConfig, ...updates };

      yield* Effect.try({
        try: () => writeFileSync(configPath, JSON.stringify(newConfig, null, 2)),
        catch: (error) =>
          new ConfigError({
            message: `Failed to write config file: ${error instanceof Error ? error.message : String(error)}`,
            path: configPath,
            cause: error,
          }),
      });

      return newConfig;
    }),
} satisfies ConfigService);
