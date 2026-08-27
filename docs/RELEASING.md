# CLI release versioning

Changesets manages release versions for the public `@aerograph/cli` package. The CLI
manifest at `packages/cli/package.json` is the version source used by both the source CLI
and the bundled executable.

This repository does not publish from pull requests. `bun run changeset:publish` is an
operator command for the protected release automation tracked by AERO-89; do not run it
as part of normal versioning work.

## Package boundary

Only `@aerograph/cli` is versioned and published. Changesets enforces this boundary in two
ways:

- `@aerograph/core` and `@aerograph/ai` are listed in `ignore`.
- `privatePackages.version` and `privatePackages.tag` are both disabled.

Both implementation packages also retain `"private": true` in their manifests. They are
bundled into the executable where needed, but they never receive release versions, npm
publications, or release git tags.

## Create release intent

Create a changeset for every user-visible CLI change:

```sh
bun run changeset:create
```

Select only `@aerograph/cli` and choose the appropriate semantic version bump. Commit the
generated Markdown file with the implementation.

Apply all pending release intent with:

```sh
bun run changeset:version
```

This updates `packages/cli/package.json` and the CLI changelog. Review both files before
committing the result.

## Enter alpha prerelease mode

Enter prerelease mode once at the beginning of an alpha series:

```sh
bun run changeset:pre-enter
```

The command creates `.changeset/pre.json` with the `alpha` prerelease tag. Commit that
file so every checkout calculates the same prerelease versions. Create a CLI changeset,
then run `bun run changeset:version` to apply it.

The initial minor changeset in this repository advances the unpublished `0.0.0` baseline
to `0.1.0-alpha.0`. The baseline is not a release and must never be published.

## Advance alpha versions

Keep `.changeset/pre.json` in prerelease mode. For each alpha increment:

1. Run `bun run changeset:create` and select only `@aerograph/cli`.
2. Run `bun run changeset:version`.
3. Review the manifest and changelog changes.
4. Run the release validation suite before approving publication.

Within the same prerelease series, Changesets advances the suffix in order, for example
`0.1.0-alpha.0` to `0.1.0-alpha.1`. While prerelease mode is active,
`bun run changeset:publish` derives the npm `alpha` dist-tag from `.changeset/pre.json`.
The CLI manifest also sets `publishConfig.tag` to `alpha`, so a plain `npm publish` cannot
accidentally assign an alpha build to `latest`.

## Exit prerelease mode for stable

When the alpha series is ready to become stable:

```sh
bun run changeset:pre-exit
bun run changeset:version
```

Review the stable version and changelog, then commit the result. Stable publishing
requires a separate, explicit update to the publication policy because
`packages/cli/package.json` intentionally keeps plain npm publishing on the `alpha`
dist-tag. Do not publish a stable version until that policy and the protected release
automation have been reviewed.
