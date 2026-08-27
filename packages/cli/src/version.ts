import manifest from "../package.json" with { type: "json" };

export const CLI_VERSION = manifest.version;
