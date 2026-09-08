import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Context, Effect, FileSystem, Layer, Logger, Option, Schema } from "effect";
import { getAeroGraphHome } from "../config";
import type { CommandCatalog } from "./command-name";
import { type ExecutionEvent, ExecutionEventSchema, encodeExecutionEvent } from "./execution-event";

export const EXECUTION_LOGS_DIR = "logs";
export const EXECUTION_LOG_RETENTION_DAYS = 14;
export const EXECUTION_LOG_CLOSED_FILE_BUDGET_BYTES = 50n * 1024n * 1024n;

const LOG_FILE_PATTERN = /^cli-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const EXECUTION_LOG_LOCK = ".writer-lock";
const EXECUTION_LOG_LOCK_OWNER = "owner";
const LOCK_RETRY_ATTEMPTS = 200;
const LOCK_RETRY_DELAY = "10 millis";
const MAX_EXECUTION_RECORD_BYTES = 4096;

export interface ExecutionRecorder {
  readonly record: (event: ExecutionEvent) => Effect.Effect<void>;
}

export class ExecutionRecorderTag extends Context.Service<
  ExecutionRecorderTag,
  ExecutionRecorder
>()("ExecutionRecorder") {}

export const executionLogFileName = (date: Date): string =>
  `cli-${date.toISOString().slice(0, 10)}.jsonl`;

interface LogFile {
  readonly name: string;
  readonly path: string;
  readonly day: string;
  readonly size: bigint;
}

const inspectLogFile = (
  directory: string,
  name: string
): Effect.Effect<Option.Option<LogFile>, never, FileSystem.FileSystem> => {
  const match = LOG_FILE_PATTERN.exec(name);
  const day = match?.[1];
  if (day === undefined) {
    return Effect.succeed(Option.none<LogFile>());
  }

  const path = join(directory, name);
  return FileSystem.FileSystem.use((fileSystem) =>
    fileSystem.stat(path).pipe(
      Effect.map((info) => {
        if (info.type !== "File") {
          return Option.none<LogFile>();
        }
        return Option.some({
          name,
          path,
          day,
          size: BigInt(info.size),
        });
      }),
      Effect.orElseSucceed(() => Option.none<LogFile>())
    )
  );
};

const retentionCutoffDay = (now: Date): string => {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - EXECUTION_LOG_RETENTION_DAYS);
  return cutoff.toISOString().slice(0, 10);
};

/** Retention only removes closed daily files while the writer lock is held. */
export const pruneExecutionLogs = (
  directory: string,
  activeFileName: string,
  now: Date
): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const names = yield* fileSystem.readDirectory(directory);
    const inspected = yield* Effect.forEach(names, (name) => inspectLogFile(directory, name));
    const candidates = inspected
      .flatMap((file) => (Option.isSome(file) ? [file.value] : []))
      .filter((file) => file.name !== activeFileName)
      .sort((left, right) => left.day.localeCompare(right.day));

    const removed = new Set<string>();
    const cutoffDay = retentionCutoffDay(now);
    for (const file of candidates) {
      if (file.day > cutoffDay) {
        continue;
      }
      yield* fileSystem.remove(file.path, { force: true }).pipe(Effect.ignore);
      removed.add(file.path);
    }

    const retained = candidates.filter((file) => !removed.has(file.path));
    let retainedBytes = retained.reduce((total, file) => total + file.size, 0n);
    for (const file of retained) {
      if (retainedBytes <= EXECUTION_LOG_CLOSED_FILE_BUDGET_BYTES) {
        break;
      }
      yield* fileSystem.remove(file.path, { force: true }).pipe(Effect.ignore);
      retainedBytes -= file.size;
    }
  }).pipe(Effect.ignore);

const finalNewlineIndex = (bytes: Uint8Array, length: number): number => {
  for (let index = length - 1; index >= 0; index -= 1) {
    if (bytes[index] === 10) return index;
  }
  return -1;
};

const repairRecordBoundary = (path: string): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    if (!(yield* fileSystem.exists(path))) return;

    const info = yield* fileSystem.stat(path);
    if (info.size === 0n) return;

    yield* Effect.scoped(
      Effect.gen(function* () {
        const file = yield* fileSystem.open(path, { flag: "r+" });
        const maximumTail = BigInt(MAX_EXECUTION_RECORD_BYTES);
        const tailSize = info.size < maximumTail ? info.size : maximumTail;
        const tailStart = info.size - tailSize;
        yield* file.seek(tailStart, "start");
        const tail = new Uint8Array(Number(tailSize));
        const bytesRead = Number(yield* file.read(tail));
        if (tail[bytesRead - 1] === 10) return;

        const finalNewline = finalNewlineIndex(tail, bytesRead);
        yield* file.truncate(finalNewline < 0 ? tailStart : tailStart + BigInt(finalNewline + 1));
      })
    );
  }).pipe(Effect.ignore);

const lockOwnerPid = (owner: string): number | undefined => {
  const separator = owner.indexOf(":");
  if (separator < 1) return undefined;
  const pid = Number(owner.slice(0, separator));
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
};

const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const processError = Schema.decodeUnknownOption(Schema.Struct({ code: Schema.String }))(error);
    // Permission failures cannot distinguish a live foreign process from an absent one. Keeping
    // its lock is safer than admitting two writers.
    return Option.isNone(processError) || processError.value.code !== "ESRCH";
  }
};

