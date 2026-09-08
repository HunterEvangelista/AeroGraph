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

The configuration does not itself publish a website. An authenticated deployment provisions the Worker and binds the domain.

1. Sign into the Cloudflare account that owns the active `aerograph.dev` zone:
   ```bash
   node node_modules/wrangler/bin/wrangler.js login
   node node_modules/wrangler/bin/wrangler.js whoami
   ```
2. Review `wrangler.jsonc`. It deploys `aerograph-website` and registers **aerograph.dev** as a Workers Custom Domain; Cloudflare manages DNS and TLS. Check for an existing apex website or conflicting DNS records before proceeding. Do not remove unrelated mail or verification records. Use `CLOUDFLARE_ACCOUNT_ID` if account selection is needed.
3. Publish:
   ```bash
   bun run --cwd apps/website deploy
   ```
4. Verify the homepage, direct example URLs, `/project/`, `/not-a-page`, mobile layouts, font loading, and headers on the public domain.

`www.aerograph.dev` is not configured. Add a separate Cloudflare redirect to the canonical apex if needed. Roll back through the Worker's deployment history or redeploy a known-good commit.

### Git-connected deployment

In Cloudflare **Workers & Pages**, connect this repository to `aerograph-website` using Workers Builds:

- Production branch: `main`.
- Root directory: repository root, where the workspace lockfile lives.
- Build: `bun install --frozen-lockfile && bun run --cwd apps/website build`.
- Deploy: `node node_modules/wrangler/bin/wrangler.js deploy --config apps/website/wrangler.jsonc`.
- Build runtimes: Bun 1.2.15 and Node.js 24+.
- Require repository CI before merging to `main`.

For non-production branches, use `wrangler versions upload --config apps/website/wrangler.jsonc`, not `deploy`. Preview URLs are enabled; verify the first preview in the dashboard without promoting it to production. Page metadata continues to point to the canonical production domain.

Workers Builds needs no separate GitHub deployment secret. External automation should keep a scoped Cloudflare API token and account ID in its secret store, never in source.

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
