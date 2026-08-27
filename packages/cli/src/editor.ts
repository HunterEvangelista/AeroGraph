import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Data, Effect } from "effect";

export class EditorConfigurationError extends Data.TaggedError("EditorConfigurationError")<{
  readonly message: string;
}> {}

export class EditorProcessError extends Data.TaggedError("EditorProcessError")<{
  readonly message: string;
}> {}

export class EditorFileError extends Data.TaggedError("EditorFileError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export type MarkdownEditorResult =
  | { readonly _tag: "Edited"; readonly content: string }
  | { readonly _tag: "Empty" }
  | { readonly _tag: "Unchanged" };

const missingEditorMessage = `No editor configured.

Set VISUAL or EDITOR to a command that waits until editing is complete.

  export VISUAL="code --wait"
  export VISUAL="zed --wait"
  export EDITOR="nano"`;

const configuredEditor = (): string | undefined => {
  const visual = process.env["VISUAL"]?.trim();
  if (visual) return visual;

  const editor = process.env["EDITOR"]?.trim();
  return editor || undefined;
};

const runEditor = (command: string, filePath: string): void => {
  const result =
    process.platform === "win32"
      ? spawnSync(command, [filePath], { shell: true, stdio: "inherit" })
      : spawnSync("/bin/sh", ["-c", `exec ${command} "$1"`, "aerograph-editor", filePath], {
          stdio: "inherit",
        });

  if (result.error) {
    throw new EditorProcessError({
      message: `Failed to launch editor "${command}": ${result.error.message}`,
    });
  }

  if (result.status !== 0) {
    const outcome = result.signal
      ? `signal ${result.signal}`
      : `status ${result.status ?? "unknown"}`;
    throw new EditorProcessError({
      message: `Editor "${command}" exited with ${outcome}; document was not saved`,
    });
  }
};

export const editMarkdown = (
  initialContent: string
): Effect.Effect<
  MarkdownEditorResult,
  EditorConfigurationError | EditorProcessError | EditorFileError
> => {
  const command = configuredEditor();
  if (!command) {
    return Effect.fail(new EditorConfigurationError({ message: missingEditorMessage }));
  }

  return Effect.try({
    try: () => {
      const directory = mkdtempSync(join(tmpdir(), "aerograph-doc-"));
      const filePath = join(directory, "document.md");

      try {
        writeFileSync(filePath, initialContent, { encoding: "utf8", mode: 0o600 });
        runEditor(command, filePath);
        const content = readFileSync(filePath, "utf8");

        if (content.trim().length === 0) return { _tag: "Empty" } as const;
        if (content === initialContent) return { _tag: "Unchanged" } as const;
        return { _tag: "Edited", content } as const;
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    catch: (cause) => {
      if (cause instanceof EditorProcessError) return cause;
      return new EditorFileError({
        message: `Failed to prepare the temporary Markdown file: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        cause,
      });
    },
  });
};
