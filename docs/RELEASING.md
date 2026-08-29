# CLI release workflow

Changesets manages versions for the public `aerograph` package. The CLI manifest at
`packages/cli/package.json` is the version source used by both the source CLI and the
bundled executable.

Publication is automated only after a version PR increments the CLI version on `main`.
Pull requests never receive npm credentials or an OpenID Connect token and never run the
publish command.

## Package boundary

Only `aerograph` is versioned and published. Changesets enforces this boundary in two
ways:

- `@aerograph/core` and `@aerograph/ai` are listed in `ignore`.
- `privatePackages.version` and `privatePackages.tag` are both disabled.

Both implementation packages also retain `"private": true` in their manifests. They are
bundled into the executable where needed, but they never receive release versions, npm
publications, or release git tags.

## Record release intent

Create a changeset for every user-visible CLI change:

```sh
bun run changeset:create
```

Select only `aerograph` and choose the appropriate semantic version bump. Commit the
generated Markdown file with the implementation. Changesets accumulate on `dev` until a
promotion PR brings them to `main`.

A push to `main` runs the version workflow. When pending changesets exist,
`changesets/action` opens or updates a `Version packages` PR targeting `main`. The PR runs
the same CI as any other change. Merging it consumes the pending changesets and updates
`packages/cli/package.json` and the CLI changelog.

`bun run changeset:version` remains available for isolated validation, but maintainers do
not commit its output directly during the normal release workflow.

## Publish an alpha

A push to `main` starts the publish workflow only when the CLI manifest changed. The
workflow compares the manifest at the previous `main` revision with the merged revision.
It proceeds only when SemVer increased to an `alpha` prerelease and `publishConfig.tag`
remains `alpha`; unrelated manifest edits and unchanged versions do not publish.

Before requesting approval from the protected `npm-release` environment, the workflow:

1. Runs formatting, lint, uncached typechecking, unit and integration tests, and builds
   with Bun 1.2.15.
2. Builds the npm tarball from a clean package lifecycle and verifies its exact six-file
   allowlist.
3. Installs and exercises that same tarball on the minimum supported Bun 1.1.38 runtime.

After environment approval, npm publishes the tested tarball with the `alpha` dist-tag,
OpenID Connect trusted publishing, and provenance. No `NPM_TOKEN` is used. A retry exits
successfully when that exact package version already exists.

## Enter alpha prerelease mode

Enter prerelease mode once at the beginning of an alpha series:

```sh
bun run changeset:pre-enter
```

Commit `.changeset/pre.json` so every checkout calculates the same prerelease versions.
The initial minor changeset advances the unpublished `0.0.0` baseline to
`0.1.0-alpha.0`; the baseline itself must never be published.

While prerelease mode remains active, Changesets advances the suffix in order, for
example `0.1.0-alpha.0` to `0.1.0-alpha.1`.

## Exit prerelease mode for stable

When the alpha series is ready to become stable, update the repository prerelease state
in a dedicated PR:

```sh
bun run changeset:pre-exit
```

Stable publishing requires an explicit change to the publication policy because the CLI
manifest and publish workflow intentionally reject anything other than the `alpha`
dist-tag. Do not merge a stable version PR until that policy, the release workflow, and
the protected npm publisher configuration have been updated and reviewed.

## Repository and npm configuration

The release automation depends on configuration outside the repository:

- The `CHANGESETS_GITHUB_TOKEN` Actions secret can write release branches and pull
  requests. It must be a token whose pushes trigger pull-request CI.
- The `npm-release` GitHub environment restricts deployments to `main` and requires the
  configured approval.
- npm trusted publishing names `HunterEvangelista/AeroGraph`, the `publish.yml` workflow,
  and the `npm-release` environment.
- The `aerograph` package is owned by the account that configures the trusted npm
  publisher.
