# Aero Graph website

Product and project showcase for **https://aerograph.dev**, hosted on Cloudflare Workers Static Assets. A small build step renders ordinary HTML from editable content. No React, client-side router, application backend, or runtime content service is required.

## Edit the content

All product copy is plain text in `content/`:

| File | Contents |
| --- | --- |
| `content/site.json` | Homepage sections, shared navigation, repository/documentation/author links, calls to action, metadata, and 404 copy |
| `content/examples.json` | Card/metadata summaries, situations, short steps, one sample per example, optional status transition/takeaway, boundaries, and related examples |
| `content/project.json` | Project explanation, engineering choices, trade-offs, and development status |

Edit the JSON strings, then rebuild. Use `\n` in homepage section titles for an intentional line break. HTML in copy is escaped, not executed. Keep shared URLs in `site.json` under `links`; use HTTPS. `site.url` is the canonical origin with no trailing slash.

To add an example, copy an entry in `examples.json`, give it a unique lowercase hyphenated `slug`, and supply its title, summary, situation, steps, sample, boundary, and an existing `related` slug. `transition` and `takeaway` are optional. The build adds the detail page and sitemap entry automatically; examples other than `site.featured.slug` also receive homepage cards. A slug determines a public URL; keep published slugs stable or add a redirect when renaming one. The featured brief lives in `site.json`; keep it consistent with its full example. Titles are shared between cards and detail pages; summaries appear on cards and in metadata, not as an additional detail-page introduction.

Content principles:

- Explain recognizable situations in plain language, not internal terminology or command syntax.
- Present examples as illustrative workflows, not customer outcomes or automatic product features.
- Keep installation and changing CLI details in the linked repository documentation.
- Make the engineering inspectable without turning the homepage into a résumé.
- Separate current capabilities from future cloud-content and graph-backed navigation ideas.

## Develop and verify

From the repository root, with Bun 1.2.15 and Node.js 24+:

```bash
bun install --frozen-lockfile
bun run --cwd apps/website dev
```

Open the local URL printed by Wrangler. After editing copy, templates, or assets, run `bun run --cwd apps/website build` and refresh the preview.

```bash
bun run --cwd apps/website build
bun run --cwd apps/website lint
node node_modules/playwright/cli.js install chromium
bun run --cwd apps/website test
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config apps/website/wrangler.jsonc
```

The build validates example references and URLs, renders all pages before replacing the output, and copies only `public/` assets into `dist/`. Content sources, scripts, repository files, and local graph data are not deployed. `scripts/render.mjs` owns page structure; `public/styles.css` owns layout and appearance. Generated HTML is not an editing surface.

Pages:

- `/`: direct product explanation, a compact handoff brief, two other examples, and a getting-started action.
- `/examples/<slug>/`: a situation, suggested workflow, and explicit capability boundaries.
- `/project/`: engineering choices and trade-offs, author attribution, and links to inspect the source.
- `/404.html`: a genuine 404 response for unknown paths.

Browser tests cover all public pages at mobile, tablet, and desktop widths; internal links and fragments; canonical metadata and sitemap entries; security headers; keyboard navigation; compact homepage and example structure; no-JavaScript and no-canvas fallbacks; reduced motion; and content escaping/validation. CI installs Chromium, runs the workspace tests, and validates a Cloudflare deployment dry run.

## Deploy to Cloudflare

**GitHub Actions is the only production publishing mechanism.** The `Deploy production website` job in `.github/workflows/ci.yml` runs only for upstream pushes to `main`, after Quality, Tests, Build and package, Bun minimum runtime, and every Node.js runtime check succeed. Pull requests, forks, and `dev` cannot publish. Do not enable Workers Builds or publish production from a local Wrangler session.

### Owner setup and first-deployment preflight

