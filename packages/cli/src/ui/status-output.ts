import { type CliOutput, formatLines } from "./output";

export interface StatusResult {
  readonly project: {
    readonly name: string;
    readonly id: string;
    readonly rootPath: string;
    readonly createdAt: string;
  };
  readonly storage: {
    readonly resolutionMethod: string;
    readonly configPath: string;
    readonly dbPath: string;
    readonly gitCommonDir: string | undefined;
  };
  readonly graph: {
    readonly totalEntities: number;
    readonly docs: number;
    readonly codeRefs: number;
    readonly stories: number;
    readonly diagrams: number;
    readonly totalTags: number;
    readonly totalLinks: number;
  };
}

export const formatStatus = (result: StatusResult, verbose: boolean): CliOutput => {
  const lines = [
    "",
    "AeroGraph Project Status",
    "=".repeat(40),
    "",
    `Project: ${result.project.name}`,
    `ID:      ${result.project.id}`,
    `Root:    ${result.project.rootPath}`,
    `Created: ${result.project.createdAt}`,
    "",
  ];

  if (verbose) {
    lines.push(
      "Storage and Resolution",
      "-".repeat(40),
      `Resolution: ${result.storage.resolutionMethod}`,
      `Registry:   ${result.storage.configPath}`,
      `Database:   ${result.storage.dbPath}`
    );
    if (result.storage.gitCommonDir) lines.push(`Git common: ${result.storage.gitCommonDir}`);
    lines.push("");
  }

  lines.push(
    "Graph Statistics",
    "-".repeat(40),
    `Entities: ${result.graph.totalEntities}`,
    `  - Docs:      ${result.graph.docs}`,
    `  - Code Refs: ${result.graph.codeRefs}`,
    `  - Stories:   ${result.graph.stories}`,
    `  - Diagrams:  ${result.graph.diagrams}`,
    `Tags:     ${result.graph.totalTags}`,
    `Links:    ${result.graph.totalLinks}`,
    ""
  );

  return formatLines(lines);
};
