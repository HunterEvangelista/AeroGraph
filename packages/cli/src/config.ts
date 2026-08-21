/**
 * CLI Configuration
 * Manages global AeroGraph project configuration
 */
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { ConfigError, WorkspaceAlreadyExistsError, WorkspaceNotFoundError } from "@aerograph/core";
import { Context, Effect, Layer, Schema } from "effect";

// ============================================================================
// Constants
// ============================================================================

export const AEROGRAPH_DIR = ".aerograph";
export const LEGACY_WORKSPACE_DIR = ".kioku";
export const CONFIG_FILE = "config.json";
export const DB_FILE = "aerograph.db";
export const PROJECTS_DIR = "projects";
export const AEROGRAPH_HOME_ENV = "AEROGRAPH_HOME";
export const REGISTRY_VERSION = 1;

// ============================================================================
// Config Types
// ============================================================================

export interface AeroGraphConfig {
  version: number;
  createdAt: string;
  repoPath?: string;
}

export interface AeroGraphProject {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
}

export interface AeroGraphRegistry {
  version: number;
  projects: ReadonlyArray<AeroGraphProject>;
}

export interface WorkspaceInfo {
  projectId: string;
  projectName: string;
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
  readonly findRoot: (
    startPath?: string
  ) => Effect.Effect<string, WorkspaceNotFoundError | ConfigError>;

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

const AeroGraphProjectSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  rootPath: Schema.String,
  createdAt: Schema.String,
});

const AeroGraphRegistrySchema = Schema.Struct({
  version: Schema.Literal(REGISTRY_VERSION),
  projects: Schema.Array(AeroGraphProjectSchema),
});

const getAeroGraphHome = (): string => {
  const override = process.env[AEROGRAPH_HOME_ENV]?.trim();
  return resolve(override || join(homedir(), AEROGRAPH_DIR));
};

const getConfigPath = (): string => join(getAeroGraphHome(), CONFIG_FILE);

const normalizeExistingPath = (path: string): string => realpathSync.native(resolve(path));

const decodeRegistry = (content: string): AeroGraphRegistry =>
  Schema.decodeUnknownSync(AeroGraphRegistrySchema)(JSON.parse(content));

const emptyRegistry = (): AeroGraphRegistry => ({
  version: REGISTRY_VERSION,
  projects: [],
});

const readRegistry = (): AeroGraphRegistry => {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return emptyRegistry();
  }
  return decodeRegistry(readFileSync(configPath, "utf8"));
};

const writeRegistry = (registry: AeroGraphRegistry): void => {
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, JSON.stringify(registry, null, 2));
    renameSync(temporaryPath, configPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
};

const containsPath = (rootPath: string, candidatePath: string): boolean => {
  const childPath = relative(rootPath, candidatePath);
  return childPath === "" || (!childPath.startsWith("..") && !isAbsolute(childPath));
};

const findProject = (
  registry: AeroGraphRegistry,
  startPath: string
): AeroGraphProject | undefined =>
  registry.projects
    .filter((project) => containsPath(project.rootPath, startPath))
    .sort((left, right) => right.rootPath.length - left.rootPath.length)[0];

const projectDbPath = (projectId: string): string =>
  join(getAeroGraphHome(), PROJECTS_DIR, projectId, DB_FILE);

const toWorkspaceInfo = (project: AeroGraphProject): WorkspaceInfo => ({
  projectId: project.id,
  projectName: project.name,
  rootPath: project.rootPath,
  configPath: getConfigPath(),
  dbPath: projectDbPath(project.id),
  config: {
    version: REGISTRY_VERSION,
    createdAt: project.createdAt,
    repoPath: project.rootPath,
  },
});

const readRegistryEffect = Effect.try({
  try: readRegistry,
  catch: (error) =>
    new ConfigError({
      message: `Failed to read AeroGraph registry: ${error instanceof Error ? error.message : String(error)}`,
      path: getConfigPath(),
      cause: error,
    }),
});