1. Confirm the active `aerograph.dev` zone belongs to the intended Cloudflare account. Inspect existing apex DNS, any current website, Worker `aerograph-website`, and Custom Domains. Preserve mail, verification, and unrelated DNS records; resolve any apex conflict explicitly before approval.
2. Create GitHub environment **`website-production`**, restrict it to the `main` branch, and configure Hunter Evangelista as a required reviewer. If the owner also initiates releases, allow that reviewer to approve their own deployment. Do not approve the first deployment until the domain preflight is complete.
3. Store a scoped `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as environment secrets. Restrict the token to the intended account and zone, with Workers deployment and Custom Domain permissions. Confirm required permissions against Cloudflare's current documentation. Never put credentials in source, content, artifacts, or logs.
4. Keep `main` protected against force pushes and deletion, with reviewed merges and repository checks. The deployment ordering guarantee relies on forward-only branch history and a single publishing mechanism.
5. Merge the reviewed website and workflow into `main`, wait for all CI jobs, then approve the pending `website-production` deployment in GitHub Actions.

`wrangler.jsonc` binds **aerograph.dev** as a Workers Custom Domain. The authenticated deployment can create the Worker and configure DNS/TLS; the configuration file and dry run alone do not provision anything. A missing apex-record warning is expected until the domain is bound. Do not add a placeholder IP address. `www.aerograph.dev` is not configured and is not a launch requirement. A redirect needs a separate reviewed configuration with path/query and loop checks. Website hosting does not require MX records; email delivery and anti-spoofing policy belong to a separate mail configuration.

### Revision safety and failure handling

The job checks out the exact CI SHA, installs the frozen workspace lockfile with Bun 1.2.15 and Node.js 24, and builds before exposing Cloudflare credentials to the publish step. Production jobs share a non-cancelling concurrency group. Immediately before publishing, a guard verifies the upstream push event, checkout SHA, current remote `main` SHA, and both credentials. An older run or rerun fails if `main` has advanced. A push during an active publish can queue another deployment, but cannot let that newer deployment be overwritten by the older job. GitHub does not guarantee pending-job ordering; use the current head's CI run if an eligible pending run is displaced.

Failed or skipped required jobs prevent publishing. Missing credentials, stale revisions, network errors, build failures, and Wrangler errors fail visibly. Do not cancel an active publish as a rollback mechanism: Cloudflare may already have accepted it. A failed publish can leave a changed remote deployment; inspect Cloudflare history before retrying.

The Cloudflare version message records the full commit SHA, GitHub run ID, and attempt. The publish log contains the Cloudflare version ID, and the job summary links the tested revision and CI run. A successful publish is not proof that public DNS/TLS and every route are working.

### Verify the public domain

After publishing, record the SHA, CI run URL, Cloudflare version/deployment ID, verification time, and results in the release record. Compare DNS with the preflight inventory to confirm unrelated records are unchanged.

- Confirm the apex Custom Domain targets `aerograph-website`, DNS resolves, and HTTPS has a valid certificate. Do not bypass certificate validation.
- Check `/`, `/project/`, `/examples/agent-handoff/`, `/examples/remember-the-reason/`, and `/examples/pick-up-the-thread/` return 200 and the intended content.
- Check `/styles.css`, `/artwork.js`, `/favicon.svg`, `/social.png`, `/fonts/syne-latin-variable.woff2`, `/fonts/OFL.txt`, `/robots.txt`, and `/sitemap.xml` return the expected assets, not fallback HTML. Inspect font rendering and the social preview.
- Check `/not-a-page` and `/examples/not-an-example/` return real HTTP 404s with `noindex`, not a homepage response.
- Inspect canonical and Open Graph URLs for `https://aerograph.dev`, sitemap routes, and the robots sitemap URL.
- Confirm CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `X-Frame-Options` match `public/_headers` on representative pages, including the 404.
- Check mobile layout and navigation. Local browser tests complement, but do not replace, public-domain verification.

### Redeployment and recovery

For a transient failure, open the **push-to-main CI run for the current `main` SHA** and use GitHub's rerun controls, then approve the environment again. Rerun all jobs if required artifacts have expired. Do not rerun an older revision or use a PR run; the guard rejects them.

To restore known-good content, find its commit in the successful CI summary and Cloudflare version history. Submit a reviewed revert or restoration of the affected website files to `main`, preserving the deployment safeguards. The resulting new commit passes the same CI and approval path. Do not reset/force-push `main` or use a competing dashboard/local publish to bypass ordering. Recheck the public-domain checklist and record the restored revision. If publishing failed after Cloudflare accepted an update, inspect its actual state rather than assuming the prior version is still live.

## Design, assets, and future boundaries

[`prototypes/aeroform/DESIGN_DIRECTION.md`](../../prototypes/aeroform/DESIGN_DIRECTION.md) supplies the visual identity: Syne, warm cream on ink, and vermilion/violet sphere material. The website uses that material as an accent and a lavender example brief as the main explanatory visual. The brief is illustrative, not live telemetry or a screenshot of an AeroGraph interface. The brief links are explicitly labeled as related examples, not live saved records. Workflow steps and the illustrative status transition belong on the handoff detail page. All copy and navigation work without JavaScript.

The decorative sphere uses fixed orbital progress, demand-driven rendering, and a cached material. It stays still at rest. Reduced-motion and touch users receive no pointer displacement. A CSS sculpture remains when JavaScript or canvas is unavailable. The artwork does not represent project data.

- `public/fonts/syne-latin-variable.woff2`: self-hosted Latin Syne, weights 400–800, from `https://cdn.jsdelivr.net/fontsource/fonts/syne:vf@latest/latin-wght-normal.woff2`. The checked-in binary pins the asset; builds do not download it.
- `public/fonts/OFL.txt`: SIL Open Font License from Google Fonts' `ofl/syne/OFL.txt`. Retain it with the font.
- `public/social.png`: checked-in 1200 × 630 preview. Regenerate after relevant copy or design updates with `bun run --cwd apps/website social`, then rebuild to copy it into `dist/`.
- `public/_headers`: same-origin CSP and security headers. Unhashed assets revalidate; fonts cache for one week. Rename font files when their contents change.

No analytics, cookies, external font requests, or hosted graph service are included. Supplement Chromium checks with Safari/Firefox, screen readers, high zoom, and constrained-device testing before launch.

Relevant AeroGraph records:

- `652f5113`: plain-language website direction.
- `2afa2930`: illustrative agent context handoff, including status-tag conventions.
- `2fdccd9f`: future copy from a cloud AeroGraph instance.
- `68506137`: future backend using AeroGraph navigation/retrieval.

The future content source can replace the build's local content-loading boundary. Public-content approval, authentication, caching, availability, and the navigation algorithm still require design; none is implied by the static website.