const reapDeadLock = (fileSystem: FileSystem.FileSystem, lockPath: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    const owner = yield* fileSystem.readFileString(join(lockPath, EXECUTION_LOG_LOCK_OWNER));
    const pid = lockOwnerPid(owner);
    if (pid === undefined || processIsAlive(pid)) return;

    // Renaming elects exactly one reaper. Other contenders cannot remove a successor's lock after
    // the dead lock leaves the canonical path.
    const abandonedPath = `${lockPath}.abandoned-${randomUUID()}`;
    yield* fileSystem.rename(lockPath, abandonedPath);
    yield* fileSystem.remove(abandonedPath, { recursive: true, force: true }).pipe(Effect.ignore);
  }).pipe(Effect.ignore);

const withWriterLock = <A, E, R>(directory: string, effect: Effect.Effect<A, E, R>) =>
  FileSystem.FileSystem.use((fileSystem) => {
    const lockPath = join(directory, EXECUTION_LOG_LOCK);
    const owner = `${process.pid}:${randomUUID()}`;
    const acquire = Effect.gen(function* () {
      for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt += 1) {
        const result = yield* Effect.result(fileSystem.makeDirectory(lockPath));
        if (result._tag === "Success") {
          yield* fileSystem
            .writeFileString(join(lockPath, EXECUTION_LOG_LOCK_OWNER), owner)
            .pipe(
              Effect.tapError(() =>
                fileSystem.remove(lockPath, { recursive: true, force: true }).pipe(Effect.ignore)
              )
            );
          return;
        }
        yield* reapDeadLock(fileSystem, lockPath);
        if (attempt + 1 < LOCK_RETRY_ATTEMPTS) yield* Effect.sleep(LOCK_RETRY_DELAY);
      }
      return yield* Effect.die("Unable to acquire execution log writer lock");
    });
    const release = Effect.gen(function* () {
      const currentOwner = yield* fileSystem.readFileString(
        join(lockPath, EXECUTION_LOG_LOCK_OWNER)
      );
      if (currentOwner === owner) {
        yield* fileSystem.remove(lockPath, { recursive: true, force: true });
      }
    }).pipe(Effect.ignore);

    return Effect.acquireUseRelease(
      acquire,
      () => effect,
      () => release
    );
  });

const noopRecorder: ExecutionRecorder = {
  record: () => Effect.void,
};

export const ExecutionRecorderNoop = Layer.succeed(ExecutionRecorderTag, noopRecorder);

const makeLiveRecorder = (catalog: CommandCatalog) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;

    return {
      record: (event) => {
        if (!catalog.names.has(event.command)) return Effect.void;

        const completedAt = new Date();
        const directory = join(getAeroGraphHome(), EXECUTION_LOGS_DIR);
        const fileName = executionLogFileName(completedAt);
        const filePath = join(directory, fileName);
        const writeRecord = Effect.scoped(
          Effect.gen(function* () {
            yield* pruneExecutionLogs(directory, fileName, completedAt).pipe(
              Effect.provideService(FileSystem.FileSystem, fileSystem)
            );
            yield* repairRecordBoundary(filePath).pipe(
              Effect.provideService(FileSystem.FileSystem, fileSystem)
            );

            const logFile = yield* fileSystem.open(filePath, { flag: "a+", mode: 0o600 });
            yield* fileSystem.chmod(filePath, 0o600);

            const formatter = Logger.make<unknown, string>(({ message }) => {
              const messages = Array.isArray(message) ? message : [message];
              return messages
                .map((value) => Schema.decodeUnknownSync(ExecutionEventSchema)(value))
                .map(encodeExecutionEvent)
                .join("\n");
            });
            const encoder = new TextEncoder();
            const fileLogger = yield* Logger.batched(formatter, {
              window: "1 hour",
              flush: (records) => {
                const bytes = encoder.encode(`${records.join("\n")}\n`);
                if (bytes.byteLength > MAX_EXECUTION_RECORD_BYTES) return Effect.void;

                // The writer lock keeps a short write from interleaving with another process. It
                // is not retried because duplicating an unknown prefix is worse than dropping the
                // incomplete record; the next invocation truncates the incomplete tail.
                return logFile.write(bytes).pipe(
                  Effect.flatMap((written) =>
                    written === BigInt(bytes.byteLength)
                      ? Effect.void
                      : Effect.die("Incomplete execution log write")
                  ),
                  Effect.ignore
                );
              },
            });

            yield* Effect.log(event).pipe(Effect.provide(Logger.layer([fileLogger])));
          })
        );

        return Effect.gen(function* () {
          yield* fileSystem.makeDirectory(directory, { recursive: true, mode: 0o700 });
          yield* fileSystem.chmod(directory, 0o700);
          yield* withWriterLock(directory, writeRecord).pipe(
            Effect.provideService(FileSystem.FileSystem, fileSystem)
          );
        }).pipe(Effect.ignoreCause);
      },
    } satisfies ExecutionRecorder;
  });

export const ExecutionRecorderLive = (catalog: CommandCatalog) =>
  Layer.effect(ExecutionRecorderTag, makeLiveRecorder(catalog));
