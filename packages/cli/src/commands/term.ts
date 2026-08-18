import {
  MigrationServiceTag,
  TERM_KINDS,
  TermGovernanceServiceTag,
  type TermId,
  type TermInspection,
  type TermKind,
  type TermSelector,
  ValidationError,
} from "@kioku/core";
import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withCliServices } from "./workspace.js";

const validKind = (value: string): value is TermKind =>
  (TERM_KINDS as ReadonlyArray<string>).includes(value);
const kindFlag = Flag.string("kind").pipe(
  Flag.withDescription(`Term kind (${TERM_KINDS.join(", ")})`),
  Flag.optional
);
const jsonFlag = Flag.boolean("json").pipe(
  Flag.withDescription("Emit successful command results as JSON"),
  Flag.withDefault(false)
);

const parseKind = (value: Option.Option<string>) => {
  const kind = Option.getOrUndefined(value);
  if (kind === undefined) return Effect.succeed(undefined as TermKind | undefined);
  return validKind(kind)
    ? Effect.succeed(kind)
    : Effect.fail(
        new ValidationError({
          field: "kind",
          message: `Invalid term kind '${kind}'. Expected one of: ${TERM_KINDS.join(", ")}`,
        })
      );
};

// Preserve ID precedence even when --kind is supplied. The first lookup is also
// deliberately done in the same service scope as the eventual mutation.
const resolveInspection = (value: string, kind: TermKind | undefined) =>
  Effect.gen(function* () {
    const governance = yield* TermGovernanceServiceTag;
    if (kind === undefined) return yield* governance.show(value);
    // With --kind, probe the stable ID explicitly first. A normal string
    // resolution would incorrectly report an ambiguous duplicate name before
    // the kind-qualified fallback gets a chance.
    return yield* governance
      .show({ id: value as TermId })
      .pipe(Effect.catchTag("TermNotFoundError", () => governance.show({ name: value, kind })));
  });

const json = (value: unknown) => Console.log(JSON.stringify(value));
const text = (inspection: TermInspection) => {
  const term = inspection.term;
  const lines = [
    `Stable ID: ${term.id}`,
    `Kind: ${term.kind}`,
    `Status: ${term.status}`,
    `Canonical name: ${inspection.canonicalName}`,
    ...(term.description ? [`Description: ${term.description}`] : []),
    `Aliases: ${inspection.aliases.length ? inspection.aliases.map((name) => name.displayName).join(", ") : "(none)"}`,
    `Deprecated names: ${inspection.deprecatedNames.length ? inspection.deprecatedNames.map((name) => name.displayName).join(", ") : "(none)"}`,
    `Created: ${term.createdAt.toISOString()}`,
    `Updated: ${term.updatedAt.toISOString()}`,
  ];
  if (inspection.mergedInto)
    lines.push(
      `Merged target: ${inspection.mergedInto.id} (${inspection.mergedInto.canonicalName})`
    );
  if (inspection.replacement)
    lines.push(
      `Recommended replacement: ${inspection.replacement.id} (${inspection.replacement.canonicalName})`
    );
  lines.push(...inspection.resolutionNotes.map((note) => `Note: ${note}`));
  return lines;
};
// Do not use Effect.forEach here: its callback receives an index and Console.log
// treats that second argument as a formatting value.
const printInspection = (inspection: TermInspection) =>
  Effect.gen(function* () {
    for (const line of text(inspection)) yield* Console.log(line);
  });
const printAffected = (plan: {
  readonly affectedTags: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly affectedEntities: ReadonlyArray<{
    readonly id: string;
    readonly _tag: string;
    readonly title: string;
  }>;
}) =>
  Effect.gen(function* () {
    for (const tag of plan.affectedTags) yield* Console.log(`  Tag #${tag.id}: ${tag.name}`);
    for (const entity of plan.affectedEntities)
      yield* Console.log(`  Entity ${entity.id} [${entity._tag}] ${entity.title}`);
  });
const errorMessage = (error: unknown): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return String(error);
};
const errorData = (error: unknown): Record<string, unknown> => {
  if (typeof error !== "object" || error === null)
    return { tag: "Error", message: errorMessage(error) };
  const value = error as Record<string, unknown>;
  const metadata: Record<string, unknown> = {};
  for (const key of ["field", "name", "operation", "candidates", "candidateMetadata", "path"]) {
    if (value[key] !== undefined) metadata[key] = value[key];
  }
  return {
    tag: typeof value["_tag"] === "string" ? value["_tag"] : "Error",
    message: errorMessage(error),
    ...metadata,
  };
};
const outputError = <A, E, R>(effect: Effect.Effect<A, E, R>, command: string, asJson: boolean) =>
  asJson
    ? effect.pipe(
        Effect.catch((error: unknown) =>
          Console.log(JSON.stringify({ ok: false, command, error: errorData(error) })).pipe(
            Effect.andThen(
              Effect.sync(() => {
                process.exitCode = 1;
              })
            )
          )
        )
      )
    : effect.pipe(Effect.tapError((error) => Console.error(`Error: ${errorMessage(error)}`)));