export const ConfigServiceLive = Layer.succeed(ConfigServiceTag, {
  init: (path?: string) =>
    Effect.gen(function* () {
      const rootPath = normalizeExistingPath(path ?? process.cwd());
      const legacyAeroGraphPath = join(rootPath, AEROGRAPH_DIR);
      const legacyWorkspacePath = join(rootPath, LEGACY_WORKSPACE_DIR);
      const registry = yield* readRegistryEffect;

      const existingProject = registry.projects.find((project) => project.rootPath === rootPath);
      if (existingProject) {
        return yield* new WorkspaceAlreadyExistsError({
          path: rootPath,
          message: `AeroGraph project '${existingProject.name}' is already registered for ${rootPath}`,
        });
      }

      // Repository-local databases are never opened or migrated during normal initialization.
      // Refusing initialization prevents a new global graph from diverging beside retained data.
      if (existsSync(legacyAeroGraphPath)) {
        return yield* new ConfigError({
          path: legacyAeroGraphPath,
          message: `Repository-local AeroGraph storage found at ${legacyAeroGraphPath}. Preserve it and run the verified AERO-72 cutover before registering this project.`,
        });
      }

      if (existsSync(legacyWorkspacePath)) {
        return yield* new ConfigError({
          path: legacyWorkspacePath,
          message: `Legacy Kioku workspace found at ${legacyWorkspacePath}. Preserve it and run the verified storage cutover before registering this project.`,
        });
      }

      const project: AeroGraphProject = {
        id: randomUUID(),
        name: basename(rootPath),
        rootPath,
        createdAt: new Date().toISOString(),
      };

      yield* Effect.try({
        try: () => {
          mkdirSync(dirname(projectDbPath(project.id)), { recursive: true });
          writeRegistry({
            ...registry,
            projects: [...registry.projects, project],
          });
        },
        catch: (error) =>
          new ConfigError({
            message: `Failed to register AeroGraph project: ${error instanceof Error ? error.message : String(error)}`,
            path: getConfigPath(),
            cause: error,
          }),
      });

      return toWorkspaceInfo(project);
    }),

  load: (startPath?: string) =>
    Effect.gen(function* () {
      const searchPath = normalizeExistingPath(startPath ?? process.cwd());
      const registry = yield* readRegistryEffect;
      const project = findProject(registry, searchPath);

      if (!project) {
        return yield* new WorkspaceNotFoundError({
          path: searchPath,
          message: `No registered AeroGraph project contains ${searchPath}. Run 'aerograph init' at the project root.`,
        });
      }

      return toWorkspaceInfo(project);
    }),

  exists: (path?: string) =>
    Effect.sync(() => {
      try {
        const searchPath = normalizeExistingPath(path ?? process.cwd());
        return findProject(readRegistry(), searchPath) !== undefined;
      } catch {
        return false;
      }
    }),

  findRoot: (startPath?: string) =>
    Effect.gen(function* () {
      const searchPath = normalizeExistingPath(startPath ?? process.cwd());
      const registry = yield* readRegistryEffect;
      const project = findProject(registry, searchPath);

      if (!project) {
        return yield* new WorkspaceNotFoundError({
          path: searchPath,
          message: `No registered AeroGraph project contains ${searchPath}. Run 'aerograph init' at the project root.`,
        });
      }

      return project.rootPath;
    }),

  update: (updates: Partial<AeroGraphConfig>) =>
    Effect.gen(function* () {
      const searchPath = normalizeExistingPath(process.cwd());
      const registry = yield* readRegistryEffect;
      const project = findProject(registry, searchPath);

      if (!project) {
        return yield* new WorkspaceNotFoundError({
          path: searchPath,
          message: `No registered AeroGraph project contains ${searchPath}. Run 'aerograph init' at the project root.`,
        });
      }

      const existingConfig = toWorkspaceInfo(project).config;
      const newConfig = { ...existingConfig, ...updates };
      const updatedProject: AeroGraphProject = {
        ...project,
        rootPath: normalizeExistingPath(newConfig.repoPath ?? project.rootPath),
        createdAt: newConfig.createdAt,
      };

      yield* Effect.try({
        try: () =>
          writeRegistry({
            ...registry,
            projects: registry.projects.map((candidate) =>
              candidate.id === project.id ? updatedProject : candidate
            ),
          }),
        catch: (error) =>
          new ConfigError({
            message: `Failed to update AeroGraph registry: ${error instanceof Error ? error.message : String(error)}`,
            path: getConfigPath(),
            cause: error,
          }),
      });

      return newConfig;
    }),
} satisfies ConfigService);
