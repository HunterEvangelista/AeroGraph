import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Schema } from "effect";
import {
  AEROGRAPH_DIR,
  AEROGRAPH_HOME_ENV,
  CONFIG_FILE,
  DB_FILE,
  PROJECTS_DIR,
  REGISTRY_VERSION,
} from "../config";
import { SCHEMA_VERSION } from "../db";

interface ProjectRecord {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  gitCommonDir?: string | undefined;
}

interface Registry {
  readonly version: typeof REGISTRY_VERSION;
  readonly projects: ReadonlyArray<ProjectRecord>;
}

interface GitIdentity {
  readonly rootPath: string;
  readonly commonDir: string;
}

interface RegistrySnapshot {
  readonly content: string | undefined;
  readonly registry: Registry;
}

interface DatabaseInspection {
  readonly schemaVersion: number;
  readonly tableCounts: ReadonlyMap<string, number>;
}

interface ForeignKeyViolation {
  readonly table: string;
  readonly rowid: number | null;
  readonly parent: string;
  readonly fkid: number;
}

interface CutoverArguments {
  readonly apply: boolean;
  readonly projectPath: string;
}

const REQUIRED_TABLES = ["entities", "entity_tags", "links", "schema_meta", "tags"];

const ProjectRecordSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  rootPath: Schema.String,
  createdAt: Schema.String,
  gitCommonDir: Schema.optional(Schema.String),
});

const RegistrySchema = Schema.Struct({
  version: Schema.Literal(REGISTRY_VERSION),
  projects: Schema.Array(ProjectRecordSchema),
});

const usage = `AERO-72 repository-local graph cutover

Usage:
  bun run cutover:aero-72 -- [project-path]
  bun run cutover:aero-72 -- --apply [project-path]

The default mode verifies and previews the cutover without writing anything.
Pass --apply to create the global project database and registry entry.
The source .aerograph/aerograph.db is never changed or deleted.`;

const fail = (message: string): never => {
  throw new Error(message);
};

const normalizeExistingPath = (path: string): string => realpathSync.native(resolve(path));

const getAeroGraphHome = (): string => {
  const override = process.env[AEROGRAPH_HOME_ENV]?.trim();
  return resolve(override || join(homedir(), AEROGRAPH_DIR));
};

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
  if (result.status !== 0) return undefined;

  const [rootPath, commonDir] = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!rootPath || !commonDir) return undefined;

  return {
    rootPath: normalizeExistingPath(rootPath),
    commonDir: normalizeExistingPath(commonDir),
  };
};

const parseRegistry = (content: string, configPath: string): Registry => {
  try {
    return Schema.decodeUnknownSync(RegistrySchema)(JSON.parse(content));
  } catch {
    return fail(`Invalid or unsupported AeroGraph registry at ${configPath}`);
  }
};

const readRegistry = (configPath: string): RegistrySnapshot => {
  if (!existsSync(configPath)) {
    return {
      content: undefined,
      registry: { version: REGISTRY_VERSION, projects: [] },
    };
  }
  const content = readFileSync(configPath, "utf8");
  return { content, registry: parseRegistry(content, configPath) };
};

const quoteSqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const inspectDatabase = (path: string): DatabaseInspection => {
  const database = new Database(path, { readonly: true });
  try {
    const integrityRows = database
      .query<{ integrity_check: string }, []>("PRAGMA integrity_check")
      .all();
    if (
      integrityRows.length !== 1 ||
      integrityRows[0]?.integrity_check.toLocaleLowerCase() !== "ok"
    ) {
      return fail(`SQLite integrity check failed for ${path}`);
    }

    const foreignKeyViolations = database
      .query<ForeignKeyViolation, []>("PRAGMA foreign_key_check")
      .all();
    if (foreignKeyViolations.length > 0) {
      return fail(`SQLite foreign key check failed for ${path}`);
    }

    const tableNames = database
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map(({ name }) => name);
    for (const requiredTable of REQUIRED_TABLES) {
      if (!tableNames.includes(requiredTable)) {
        return fail(`Database at ${path} is missing required table '${requiredTable}'`);
      }
    }

    const schemaRow = database
      .query<{ value: string }, [string]>("SELECT value FROM schema_meta WHERE key = ?")
      .get("version");
    const schemaVersion = Number(schemaRow?.value);
    if (schemaVersion !== SCHEMA_VERSION) {
      return fail(
        `Database at ${path} uses schema version ${schemaRow?.value ?? "unknown"}; expected ${SCHEMA_VERSION}`
      );
    }

    const tableCounts = new Map<string, number>();
    for (const tableName of tableNames) {
      const row = database
        .query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`)
        .get();
      if (!row) return fail(`Could not count rows in ${tableName} at ${path}`);
      tableCounts.set(tableName, row.count);
    }

    return { schemaVersion, tableCounts };
  } finally {
    database.close();
  }
};

const compareInspections = (source: DatabaseInspection, destination: DatabaseInspection): void => {
  if (source.schemaVersion !== destination.schemaVersion) {
    fail("Source and destination schema versions differ");
  }
  if (source.tableCounts.size !== destination.tableCounts.size) {
    fail("Source and destination table sets differ");
  }
  for (const [tableName, sourceCount] of source.tableCounts) {
    const destinationCount = destination.tableCounts.get(tableName);
    if (destinationCount !== sourceCount) {
      fail(
        `Row count mismatch for '${tableName}': source=${sourceCount}, destination=${destinationCount ?? "missing"}`
      );
    }
  }
};

const createSnapshot = (sourcePath: string, snapshotPath: string): void => {
  const source = new Database(sourcePath, { readonly: true });
  try {
    source.exec(`VACUUM INTO ${quoteSqlString(snapshotPath)}`);
  } finally {
    source.close();
  }
};

const writeRegistry = (configPath: string, registry: Registry): void => {
  mkdirSync(dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, JSON.stringify(registry, null, 2));
    renameSync(temporaryPath, configPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
};

const parseArguments = (args: ReadonlyArray<string>): CutoverArguments => {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }

  const unknownOptions = args.filter(
    (argument) => argument.startsWith("-") && argument !== "--apply"
  );
  if (unknownOptions.length > 0) fail(`Unknown option: ${unknownOptions[0]}`);
  const paths = args.filter((argument) => argument !== "--apply");
  if (paths.length > 1) fail("Provide at most one project path");
  return {
    apply: args.includes("--apply"),
    projectPath: paths[0] ?? process.cwd(),
  };
};

export const runCutover = (args: ReadonlyArray<string>): void => {
  const options = parseArguments(args);
  const requestedPath = normalizeExistingPath(options.projectPath);
  const gitIdentity = findGitIdentity(requestedPath);
  const rootPath = gitIdentity?.rootPath ?? requestedPath;
  const sourcePath = join(rootPath, AEROGRAPH_DIR, DB_FILE);
  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    fail(`No repository-local AeroGraph database found at ${sourcePath}`);
  }

  const aerographHome = getAeroGraphHome();
  const configPath = join(aerographHome, CONFIG_FILE);
  const registrySnapshot = readRegistry(configPath);
  const conflictingProject = registrySnapshot.registry.projects.find(
    (project) =>
      project.rootPath === rootPath ||
      (gitIdentity !== undefined && project.gitCommonDir === gitIdentity.commonDir)
  );
  if (conflictingProject) {
    fail(`Project '${conflictingProject.name}' is already registered for ${rootPath}`);
  }

  const sourceInspection = inspectDatabase(sourcePath);
  const projectId = randomUUID();
  const destinationDirectory = join(aerographHome, PROJECTS_DIR, projectId);
  const destinationPath = join(destinationDirectory, DB_FILE);
  const project: ProjectRecord = {
    id: projectId,
    name: basename(rootPath),
    rootPath,
    createdAt: new Date().toISOString(),
  };
  if (gitIdentity) project.gitCommonDir = gitIdentity.commonDir;

  console.log("AERO-72 Graph Cutover");
  console.log(`Mode:        ${options.apply ? "apply" : "dry run"}`);
  console.log(`Project:     ${project.name}`);
  console.log(`Source:      ${sourcePath}`);
  console.log(`Destination: ${destinationPath}`);
  console.log(`Schema:      ${sourceInspection.schemaVersion}`);
  console.log(`Tables:      ${sourceInspection.tableCounts.size}`);

  if (!options.apply) {
    console.log("");
    console.log("Source verification passed. Re-run with --apply to perform the cutover.");
    return;
  }

  const lockPath = `${configPath}.aero-72-cutover.lock`;
  mkdirSync(dirname(lockPath), { recursive: true });
  let lockDescriptor: number | undefined;
  try {
    lockDescriptor = openSync(lockPath, "wx");
  } catch {
    fail(`Another AERO-72 cutover may be running; lock exists at ${lockPath}`);
  }

  let registered = false;
  try {
    const currentRegistrySnapshot = readRegistry(configPath);
    if (currentRegistrySnapshot.content !== registrySnapshot.content) {
      fail(`AeroGraph registry changed during verification; no cutover was performed`);
    }

    mkdirSync(dirname(destinationDirectory), { recursive: true });
    mkdirSync(destinationDirectory, { recursive: false });
    const temporaryDatabasePath = `${destinationPath}.${randomUUID()}.tmp`;
    try {
      createSnapshot(sourcePath, temporaryDatabasePath);
      const destinationInspection = inspectDatabase(temporaryDatabasePath);
      compareInspections(sourceInspection, destinationInspection);
      renameSync(temporaryDatabasePath, destinationPath);
    } finally {
      rmSync(temporaryDatabasePath, { force: true });
    }

    writeRegistry(configPath, {
      ...registrySnapshot.registry,
      projects: [...registrySnapshot.registry.projects, project],
    });
    registered = true;
  } finally {
    if (lockDescriptor !== undefined) closeSync(lockDescriptor);
    rmSync(lockPath, { force: true });
    if (!registered) rmSync(destinationDirectory, { recursive: true, force: true });
  }

  console.log("");
  console.log("Cutover verified and registered.");
  console.log(`The source database remains unchanged at ${sourcePath}`);
  console.log("Run 'aerograph status --verbose' from the project and a linked worktree.");
};

if (import.meta.main) {
  try {
    runCutover(process.argv.slice(2));
  } catch (error) {
    console.error(`Cutover failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
