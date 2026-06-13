export const DEFAULT_ENTITY_ID_PREFIX_SCOPE = "local";

export interface EntityIdPrefixRow {
  readonly scope: string;
  readonly entityId: string;
  readonly prefix: string;
  readonly prefixLength: number;
  readonly updatedAt: string;
}

const now = (): string => new Date().toISOString();

const commonPrefixLength = (left: string | undefined, right: string | undefined): number => {
  if (!left || !right) return 0;

  let length = 0;
  const max = Math.min(left.length, right.length);
  while (length < max && left[length] === right[length]) {
    length += 1;
  }

  return length;
};

export const calculateEntityIdPrefixes = (
  ids: ReadonlyArray<string>,
  scope = DEFAULT_ENTITY_ID_PREFIX_SCOPE
): ReadonlyArray<EntityIdPrefixRow> => {
  const sortedIds = [...ids].sort();
  const timestamp = now();

  return sortedIds.map((id, index) => {
    const previous = sortedIds[index - 1];
    const next = sortedIds[index + 1];
    const prefixLength = Math.min(
      id.length,
      Math.max(commonPrefixLength(id, previous), commonPrefixLength(id, next)) + 1
    );

    return {
      scope,
      entityId: id,
      prefix: id.slice(0, prefixLength),
      prefixLength,
      updatedAt: timestamp,
    };
  });
};

export const formatEntityIdWithBoldPrefix = (
  entityId: string,
  prefix: string | null,
  options: { readonly ansi?: boolean } = {}
): string => {
  if (!prefix || !entityId.startsWith(prefix)) return entityId;
  const ansi = options.ansi ?? Boolean(process.stdout.isTTY && !process.env["NO_COLOR"]);
  if (!ansi) return entityId;
  return `\u001b[1m${prefix}\u001b[22m${entityId.slice(prefix.length)}`;
};
