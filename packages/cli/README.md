# @aerograph/cli

The AeroGraph command-line interface for local-first project knowledge graphs.

## Alpha

AeroGraph CLI is in alpha and requires Bun at runtime. Node.js is not a supported runtime.

```sh
bunx @aerograph/cli@alpha --help
bunx @aerograph/cli@alpha init
bunx @aerograph/cli@alpha status
```

The CLI is bundled into a single JavaScript artifact and stores its registry under `AEROGRAPH_HOME` (or the default user data location). The CLI is the supported interface in this alpha; no programmatic package API is provided.

## Licensing

AeroGraph is Copyright © Hunter Evangelista and licensed under Apache-2.0. The tarball includes `LICENSE` and the generated `THIRD_PARTY_LICENSES.md` for bundled dependencies.
