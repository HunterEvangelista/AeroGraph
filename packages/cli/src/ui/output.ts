import { Console, type Effect } from "effect";

export type CliOutput = string;

export const formatLines = (lines: ReadonlyArray<string>): CliOutput => lines.join("\n");

export const formatJson = <A>(value: A): CliOutput => JSON.stringify(value);

export const emitOutput = (output: CliOutput): Effect.Effect<void> => Console.log(output);

export const emitError = (output: CliOutput): Effect.Effect<void> => Console.error(output);
