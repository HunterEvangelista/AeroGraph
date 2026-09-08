import type * as CliCommand from "effect/unstable/cli/Command";

export type CanonicalCommandName = string;

export interface CommandCatalog {
  readonly names: ReadonlySet<CanonicalCommandName>;
  readonly classify: (args: ReadonlyArray<string>) => CanonicalCommandName;
}

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

const childrenOf = (command: CliCommand.Command.Any): ReadonlyArray<CliCommand.Command.Any> =>
  command.subcommands.flatMap(({ commands }) => commands);

const commandForLabel = (
  commands: ReadonlyArray<CliCommand.Command.Any>,
  label: string
): CliCommand.Command.Any | undefined =>
  commands.find((command) => command.name === label || command.alias === label);

const collectNames = (
  command: CliCommand.Command.Any,
  parentPath: ReadonlyArray<string>,
  names: Set<string>
): void => {
  const path = [...parentPath, command.name];
  names.add(path.join("."));
  for (const child of childrenOf(command)) {
    collectNames(child, path, names);
  }
};

const descendCommandTree = (
  initial: CliCommand.Command.Any,
  args: ReadonlyArray<string>,
  start: number
): CanonicalCommandName => {
  let selected = initial;
  const path = [selected.name];
  let searchFrom = start;
  while (childrenOf(selected).length > 0) {
    const position = commandPosition(args, searchFrom);
    if (!position.valid) return path.join(".");

    const label = args[position.index];
    if (label === undefined) return path.join(".");

    const child = commandForLabel(childrenOf(selected), label);
    if (child === undefined) return path.join(".");
    selected = child;
    path.push(selected.name);
    searchFrom = position.index + 1;
  }
  return path.join(".");
};

const classifyCommand = (
  root: CliCommand.Command.Any,
  args: ReadonlyArray<string>
): CanonicalCommandName => {
  const position = commandPosition(args, 0);
  if (!position.valid) return "unknown";

  const label = args[position.index];
  if (label === undefined) return root.name;

  const selected = commandForLabel(childrenOf(root), label);
  return selected === undefined
    ? "unknown"
    : descendCommandTree(selected, args, position.index + 1);
};

/**
 * Effect commands are the authority for canonical execution names. The catalog reads the public
 * command tree so adding, removing, aliasing, or regrouping a command cannot leave a second action
 * registry out of sync.
 */
export const commandCatalog = (root: CliCommand.Command.Any): CommandCatalog => {
  const names = new Set<CanonicalCommandName>([root.name, "unknown"]);
  for (const child of childrenOf(root)) collectNames(child, [], names);

  return { names, classify: (args) => classifyCommand(root, args) };
};