const listCommand = Command.make(
  "list",
  { kind: kindFlag, json: jsonFlag },
  ({ kind, json: asJson }) =>
    Effect.gen(function* () {
      const termKind = yield* parseKind(kind);
      const terms = yield* withCliServices(
        Effect.gen(function* () {
          return yield* (yield* TermGovernanceServiceTag).list(termKind);
        })
      );
      const data = { ok: true, command: "term list", kind: termKind ?? null, terms };
      if (asJson) yield* json(data);
      else {
        yield* Console.log(`Terms (${terms.length})`);
        for (const term of terms) {
          yield* printInspection(term);
          yield* Console.log("");
        }
      }
    }).pipe((effect) => outputError(effect, "term list", asJson))
);

const showCommand = Command.make(
  "show",
  { selector: Argument.string("id-or-name"), kind: kindFlag, json: jsonFlag },
  ({ selector, kind, json: asJson }) =>
    Effect.gen(function* () {
      const termKind = yield* parseKind(kind);
      const inspection = yield* withCliServices(resolveInspection(selector, termKind));
      if (asJson) yield* json({ ok: true, command: "term show", term: inspection });
      else yield* printInspection(inspection);
    }).pipe((effect) => outputError(effect, "term show", asJson))
);

const auditCommand = Command.make(
  "audit",
  { selector: Argument.string("id-or-name"), kind: kindFlag, json: jsonFlag },
  ({ selector, kind, json: asJson }) =>
    Effect.gen(function* () {
      const termKind = yield* parseKind(kind);
      const audit = yield* withCliServices(
        Effect.gen(function* () {
          const governance = yield* TermGovernanceServiceTag;
          const selected = yield* resolveInspection(selector, termKind);
          return yield* governance.audit({
            id: selected.resolutionMetadata?.selectedTermId ?? selected.term.id,
          });
        })
      );
      const data = { ok: true, command: "term audit", audit };
      if (asJson) yield* json(data);
      else {
        yield* printInspection(audit.inspection);
        yield* Console.log(`Migration operations: ${audit.entries.length}`);
        yield* Effect.forEach(audit.entries, (entry) =>
          Console.log(
            `  ${entry.operation}: ${entry.fromName}${entry.toName ? ` -> ${entry.toName}` : ""} | source/destination: ${entry.termId}${entry.relatedTermId ? ` / ${entry.relatedTermId}` : ""} | affected: ${entry.affectedCount} | actor: ${entry.appliedBy ?? "(unknown)"} | reason: ${entry.reason ?? "(none)"} | time: ${entry.appliedAt.toISOString()}`
          )
        );
      }
    }).pipe((effect) => outputError(effect, "term audit", asJson))
);

const aliasCommand = Command.make(
  "alias",
  {
    selector: Argument.string("id-or-name"),
    alias: Argument.string("alias"),
    kind: kindFlag,
    json: jsonFlag,
  },
  ({ selector, alias, kind, json: asJson }) =>
    Effect.gen(function* () {
      const termKind = yield* parseKind(kind);
      const inspection = yield* withCliServices(
        Effect.gen(function* () {
          const governance = yield* TermGovernanceServiceTag;
          const selected = yield* resolveInspection(selector, termKind);
          yield* governance.addAlias({ term: { id: selected.term.id }, alias });
          return yield* governance.show({ id: selected.term.id });
        })
      );
      if (asJson) yield* json({ ok: true, command: "term alias", alias, term: inspection });
      else {
        yield* Console.log(`Alias added: ${alias}`);
        yield* printInspection(inspection);
      }
    }).pipe((effect) => outputError(effect, "term alias", asJson))
);

const modeFlags = {
  dryRun: Flag.boolean("dry-run").pipe(
    Flag.withDescription("Plan and report changes without writing terms, tags, or journal entries"),
    Flag.withDefault(false)
  ),
  apply: Flag.boolean("apply").pipe(
    Flag.withDescription("Apply the lifecycle change and record an audit journal entry"),
    Flag.withDefault(false)
  ),
  reason: Flag.string("reason").pipe(
    Flag.withDescription("Reason recorded in the audit journal"),
    Flag.optional
  ),
  appliedBy: Flag.string("applied-by").pipe(
    Flag.withDescription("Actor recorded in the audit journal"),
    Flag.optional
  ),
  kind: kindFlag,
  json: jsonFlag,
};
const mode = (dryRun: boolean, apply: boolean) =>
  dryRun === apply
    ? Effect.fail(
        new ValidationError({
          field: "mode",
          message: "Choose exactly one of --dry-run or --apply.",
        })
      )
    : Effect.succeed(dryRun ? ("dry-run" as const) : ("apply" as const));
const optional = (value: Option.Option<string>) => Option.getOrUndefined(value);

