import { join } from "node:path";
import { Context, Effect, FileSystem, Layer, Logger, Option, Schema } from "effect";
import { getAeroGraphHome } from "../config";
import { type ExecutionEvent, ExecutionEventSchema, encodeExecutionEvent } from "./execution-event";

export const EXECUTION_LOGS_DIR = "logs";
export const EXECUTION_LOG_RETENTION_DAYS = 14;
export const EXECUTION_LOG_CLOSED_FILE_BUDGET_BYTES = 50n * 1024n * 1024n;

const LOG_FILE_PATTERN = /^cli-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const BUDGET_PRUNE_SAFETY_MILLIS = 24 * 60 * 60 * 1000;
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
  readonly modifiedAtMillis?: number | undefined;
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
          modifiedAtMillis: Option.getOrUndefined(info.mtime)?.getTime(),
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

/**
 * Retention only removes closed daily files. Budget pruning also excludes files modified during
 * the last day, preventing a midnight boundary from unlinking another process's append target.
 */
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
    const budgetCandidates = retained.filter(
      (file) =>
        file.modifiedAtMillis !== undefined &&
        now.getTime() - file.modifiedAtMillis >= BUDGET_PRUNE_SAFETY_MILLIS
    );
    for (const file of budgetCandidates) {
      if (retainedBytes <= EXECUTION_LOG_CLOSED_FILE_BUDGET_BYTES) {
        break;
      }
      yield* fileSystem.remove(file.path, { force: true }).pipe(Effect.ignore);
      retainedBytes -= file.size;
    }
  }).pipe(Effect.ignore);

const ensureRecordBoundary = (path: string): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    if (!(yield* fileSystem.exists(path))) {
      return;
    }
    const info = yield* fileSystem.stat(path);
    if (info.size === 0n) {
      return;
    }

    yield* Effect.scoped(
      Effect.gen(function* () {
        const file = yield* fileSystem.open(path, { flag: "a+" });
        yield* file.seek(info.size - 1n, "start");
        const finalByte = new Uint8Array(1);
        const bytesRead = yield* file.read(finalByte);
        if (bytesRead > 0n && finalByte[0] !== 10) {
          yield* file.write(new Uint8Array([10]));
        }
      })
    );
  }).pipe(Effect.ignore);

const noopRecorder: ExecutionRecorder = {
  record: () => Effect.void,
};

export const ExecutionRecorderNoop = Layer.succeed(ExecutionRecorderTag, noopRecorder);

const makeLiveRecorder = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;

  return {
    record: (event) =>
      Effect.scoped(
        Effect.gen(function* () {
          const completedAt = new Date();
          const directory = join(getAeroGraphHome(), EXECUTION_LOGS_DIR);
          const fileName = executionLogFileName(completedAt);
          const filePath = join(directory, fileName);

          yield* fileSystem.makeDirectory(directory, { recursive: true, mode: 0o700 });
          yield* fileSystem.chmod(directory, 0o700);
          yield* pruneExecutionLogs(directory, fileName, completedAt).pipe(
            Effect.provideService(FileSystem.FileSystem, fileSystem)
          );
          yield* ensureRecordBoundary(filePath).pipe(
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
              if (bytes.byteLength > MAX_EXECUTION_RECORD_BYTES) {
                return Effect.void;
              }
              // Append mode assigns the offset and writes this bounded record in one filesystem
              // operation. A partial write is not retried because a retry could interleave with
              // another process; the next invocation separates any incomplete trailing record.
              return logFile.write(bytes).pipe(Effect.ignore);
            },
          });

          yield* Effect.log(event).pipe(Effect.provide(Logger.layer([fileLogger])));
        })
      ).pipe(Effect.ignoreCause),
  } satisfies ExecutionRecorder;
});

export const ExecutionRecorderLive = Layer.effect(ExecutionRecorderTag, makeLiveRecorder);
