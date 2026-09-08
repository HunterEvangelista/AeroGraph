import { Schema } from "effect";
import { CANONICAL_COMMAND_NAMES, type CanonicalCommandName } from "./command-name";

export const EXECUTION_EVENT_SCHEMA_VERSION = 1 as const;
export const EXECUTION_EVENT_TYPE = "cli_execution" as const;

export const ExecutionOutcomeSchema = Schema.Literals(["success", "failure", "interrupted"]);
export type ExecutionOutcome = typeof ExecutionOutcomeSchema.Type;

export const ExecutionErrorCategorySchema = Schema.Literals([
  "usage",
  "workspace",
  "config",
  "validation",
  "not_found",
  "conflict",
  "database",
  "repository",
  "internal",
  "unknown",
]);
export type ExecutionErrorCategory = typeof ExecutionErrorCategorySchema.Type;

export const ProjectResolutionSchema = Schema.Literals([
  "registered_path",
  "git_common_dir",
  "unresolved",
]);
export type ProjectResolution = typeof ProjectResolutionSchema.Type;

export const ExecutionEventSchema = Schema.Struct({
  schemaVersion: Schema.Literal(EXECUTION_EVENT_SCHEMA_VERSION),
  eventType: Schema.Literal(EXECUTION_EVENT_TYPE),
  runId: Schema.String.check(Schema.isUUID(4)),
  command: Schema.Literals(CANONICAL_COMMAND_NAMES),
  cliVersion: Schema.String,
  startedAt: Schema.String,
  endedAt: Schema.String,
  durationMs: Schema.Finite,
  outcome: ExecutionOutcomeSchema,
  errorCategory: Schema.optional(ExecutionErrorCategorySchema),
  projectResolution: ProjectResolutionSchema,
});

export type ExecutionEvent = typeof ExecutionEventSchema.Type;

export interface CreateExecutionEventInput {
  readonly runId: string;
  readonly command: CanonicalCommandName;
  readonly cliVersion: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly outcome: ExecutionOutcome;
  readonly errorCategory?: ExecutionErrorCategory | undefined;
  readonly projectResolution: ProjectResolution;
}

export const createExecutionEvent = (input: CreateExecutionEventInput): ExecutionEvent => ({
  schemaVersion: EXECUTION_EVENT_SCHEMA_VERSION,
  eventType: EXECUTION_EVENT_TYPE,
  runId: input.runId,
  command: input.command,
  cliVersion: input.cliVersion,
  startedAt: input.startedAt,
  endedAt: input.endedAt,
  durationMs: input.durationMs,
  outcome: input.outcome,
  errorCategory: input.errorCategory,
  projectResolution: input.projectResolution,
});

interface EncodedExecutionEvent {
  readonly schemaVersion: number;
  readonly eventType: string;
  readonly runId: string;
  readonly command: CanonicalCommandName;
  readonly cliVersion: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly outcome: ExecutionOutcome;
  errorCategory?: ExecutionErrorCategory | undefined;
  readonly projectResolution: ProjectResolution;
}

export const encodeExecutionEvent = (event: ExecutionEvent): string => {
  const encoded: EncodedExecutionEvent = {
    schemaVersion: event.schemaVersion,
    eventType: event.eventType,
    runId: event.runId,
    command: event.command,
    cliVersion: event.cliVersion,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    durationMs: event.durationMs,
    outcome: event.outcome,
    projectResolution: event.projectResolution,
  };
  if (event.errorCategory !== undefined) {
    encoded.errorCategory = event.errorCategory;
  }
  return JSON.stringify(encoded);
};
