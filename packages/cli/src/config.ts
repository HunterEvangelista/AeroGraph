/**
 * CLI Configuration
 * Manages global AeroGraph project configuration
 */
import { spawnSync } from "node:child_process";
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
  gitCommonDir?: string | undefined;
}

export interface AeroGraphRegistry {
  version: number;
  projects: ReadonlyArray<AeroGraphProject>;
}

export type ProjectResolutionMethod = "registered_path" | "git_common_dir";

export interface WorkspaceInfo {
  projectId: string;
  projectName: string;
  rootPath: string;
  configPath: string;
  dbPath: string;
  resolutionMethod: ProjectResolutionMethod;
  gitCommonDir?: string | undefined;
  config: AeroGraphConfig;
}

// ============================================================================
// Config Service Interface
// ============================================================================

export interface ConfigService {
  /**
   * Initialize a new AeroGraph project
   */
  readonly init: (
    path?: string
  ) => Effect.Effect<WorkspaceInfo, WorkspaceAlreadyExistsError | ConfigError>;

  /**
   * Find and load the current AeroGraph project
   */
  readonly load: (
    startPath?: string
  ) => Effect.Effect<WorkspaceInfo, WorkspaceNotFoundError | ConfigError>;

  /**
   * Check if an AeroGraph project exists
   */
  readonly exists: (path?: string) => Effect.Effect<boolean, never>;

  /**
   * Get the active project checkout root
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
  gitCommonDir: Schema.optional(Schema.String),
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

interface GitIdentity {
  rootPath: string;
  commonDir: string;
}

interface ProjectResolution {
  project: AeroGraphProject;
  rootPath: string;
  method: ProjectResolutionMethod;
}

const findGitIdentity = (path: string): GitIdentity | undefined => {
  const result = spawnSync(
    "git",
    ["-C", path, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"],
    {
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    }
  );
  if (result.status !== 0) {
    return undefined;
  }

  const [rootPath, commonDir] = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!rootPath || !commonDir) {
    return undefined;
  }

  return {
    rootPath: normalizeExistingPath(rootPath),
    commonDir: normalizeExistingPath(commonDir),
  };
};

const resolveProject = (
  registry: AeroGraphRegistry,
  startPath: string
): ProjectResolution | undefined => {
  const pathMatch = registry.projects
    .filter((project) => containsPath(project.rootPath, startPath))
    .sort((left, right) => right.rootPath.length - left.rootPath.length)[0];
  if (pathMatch) {
    return {
      project: pathMatch,
      rootPath: pathMatch.rootPath,
      method: "registered_path",
    };
  }

  const gitIdentity = findGitIdentity(startPath);
  if (!gitIdentity) {
    return undefined;
  }

  const gitMatch = registry.projects.find(
    (project) => project.gitCommonDir === gitIdentity.commonDir
  );
  if (!gitMatch) {
    return undefined;
  }

  return {
    project: gitMatch,
    rootPath: gitIdentity.rootPath,
    method: "git_common_dir",
  };
};

const projectDbPath = (projectId: string): string =>
  join(getAeroGraphHome(), PROJECTS_DIR, projectId, DB_FILE);

const toWorkspaceInfo = (
  project: AeroGraphProject,
  activeRootPath = project.rootPath,
  resolutionMethod: ProjectResolutionMethod = "registered_path"
): WorkspaceInfo => ({
  projectId: project.id,
  projectName: project.name,
  rootPath: activeRootPath,
  configPath: getConfigPath(),
  dbPath: projectDbPath(project.id),
  resolutionMethod,
  gitCommonDir: project.gitCommonDir,
  config: {
    version: REGISTRY_VERSION,
    createdAt: project.createdAt,
    repoPath: activeRootPath,
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
      const requestedPath = normalizeExistingPath(path ?? process.cwd());
      const gitIdentity = findGitIdentity(requestedPath);
      const rootPath = gitIdentity?.rootPath ?? requestedPath;
      const repositoryDatabasePath = join(rootPath, AEROGRAPH_DIR, DB_FILE);
      const registry = yield* readRegistryEffect;

      const existingProject = registry.projects.find(
        (project) =>
          project.rootPath === rootPath ||
          (gitIdentity !== undefined && project.gitCommonDir === gitIdentity.commonDir)
      );
      if (existingProject) {
        return yield* new WorkspaceAlreadyExistsError({
          path: rootPath,
          message: `AeroGraph project '${existingProject.name}' is already registered for ${rootPath}`,
        });
      }

      // Repository-local databases are never opened or migrated during normal initialization.
      // Refusing initialization prevents a new global graph from diverging beside retained data,
      // while unrelated tool directories do not prevent a project from being registered.
      if (existsSync(repositoryDatabasePath)) {
        return yield* new ConfigError({
          path: repositoryDatabasePath,
          message: `Repository-local AeroGraph database found at ${repositoryDatabasePath}. Preserve it and run the verified AERO-72 cutover before registering this project.`,
        });
      }

      const project: AeroGraphProject = {
        id: randomUUID(),
        name: basename(rootPath),
        rootPath,
        createdAt: new Date().toISOString(),
      };
      if (gitIdentity) {
        project.gitCommonDir = gitIdentity.commonDir;
      }

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
      const resolution = resolveProject(registry, searchPath);

      if (!resolution) {
        return yield* new WorkspaceNotFoundError({
          path: searchPath,
          message: `No registered AeroGraph project contains ${searchPath}. Run 'aerograph init' at the project root.`,
        });
      }

      return toWorkspaceInfo(resolution.project, resolution.rootPath, resolution.method);
    }),

  exists: (path?: string) =>
    Effect.sync(() => {
      try {
        const searchPath = normalizeExistingPath(path ?? process.cwd());
        return resolveProject(readRegistry(), searchPath) !== undefined;
      } catch {
        return false;
      }
    }),

  findRoot: (startPath?: string) =>
    Effect.gen(function* () {
      const searchPath = normalizeExistingPath(startPath ?? process.cwd());
      const registry = yield* readRegistryEffect;
      const resolution = resolveProject(registry, searchPath);

      if (!resolution) {
        return yield* new WorkspaceNotFoundError({
          path: searchPath,
          message: `No registered AeroGraph project contains ${searchPath}. Run 'aerograph init' at the project root.`,
        });
      }

      return resolution.rootPath;
    }),

  update: (updates: Partial<AeroGraphConfig>) =>
    Effect.gen(function* () {
      const searchPath = normalizeExistingPath(process.cwd());
      const registry = yield* readRegistryEffect;
      const resolution = resolveProject(registry, searchPath);

      if (!resolution) {
        return yield* new WorkspaceNotFoundError({
          path: searchPath,
          message: `No registered AeroGraph project contains ${searchPath}. Run 'aerograph init' at the project root.`,
        });
      }

      const { project } = resolution;
      const existingConfig = toWorkspaceInfo(
        project,
        resolution.rootPath,
        resolution.method
      ).config;
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
