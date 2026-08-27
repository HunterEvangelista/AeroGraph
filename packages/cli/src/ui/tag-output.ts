import type { TagGovernanceInspection } from "@aerograph/core";
import { type CliOutput, formatLines } from "./output";

export interface TagListResult {
  readonly tags: ReadonlyArray<TagGovernanceInspection>;
  readonly tree: boolean;
}

const formatTag = (inspection: TagGovernanceInspection, depth: number): string => {
  const { tag, term } = inspection;
  const description = tag.description ? ` - ${tag.description}` : "";
  const governance = term
    ? ` [governed: ${term.canonicalName} (${term.term.kind})]`
    : " [ungoverned]";
  return `${"  ".repeat(depth)}#${tag.id}${description}${governance}`;
};

const flatTagLines = (tags: ReadonlyArray<TagGovernanceInspection>): ReadonlyArray<string> =>
  tags.map((inspection) => formatTag(inspection, 0));

const treeTagLines = (tags: ReadonlyArray<TagGovernanceInspection>): ReadonlyArray<string> => {
  const byParent = new Map<string | undefined, TagGovernanceInspection[]>();
  for (const inspection of tags) {
    const siblings = byParent.get(inspection.tag.parentId) ?? [];
    siblings.push(inspection);
    byParent.set(inspection.tag.parentId, siblings);
  }

  const lines: string[] = [];
  const selectedIds = new Set<string>(tags.map((inspection) => inspection.tag.id));
  const visit = (inspection: TagGovernanceInspection, depth: number) => {
    lines.push(formatTag(inspection, depth));
    for (const child of byParent.get(inspection.tag.id) ?? []) visit(child, depth + 1);
  };

  for (const inspection of tags) {
    const parentId = inspection.tag.parentId;
    if (!parentId || !selectedIds.has(parentId)) visit(inspection, 0);
  }
  return lines;
};

export const formatTagList = ({ tags, tree }: TagListResult): CliOutput => {
  const lines = ["", `Tags (${tags.length})`, "=".repeat(40), ""];

  if (tags.length === 0) {
    lines.push("No tags found.", "", "Create one with: aerograph tag create <name>");
  } else {
    lines.push(...(tree ? treeTagLines(tags) : flatTagLines(tags)));
  }

  lines.push("");
  return formatLines(lines);
};