const deprecateCommand = Command.make(
  "deprecate",
  {
    selector: Argument.string("id-or-name"),
    replacement: Flag.string("replacement").pipe(Flag.optional),
    ...modeFlags,
  },
  (args) =>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: lifecycle adapter keeps resolution and mode dispatch in one service scope.
    Effect.gen(function* () {
      const termKind = yield* parseKind(args.kind);
      const selectedMode = yield* mode(args.dryRun, args.apply);
      const result = yield* withCliServices(
        Effect.gen(function* () {
          const migration = yield* MigrationServiceTag;
          const governance = yield* TermGovernanceServiceTag;
          const source = yield* resolveInspection(args.selector, termKind);
          let replacement: TermSelector | undefined;
          if (Option.isSome(args.replacement)) {
            const target = yield* resolveInspection(args.replacement.value, source.term.kind);
            replacement = { id: target.term.id };
          }
          const reasonValue = optional(args.reason);
          const actorValue = optional(args.appliedBy);
          const input = {
            term: { id: source.term.id },
            ...(replacement ? { replacement } : {}),
            ...(reasonValue === undefined ? {} : { reason: reasonValue }),
            ...(actorValue === undefined ? {} : { appliedBy: actorValue }),
          };
          const result =
            selectedMode === "dry-run"
              ? { mode: selectedMode, result: yield* migration.planDeprecate(input) }
              : { mode: selectedMode, result: yield* migration.applyDeprecate(input) };
          // Keep this read in the same service scope as resolution and the
          // mutation.  Rendering must describe the selected registry term,
          // including its real names and lifecycle metadata.
          const sourceInspection = yield* governance.show({ id: source.term.id });
          return { ...result, sourceInspection };
        })
      );
      if (args.json) yield* json({ ok: true, command: "term deprecate", ...result });
      else {
        yield* Console.log(`Deprecate (${result.mode})`);
        const plan = result.mode === "dry-run" ? result.result : result.result.plan;
        yield* printInspection(result.sourceInspection);
        if (plan.replacement)
          yield* Console.log(
            `Proposed replacement: ${plan.replacement.id} (${plan.replacement.canonicalName})`
          );
        yield* Console.log(`Affected tags: ${plan.affectedTags.length}`);
        yield* Console.log(`Affected entities: ${plan.affectedEntities.length}`);
        for (const note of plan.notes) yield* Console.log(`Note: ${note}`);
        yield* printAffected(plan);
        if (result.mode === "dry-run") {
          yield* Console.log("No changes were applied; the plan is not a journal entry.");
        } else {
          yield* Console.log("Lifecycle state and audit journal changed on apply.");
          yield* Console.log(`Journal ID: ${result.result.journalEntry.id}`);
          yield* Console.log(`Current lifecycle state: ${result.result.term.status}`);
        }
      }
    }).pipe((effect) => outputError(effect, "term deprecate", args.json))
);

const mergeCommand = Command.make(
  "merge",
  { source: Argument.string("source"), destination: Argument.string("destination"), ...modeFlags },
  (args) =>
    Effect.gen(function* () {
      const termKind = yield* parseKind(args.kind);
      const selectedMode = yield* mode(args.dryRun, args.apply);
      const result = yield* withCliServices(
        Effect.gen(function* () {
          const migration = yield* MigrationServiceTag;
          const source = yield* resolveInspection(args.source, termKind);
          const destination = yield* resolveInspection(args.destination, source.term.kind);
          const reasonValue = optional(args.reason);
          const actorValue = optional(args.appliedBy);
          const input = {
            source: { id: source.term.id },
            destination: { id: destination.term.id },
            ...(reasonValue === undefined ? {} : { reason: reasonValue }),
            ...(actorValue === undefined ? {} : { appliedBy: actorValue }),
          };
          return selectedMode === "dry-run"
            ? { mode: selectedMode, result: yield* migration.planMerge(input) }
            : { mode: selectedMode, result: yield* migration.applyMerge(input) };
        })
      );
      if (args.json) yield* json({ ok: true, command: "term merge", ...result });
      else {
        const plan = result.mode === "dry-run" ? result.result : result.result.plan;
        yield* Console.log(`Merge (${result.mode})`);
        yield* Console.log(`Source: ${plan.source.id} (${plan.source.canonicalName})`);
        yield* Console.log(
          `Destination: ${plan.destination.id} (${plan.destination.canonicalName})`
        );
        yield* Console.log(`Affected tags: ${plan.affectedTags.length}`);
        yield* Console.log(`Affected entities: ${plan.affectedEntities.length}`);
        for (const note of plan.notes) yield* Console.log(`Note: ${note}`);
        yield* printAffected(plan);
        yield* Console.log(
          "Tag IDs, display names, aliases, attachments, and entity links do not change; only source term governance is reassigned."
        );
        if (result.mode === "dry-run") yield* Console.log("No changes were applied.");
        else {
          yield* Console.log("Lifecycle state and audit journal changed on apply.");
          yield* Console.log(`Journal ID: ${result.result.journalEntry.id}`);
          yield* Console.log(`Current lifecycle state: ${result.result.source.status}`);
        }
      }
    }).pipe((effect) => outputError(effect, "term merge", args.json))
);

export const termCommand = Command.make("term").pipe(
  Command.withDescription("Inspect and govern terminology"),
  Command.withSubcommands([
    listCommand,
    showCommand,
    auditCommand,
    aliasCommand,
    deprecateCommand,
    mergeCommand,
  ])
);
