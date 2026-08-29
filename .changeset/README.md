# Changesets

Changesets records release intent for the public `aerograph` package. See
[`docs/RELEASING.md`](../docs/RELEASING.md) for the AeroGraph prerelease workflow.

Create a changeset from the repository root:

```sh
bun run changeset:create
```

Every changeset must select only `aerograph`. The private `@aerograph/core` and
`@aerograph/ai` workspaces are excluded from versioning, npm publication, and git tags.
Changesets accumulate on `dev`; the version workflow opens or updates a PR against `dev`
that consumes them before the resulting release commit is promoted to `main`.
