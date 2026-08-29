# Changesets

Changesets records release intent for the public `aerograph` package. See
[`docs/RELEASING.md`](../docs/RELEASING.md) for the AeroGraph prerelease workflow.

Create a changeset from the repository root:

```sh
bun run changeset:create
```

Every changeset must select only `aerograph`. The private `@aerograph/core` and
`@aerograph/ai` workspaces are excluded from versioning, npm publication, and git tags.
Changesets accumulate on `dev`; after they reach `main`, the version workflow opens or
updates the version PR that consumes them.
