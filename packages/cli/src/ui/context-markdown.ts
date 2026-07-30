import { type Entity, EntityType, type Link } from "@kioku/core";

export interface ContextEntity {
  readonly entity: Entity;
  readonly tags: ReadonlyArray<string>;
  readonly displayTags?: ReadonlyArray<string>;
}

export interface ContextMarkdownInput {
  readonly title: string;
  readonly entities: ReadonlyArray<ContextEntity>;
  readonly links: ReadonlyArray<Link>;
}

const sectionOrder = [
  { title: "Relevant Decisions", tags: ["decision", "decisions", "architecture-decision"] },
  { title: "Constraints", tags: ["constraint", "constraints"] },
  { title: "Risks / Sharp Edges", tags: ["risk", "risks", "sharp-edge", "sharp-edges"] },
  { title: "Canonical References", tags: ["canonical", "reference", "references"] },
] as const;

const codeLocation = (entity: Entity): string | undefined => {
  if (entity._tag !== EntityType.CodeRef) return undefined;
  const start = entity.startLine ? `:${entity.startLine}` : "";
  const end = entity.endLine ? `-${entity.endLine}` : "";
  return `${entity.filePath}${start}${end}`;
};

const escapeHeading = (value: string): string => value.replace(/#/g, "\\#");

const entityBlock = ({ entity, tags, displayTags }: ContextEntity): string => {
  const lines = [
    `### ${escapeHeading(entity.title)}`,
    "",
    `- ID: ${entity.id}`,
    `- Type: ${entity._tag}`,
  ];
  const location = codeLocation(entity);
  if (location) lines.push(`- Location: ${location}`);
  const renderedTags = displayTags ?? tags;
  if (renderedTags.length > 0) {
    lines.push(`- Tags: ${renderedTags.map((tag) => `#${tag}`).join(", ")}`);
  }
  lines.push("", entity.content || "(No content)", "");
  return lines.join("\n");
};

const hasAnyTag = (entity: ContextEntity, tags: ReadonlyArray<string>): boolean =>
  tags.some((tag) => entity.tags.includes(tag));

const without = (
  entities: ReadonlyArray<ContextEntity>,
  excluded: ReadonlySet<string>
): ReadonlyArray<ContextEntity> => entities.filter((entity) => !excluded.has(entity.entity.id));

const appendSection = (
  lines: string[],
  title: string,
  entities: ReadonlyArray<ContextEntity>,
  used: Set<string>
) => {
  if (entities.length === 0) return;
  lines.push(`## ${title}`, "");
  for (const entity of entities) {
    lines.push(entityBlock(entity));
    used.add(entity.entity.id);
  }
};

export const formatContextMarkdown = ({ title, entities, links }: ContextMarkdownInput): string => {
  const lines = [
    `# Kioku Context: ${title}`,
    "",
    "Agent-ready project memory exported from Kioku.",
    "",
  ];
  const used = new Set<string>();

  for (const section of sectionOrder) {
    appendSection(
      lines,
      section.title,
      entities.filter((entity) => !used.has(entity.entity.id) && hasAnyTag(entity, section.tags)),
      used
    );
  }

  appendSection(
    lines,
    "Code References",
    without(entities, used).filter((item) => item.entity._tag === EntityType.CodeRef),
    used
  );
  appendSection(
    lines,
    "Related Docs",
    without(entities, used).filter((item) => item.entity._tag === EntityType.Doc),
    used
  );
  appendSection(
    lines,
    "Stories",
    without(entities, used).filter((item) => item.entity._tag === EntityType.Story),
    used
  );
  appendSection(lines, "Other Context", without(entities, used), used);

  if (links.length > 0) {
    lines.push("## Relationships", "");
    for (const link of links) {
      lines.push(`- ${link.sourceId} --${link.type}--> ${link.targetId}`);
    }
    lines.push("");
  }

  lines.push("## Open Questions", "", "- None recorded in this context export.", "");
  return lines.join("\n");
};
