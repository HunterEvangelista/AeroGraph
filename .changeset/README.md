# Changesets

Changesets records release intent for the public `@aerograph/cli` package. See
[`docs/RELEASING.md`](../docs/RELEASING.md) for the AeroGraph prerelease workflow.

Create a changeset from the repository root:

```sh
bun run changeset:create
```

Every changeset must select only `@aerograph/cli`. The private `@aerograph/core` and
`@aerograph/ai` workspaces are excluded from versioning, npm publication, and git tags.
