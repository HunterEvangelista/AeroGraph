import {
  MigrationServiceTag,
  TERM_KINDS,
  type TermKind,
  TermKind as TermKindSchema,
  ValidationError,
} from "@aerograph/core";
import { Console, Effect, Option, Schema } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withCliServices } from "./workspace";

const isTermKind = (kind: string): kind is TermKind => Schema.is(TermKindSchema)(kind);

const parseTermKind = (kind: string) =>
  isTermKind(kind)
    ? Effect.succeed(kind)
    : new ValidationError({
        field: "kind",
        message: `Invalid term kind '${kind}'. Expected one of: ${TERM_KINDS.join(", ")}`,
      });

const validateMode = (dryRun: boolean, apply: boolean) =>
  dryRun !== apply
    ? Effect.succeed(dryRun ? "dry-run" : "apply")
    : new ValidationError({
        field: "mode",
        message: "Choose exactly one of --dry-run or --apply.",
      });

const formatMigrationError = (error: {
  readonly _tag: string;
  readonly message?: string;
}): string => `${error._tag}: ${error.message ?? String(error)}`;

interface RenameInput {
  kind: TermKind;
  fromName: string;
  toName: string;
  reason?: string;
  appliedBy?: string;
}

const shellArgument = (value: string): string =>
  /^[a-zA-Z0-9_./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;

const printAffectedTags = (
  tags: ReadonlyArray<{ readonly id: string; readonly name: string }>,
  toName?: string
) =>
  Effect.gen(function* () {
    yield* Console.log(`Affected tags: ${tags.length}`);
    for (const tag of tags) {
      const rename = toName ? ` ${tag.name} -> ${toName}` : ` ${tag.name}`;
      yield* Console.log(`  #${tag.id}${rename}`);
    }
  });

const printAffectedEntities = (
  entities: ReadonlyArray<{ readonly id: string; readonly _tag: string; readonly title: string }>
) =>
  Effect.gen(function* () {
    yield* Console.log(`Affected entities: ${entities.length}`);
    for (const entity of entities) {
      yield* Console.log(`  ${entity.id}  [${entity._tag}] ${entity.title}`);
    }
  });

const migrateCommand = Command.make(
  "migrate",
  {
    kind: Argument.string("kind"),
    fromName: Argument.string("from"),
    toName: Argument.string("to"),
    dryRun: Flag.boolean("dry-run").pipe(
      Flag.withDescription("Preview the migration without writing changes"),
      Flag.withDefault(false)
    ),
    apply: Flag.boolean("apply").pipe(
      Flag.withDescription("Apply the migration and record it in the journal"),
      Flag.withDefault(false)
    ),
    reason: Flag.string("reason").pipe(
      Flag.withDescription("Reason to record with an applied migration"),
      Flag.optional
    ),
    appliedBy: Flag.string("applied-by").pipe(
      Flag.withDescription("Actor to record with an applied migration"),
      Flag.optional
    ),
  },
  ({ kind, fromName, toName, dryRun, apply, reason, appliedBy }) =>
    Effect.gen(function* () {
      const termKind = yield* parseTermKind(kind);
      const mode = yield* validateMode(dryRun, apply);
      const reasonValue = Option.getOrUndefined(reason);
      const appliedByValue = Option.getOrUndefined(appliedBy);

      if (mode === "dry-run") {
        const plan = yield* withCliServices(
          Effect.gen(function* () {
            const migrationService = yield* MigrationServiceTag;
            return yield* migrationService.planRename({ kind: termKind, fromName, toName });
          })
        );

        yield* Console.log("");
        yield* Console.log("Rename Migration Dry Run");
        yield* Console.log("=".repeat(40));
        yield* Console.log("");
        yield* Console.log(`Kind: ${plan.kind}`);
        yield* Console.log(`From: ${plan.fromName}`);
        yield* Console.log(`To:   ${plan.toName}`);
        yield* Console.log(`Term: ${plan.term.id} (${plan.term.canonicalName})`);
        yield* Console.log("");
        yield* printAffectedTags(plan.affectedTags, plan.toName);
        yield* Console.log("");
        yield* printAffectedEntities(plan.affectedEntities);
        yield* Console.log("");
        for (const note of plan.notes) {
          yield* Console.log(`Note: ${note}`);
        }
        yield* Console.log("");
        yield* Console.log("No changes were applied.");
        yield* Console.log(
          `Apply with: aerograph migrate ${kind} ${shellArgument(fromName)} ${shellArgument(toName)} --apply`
        );
        yield* Console.log("");
        return;
      }

      const result = yield* withCliServices(
        Effect.gen(function* () {
          const migrationService = yield* MigrationServiceTag;
          const input: RenameInput = {
            kind: termKind,
            fromName,
            toName,
          };
          if (reasonValue !== undefined) input.reason = reasonValue;
          if (appliedByValue !== undefined) input.appliedBy = appliedByValue;
          return yield* migrationService.applyRename(input);
        })
      );

      yield* Console.log("");
      yield* Console.log("Rename migration applied");
      yield* Console.log("=".repeat(40));
      yield* Console.log("");
      yield* Console.log(`Kind:    ${result.kind}`);
      yield* Console.log(`From:    ${result.fromName}`);
      yield* Console.log(`To:      ${result.toName}`);
      yield* Console.log(`Term ID: ${result.term.id}`);
      yield* Console.log(`Journal: ${result.journalEntry.id}`);
      yield* Console.log("");
      yield* printAffectedTags(result.affectedTags, result.toName);
      yield* Console.log("");
      yield* printAffectedEntities(result.affectedEntities);
      yield* Console.log("");
    }).pipe(
      Effect.catch((error) =>
        Console.error(`Error: ${formatMigrationError(error)}`).pipe(
          Effect.andThen(Effect.fail(error))
        )
      )
    )
);

export { migrateCommand };
