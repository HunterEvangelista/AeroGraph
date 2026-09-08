export const runtimeKind = process.versions["bun"] === undefined ? "node" : "bun";

export const runtimeDescription = (): string => {
  const bunVersion = process.versions["bun"];
  return bunVersion === undefined ? `Node.js ${process.versions.node}` : `Bun ${bunVersion}`;
};
