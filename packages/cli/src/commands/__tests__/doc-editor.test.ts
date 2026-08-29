import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type CliWorkspace, createCliWorkspace } from "../../__tests__/helpers/cli";

const extractCreatedId = (stdout: string): string => {
  const match = stdout.match(/ID:\s+([^\s]+)/);
  if (!match?.[1]) throw new Error(`Could not extract ID from stdout:\n${stdout}`);
  return match[1];
};

const editorScript = (body: string) => {
  const directory = mkdtempSync(join(tmpdir(), "aerograph-editor-test-"));
  const path = join(directory, "editor");
  writeFileSync(path, `#!/bin/sh\nset -eu\n${body}\n`);
  chmodSync(path, 0o755);
  return { directory, path };
};

describe("doc editor workflow", () => {
  let workspace: CliWorkspace | undefined;
  const editorDirectories: string[] = [];

  afterEach(() => {
    workspace?.cleanup();
    workspace = undefined;
    for (const directory of editorDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  const makeEditor = (body: string): string => {
    const editor = editorScript(body);
    editorDirectories.push(editor.directory);
    return editor.path;
  };

  it("creates a document through VISUAL and preserves Markdown headings", () => {
    const visual = makeEditor(`cat > "$1" <<'EOF'\n# Auth Notes\n\nKeep this heading.\nEOF`);
    const failingEditor = makeEditor("exit 42");
    workspace = createCliWorkspace({
      environment: { VISUAL: visual, EDITOR: failingEditor },
    });

    const created = workspace.run("doc", "create", "Editor-created doc");
    expect(created.status, created.stderr).toBe(0);

    const shown = workspace.run("doc", "show", extractCreatedId(created.stdout));
    expect(shown.status, shown.stderr).toBe(0);
    expect(shown.stdout).toContain("# Auth Notes");
    expect(shown.stdout).toContain("Keep this heading.");
  });

  it("opens existing Markdown when editing a document", () => {
    const editor = makeEditor(
      `grep -q "Original body" "$1"\ncat > "$1" <<'EOF'\n# Revised\n\nUpdated body.\nEOF`
    );
    workspace = createCliWorkspace({ environment: { VISUAL: undefined, EDITOR: editor } });
    const created = workspace.run(
      "doc",
      "create",
      "--content",
      "Original body",
      "--tags",
      "editor,markdown",
      "Editable doc"
    );
    const id = extractCreatedId(created.stdout);

    const edited = workspace.run("doc", "edit", id);
    expect(edited.status, edited.stderr).toBe(0);
    expect(edited.stdout).toContain("Version: 2");
    expect(edited.stdout).toContain(`ID:       ${id}`);
    const shortId = edited.stdout.match(/Short ID: ([^\s]+)/)?.[1];
    expect(shortId).toBeDefined();
    expect(id.startsWith(shortId ?? "")).toBe(true);
    expect(shortId?.length).toBeLessThan(id.length);
    expect(edited.stdout).toContain("Tags:     #editor, #markdown");

    const shown = workspace.run("doc", "show", id);
    expect(shown.stdout).toContain("# Revised");
    expect(shown.stdout).toContain("Updated body.");
  });

  it("aborts an unchanged edit without writing a version", () => {
    const editor = makeEditor("exit 0");
    workspace = createCliWorkspace({ environment: { VISUAL: editor, EDITOR: undefined } });
    const created = workspace.run("doc", "create", "--content", "Unchanged body", "Unchanged doc");
    const id = extractCreatedId(created.stdout);

    const edited = workspace.run("doc", "edit", id);
    expect(edited.status, edited.stderr).toBe(0);
    expect(edited.stdout).toContain("Document update aborted: content is unchanged.");

    const history = workspace.run("history", id);
    expect(history.status, history.stderr).toBe(0);
    expect(history.stdout).toContain(`History for ${id} (1)`);
    expect(history.stdout).not.toContain("v2");
  });

  it("fails before writing when no editor is configured", () => {
    workspace = createCliWorkspace({
      environment: { VISUAL: undefined, EDITOR: undefined },
    });

    const created = workspace.run("doc", "create", "Missing editor doc");
    expect(created.status).not.toBe(0);
    expect(created.stderr).toContain("No editor configured.");
    expect(created.stderr).toContain('export VISUAL="code --wait"');
    expect(created.stderr).not.toContain("EditorConfigurationError");
    expect(created.stderr).not.toContain("at editMarkdown");

    const listed = workspace.run("doc", "list", "--search", "Missing editor doc");
    expect(listed.status, listed.stderr).toBe(0);
    expect(listed.stdout).toContain("Documents (0)");
  });

  it("aborts empty editor content and keeps explicit --content non-interactive", () => {
    const editor = makeEditor(`printf "   \\n" > "$1"`);
    workspace = createCliWorkspace({ environment: { VISUAL: editor, EDITOR: undefined } });

    const empty = workspace.run("doc", "create", "Empty editor doc");
    expect(empty.status, empty.stderr).toBe(0);
    expect(empty.stdout).toContain("Document creation aborted: content is empty.");

    const scripted = workspace.run(
      "doc",
      "create",
      "--content",
      "# Scripted heading",
      "Scripted doc"
    );
    expect(scripted.status, scripted.stderr).toBe(0);
    expect(scripted.stdout).toContain("Document created successfully!");
  });

  it("does not write when the editor exits unsuccessfully", () => {
    const editor = makeEditor(`printf "# Incomplete\\n" > "$1"\nexit 7`);
    workspace = createCliWorkspace({ environment: { VISUAL: editor, EDITOR: undefined } });

    const created = workspace.run("doc", "create", "Failed editor doc");
    expect(created.status).not.toBe(0);
    expect(created.stderr).toContain("exited with status 7");
    expect(created.stderr).not.toContain("EditorProcessError");

    const listed = workspace.run("doc", "list", "--search", "Failed editor doc");
    expect(listed.status, listed.stderr).toBe(0);
    expect(listed.stdout).toContain("Documents (0)");
  });
});
