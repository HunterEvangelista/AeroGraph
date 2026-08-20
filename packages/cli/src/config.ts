/**
 * CLI Configuration
 * Manages .aerograph workspace configuration
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ConfigError, WorkspaceAlreadyExistsError, WorkspaceNotFoundError } from "@aerograph/core";
import { Context, Effect, Layer, Schema } from "effect";

// ============================================================================
// Constants
// ============================================================================

export const AEROGRAPH_DIR = ".aerograph";
export const LEGACY_WORKSPACE_DIR = ".kioku";
export const CONFIG_FILE = "config.json";
export const DB_FILE = "aerograph.db";

// ============================================================================
// Config Types
// ============================================================================

export interface AeroGraphConfig {
  version: number;
  createdAt: string;
  repoPath?: string;
}

export interface WorkspaceInfo {
  rootPath: string;
  configPath: string;
  dbPath: string;
  config: AeroGraphConfig;
}

// ============================================================================
// Config Service Interface
// ============================================================================

export interface ConfigService {
  /**
   * Initialize a new AeroGraph workspace
   */
  readonly init: (
    path?: string
  ) => Effect.Effect<WorkspaceInfo, WorkspaceAlreadyExistsError | ConfigError>;

  /**
   * Find and load the nearest AeroGraph workspace
   */
  readonly load: (
    startPath?: string
  ) => Effect.Effect<WorkspaceInfo, WorkspaceNotFoundError | ConfigError>;

  /**
   * Check if an AeroGraph workspace exists
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
    updates: Partial<AeroGraphConfig>
  ) => Effect.Effect<AeroGraphConfig, WorkspaceNotFoundError | ConfigError>;
}

export class ConfigServiceTag extends Context.Service<ConfigServiceTag, ConfigService>()(
  "ConfigService"
) {}

// ============================================================================
// Config Servpice Implementation
// ============================================================================

const AeroGraphConfigSchema = Schema.Struct({
  version: Schema.Finite,
  createdAt: Schema.String,
  repoPath: Schema.optional(Schema.String),
});

const decodeConfig = (content: string): AeroGraphConfig => {
  const config = Schema.decodeUnknownSync(AeroGraphConfigSchema)(JSON.parse(content));
  if (Schema.is(Schema.String)(config.repoPath)) {
    return { version: config.version, createdAt: config.createdAt, repoPath: config.repoPath };
  }
  return { version: config.version, createdAt: config.createdAt };
};

const findWorkspaceRoot = (startPath: string): string | null => {
  let current = resolve(startPath);

  while (current !== dirname(current)) {
    const aerographPath = join(current, AEROGRAPH_DIR);
    if (existsSync(aerographPath)) {
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
      const aerographPath = join(rootPath, AEROGRAPH_DIR);
      const legacyWorkspacePath = join(rootPath, LEGACY_WORKSPACE_DIR);
      const configPath = join(aerographPath, CONFIG_FILE);
      const dbPath = join(aerographPath, DB_FILE);

      if (existsSync(aerographPath)) {
        return yield* new WorkspaceAlreadyExistsError({
          path: rootPath,
          message: `AeroGraph workspace already exists at ${aerographPath}`,
        });
      }

      // AeroGraph never opens legacy storage. Refusing initialization prevents a second graph from
      // diverging beside data that still requires the one-time verified storage cutover.
      if (existsSync(legacyWorkspacePath)) {
        return yield* new ConfigError({
          path: legacyWorkspacePath,
          message: `Legacy Kioku workspace found at ${legacyWorkspacePath}. Preserve and migrate it to ${aerographPath} before initializing AeroGraph.`,
        });
      }

      // Create .aerograph directory
      yield* Effect.try({
        try: () => mkdirSync(aerographPath, { recursive: true }),
        catch: (error) =>
          new ConfigError({
            message: `Failed to create workspace directory: ${error instanceof Error ? error.message : String(error)}`,
            path: aerographPath,
            cause: error,
          }),
      });

      // Create config file
      const config: AeroGraphConfig = {
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
        return yield* new WorkspaceNotFoundError({
          path: searchPath,
          message: `No AeroGraph workspace found. Run 'aerograph init' to create one.`,
        });
      }

      const aerographPath = join(rootPath, AEROGRAPH_DIR);
      const configPath = join(aerographPath, CONFIG_FILE);
      const dbPath = join(aerographPath, DB_FILE);

      const config = yield* Effect.try({
        try: () => {
          const content = readFileSync(configPath, "utf-8");
          return decodeConfig(content);
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
        return yield* new WorkspaceNotFoundError({
          path: searchPath,
          message: `No AeroGraph workspace found. Run 'aerograph init' to create one.`,
        });
      }

      return rootPath;
    }),

  update: (updates: Partial<AeroGraphConfig>) =>
    Effect.gen(function* () {
      const searchPath = resolve(process.cwd());
      const rootPath = findWorkspaceRoot(searchPath);

      if (!rootPath) {
        return yield* new WorkspaceNotFoundError({
          path: searchPath,
          message: `No AeroGraph workspace found. Run 'aerograph init' to create one.`,
        });
      }

      const configPath = join(rootPath, AEROGRAPH_DIR, CONFIG_FILE);

      const existingConfig = yield* Effect.try({
        try: () => {
          const content = readFileSync(configPath, "utf-8");
          return decodeConfig(content);
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
