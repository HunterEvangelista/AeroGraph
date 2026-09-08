# CLI release workflow

Changesets manages versions for the public `aerograph` package. The CLI manifest at
`packages/cli/package.json` is the version source used by both the source CLI and the
bundled executable.

Publication is automated only when a version PR has incremented the CLI version on `dev`
and the resulting commit is promoted to `main`. Pull requests never receive npm credentials
or an OpenID Connect token and never run the publish command.

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
generated Markdown file with the implementation.

A push to `dev` runs the version workflow. When pending changesets exist,
`changesets/action` opens or updates a `Version packages` PR targeting `dev`. The PR runs
the same CI as any other change. Merging it consumes the pending changesets and updates
`packages/cli/package.json` and the CLI changelog. Promote `dev` to `main` only after the
version PR has merged so the release branch receives the exact versioned tree.

Promotion PRs target `main` directly from `dev` and use a merge commit. After a promotion
merges, the sync workflow fast-forwards `dev` to the promotion commit so both long-lived
branches share the same tip. The sync refuses to move `dev` if another commit reaches it
during the promotion.

`bun run changeset:version` remains available for isolated validation, but maintainers do
not commit its output directly during the normal release workflow.

## Publish an alpha

A push to `main` starts the publish workflow only when the CLI manifest changed. The
workflow compares the manifest at the previous `main` revision with the merged revision.
It proceeds only when SemVer increased to an `alpha` prerelease and `publishConfig.tag`
remains `latest`; unrelated manifest edits and unchanged versions do not publish.

Before requesting approval from the protected `npm-release` environment, the workflow:

1. Runs formatting, lint, uncached typechecking, unit and integration tests, and builds
   with Bun 1.2.15.
2. Builds the npm tarball from a clean package lifecycle and verifies its exact six-file
   allowlist.
3. Installs and exercises that same tarball on the minimum supported Bun 1.1.38 runtime.

Before the first stable release, npm's `latest` dist-tag points to the current alpha so
`bunx aerograph` resolves the supported CLI. After environment approval, npm publishes the
tested tarball with OpenID Connect trusted publishing and provenance, then tags the exact
release commit as `aerograph@<version>`. No `NPM_TOKEN` is used. A retry skips publication
when that exact package version already exists and idempotently creates or verifies the
corresponding git tag. Tagging does not re-query the npm registry after publication because
registry reads can lag a successful publish.

If publication or tagging needs to be retried without another version increment, manually
run the `Publish CLI` workflow and provide the full SHA of the original version-incrementing
commit on `main` as `release_sha`. Run the workflow from its `main` ref. The workflow rejects
abbreviated SHAs and commits that are not ancestors of `main`; it rebuilds and validates the
selected commit before publishing or tagging it.

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

Stable publishing requires an explicit change to the release guard because the workflow
currently accepts only `alpha` prerelease versions. The npm dist-tag remains `latest`, so
the first stable release replaces the alpha as the default without a tag migration. Do not
merge a stable version PR until that policy and the release workflow have been updated and
reviewed.

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
- `PROMOTION_SYNC_DEPLOY_KEY` synchronizes successful `main` promotions back to `dev`.
- `RELEASE_TAG_TOKEN` pushes release tags. It must be a dedicated token with Contents and
  Workflows write permission because GitHub does not permit a deploy key or the built-in
  GitHub Actions token to tag a commit that adds or changes workflow files.
