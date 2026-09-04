export const CANONICAL_COMMAND_NAMES = [
  "aerograph",
  "code-ref",
  "code-ref.add",
  "code-ref.show",
  "code-ref.list",
  "code-ref.delete",
  "context",
  "doc",
  "doc.create",
  "doc.show",
  "doc.list",
  "doc.edit",
  "doc.delete",
  "history",
  "init",
  "link",
  "link.list",
  "migrate",
  "next",
  "next.list",
  "next.clear",
  "query",
  "status",
  "story",
  "story.create",
  "story.show",
  "story.list",
  "story.edit",
  "story.delete",
  "tag",
  "tag.create",
  "tag.list",
  "tag.apply",
  "tag.remove",
  "tag.govern",
  "tag.show",
  "tag.delete",
  "term",
  "term.list",
  "term.create",
  "term.show",
  "term.audit",
  "term.alias",
  "term.deprecate",
  "term.merge",
  "unlink",
  "unknown",
] as const;

export type CanonicalCommandName = (typeof CANONICAL_COMMAND_NAMES)[number];

const canonicalCommandNames = new Map<string, CanonicalCommandName>(
  CANONICAL_COMMAND_NAMES.map((name) => [name, name])
);

const COMMANDS = {
  "code-ref": ["add", "show", "list", "delete"],
  context: [],
  doc: ["create", "show", "list", "edit", "delete"],
  history: [],
  init: [],
  link: ["list"],
  migrate: [],
  next: ["list", "clear"],
  query: [],
  status: [],
  story: ["create", "show", "list", "edit", "delete"],
  tag: ["create", "list", "apply", "remove", "govern", "show", "delete"],
  term: ["list", "create", "show", "audit", "alias", "deprecate", "merge"],
  unlink: [],
} as const satisfies Readonly<Record<string, ReadonlyArray<string>>>;

type TopLevelCommand = keyof typeof COMMANDS;

const isTopLevelCommand = (value: string): value is TopLevelCommand => value in COMMANDS;

const BOOLEAN_GLOBAL_FLAGS = new Set([
  "--help",
  "--no-help",
  "--no-h",
  "--version",
  "--no-version",
  "--no-v",
  "--wizard",
  "--no-wizard",
]);
const REQUIRED_VALUE_GLOBAL_FLAGS = new Set(["--log-level"]);
const OPTIONAL_VALUE_GLOBAL_FLAGS = new Set(["--completions"]);

interface CommandPosition {
  readonly index: number;
  readonly valid: boolean;
}

const isBooleanGlobalFlag = (argument: string): boolean =>
  BOOLEAN_GLOBAL_FLAGS.has(argument) ||
  /^--(?:no-)?(?:help|version|wizard)=/.test(argument) ||
  /^-[hv]+(?:=.+)?$/.test(argument);

const globalFlagWidth = (
  args: ReadonlyArray<string>,
  index: number,
  argument: string
): number | undefined => {
  if (
    isBooleanGlobalFlag(argument) ||
    argument.startsWith("--log-level=") ||
    argument.startsWith("--completions=")
  ) {
    return 1;
  }
  if (REQUIRED_VALUE_GLOBAL_FLAGS.has(argument)) {
    return index + 1 < args.length ? 2 : undefined;
  }
  if (OPTIONAL_VALUE_GLOBAL_FLAGS.has(argument)) {
    const next = args[index + 1];
    return next !== undefined && !next.startsWith("-") ? 2 : 1;
  }
  return undefined;
};

const commandPosition = (args: ReadonlyArray<string>, start: number): CommandPosition => {
  let index = start;
  while (index < args.length) {
    const argument = args[index];
    if (argument === undefined || !argument.startsWith("-")) {
      return { index, valid: true };
    }
    const width = globalFlagWidth(args, index, argument);
    if (width === undefined) {
      return { index, valid: false };
    }
    index += width;
  }
  return { index, valid: true };
};

/**
 * Returns only labels declared by the static command tree. Global flags are consumed by their
 * known arity, and option or operand values are never searched for command-like strings.
 */
export const canonicalCommandName = (args: ReadonlyArray<string>): CanonicalCommandName => {
  const topLevelPosition = commandPosition(args, 0);
  if (!topLevelPosition.valid) {
    return "unknown";
  }
  const topLevel = args[topLevelPosition.index];
  if (topLevel === undefined) {
    return "aerograph";
  }
  if (!isTopLevelCommand(topLevel)) {
    return "unknown";
  }

  const subcommands: ReadonlyArray<string> = COMMANDS[topLevel];
  const subcommandPosition = commandPosition(args, topLevelPosition.index + 1);
  if (!subcommandPosition.valid) {
    return topLevel;
  }
  const subcommand = args[subcommandPosition.index];
  if (subcommand === undefined || !subcommands.includes(subcommand)) {
    return topLevel;
  }

  const commandName = `${topLevel}.${subcommand}`;
  return canonicalCommandNames.get(commandName) ?? "unknown";
};
