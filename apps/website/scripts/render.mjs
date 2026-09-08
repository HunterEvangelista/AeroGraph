export function escapeHtml(value) {
  if (typeof value !== "string") throw new TypeError("Website copy must be text");
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}
const e = escapeHtml;
const lines = (text) => e(text).replaceAll("\n", "<br />");
const arrow = '<span aria-hidden="true">↗</span>';
const exampleUrl = (slug) => `/examples/${slug}/`;

export function validateContent(site, examples) {
  const origin = new URL(site.url);
  if (origin.protocol !== "https:" || origin.origin !== site.url)
    throw new Error("Site URL must be an HTTPS origin without a trailing slash");
  for (const [name, value] of Object.entries(site.links)) {
    if (new URL(value).protocol !== "https:") throw new Error(`Link ${name} must use HTTPS`);
  }
  const slugs = new Set();
  for (const example of examples) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(example.slug) || slugs.has(example.slug))
      throw new Error(`Invalid or duplicate example slug: ${example.slug}`);
    if (!example.steps.length) throw new Error(`Example ${example.slug} needs steps`);
    slugs.add(example.slug);
  }
  for (const slug of [
    site.featured.slug,
    ...site.featured.contextLinks.map((link) => link.slug),
    ...examples.map((example) => example.related),
  ]) {
    if (!slugs.has(slug)) throw new Error(`Unknown example: ${slug}`);
  }
}

function wordmark() {
  return '<a class="wordmark" href="/" aria-label="AeroGraph home"><span>Aero</span><i class="wordmark-sphere" aria-hidden="true"></i><span>Graph</span></a>';
}
function cta(site, { compact = false, showNote = true } = {}) {
  const copy = site.cta;
  return `<section class="closing${compact ? " closing-compact" : ""}" aria-label="${e(copy.primary)}">
    ${compact ? "" : `<div><h2>${lines(copy.title)}</h2><p>${e(copy.description)}</p></div>`}
    <div class="closing-actions"><div class="action-row">
      <a class="button" href="${e(site.links.start)}">${e(copy.primary)} ${arrow}</a>
      <a class="text-link" href="${e(site.links.repository)}">${e(copy.secondary)} ${arrow}</a>
    </div>${showNote ? `<p class="caption">${e(copy.note)}</p>` : ""}</div>
  </section>`;
}
function layout(site, { title, description, path, body, artwork = false, noindex = false }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#141215" /><meta name="description" content="${e(description)}" />
<title>${e(title)} — ${e(site.name)}</title>
${noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${e(site.url + path)}" />`}
<meta property="og:type" content="website" /><meta property="og:site_name" content="${e(site.name)}" />
<meta property="og:title" content="${e(title)}" /><meta property="og:description" content="${e(description)}" />
<meta property="og:url" content="${e(site.url + path)}" /><meta property="og:image" content="${e(site.url)}/social.png" />
<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${e(site.name)}. ${e(site.hero.title)}" /><meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="preload" href="/fonts/syne-latin-variable.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="/styles.css" />${artwork ? '<script src="/artwork.js" defer></script>' : ""}
</head><body><a class="skip-link" href="#main">Skip to content</a><div class="page-shell">
<header class="masthead">${wordmark()}<nav aria-label="Main navigation"><a href="/#examples">${e(site.navigation.examples)}</a><a href="/project/"${path === "/project/" ? ' aria-current="page"' : ""}>${e(site.navigation.project)}</a><a href="${e(site.links.repository)}">${e(site.navigation.repository)} ${arrow}</a></nav></header>
<main id="main">${body}</main>
<footer class="footer"><div>${wordmark()}<p>${e(site.footer.note)}</p></div><a href="${e(site.links.author)}">${e(site.footer.author)}</a><nav aria-label="Footer navigation"><a href="${e(site.links.issues)}">${e(site.footer.feedback)}</a><a href="${e(site.links.license)}">${e(site.footer.license)}</a></nav></footer>
</div></body></html>`;
}
function exampleCard(example) {
  return `<article class="example-card"><h3><a href="${exampleUrl(example.slug)}">${e(example.title)} ${arrow}</a></h3><p>${e(example.summary)}</p></article>`;
}
export function renderHome(site, examples) {
  const f = site.featured;
  const body = `<section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy"><h1 id="hero-title">${e(site.hero.title)}</h1></div>
    <div class="artwork" aria-hidden="true"><div class="sphere-fallback"></div><canvas id="aeroform"></canvas></div>
    <div class="hero-bottom"><p class="hero-description">${e(site.hero.description)}</p><div class="hero-actions"><div class="action-row">
      <a class="button" href="${e(site.links.start)}">${e(site.hero.primary)} ${arrow}</a>
      <a class="text-link" href="#examples">${e(site.hero.secondary)} <span aria-hidden="true">↓</span></a>
    </div><p class="caption">${e(site.hero.note)}</p></div></div>
  </section>
  <div id="examples">
    <section class="featured" aria-labelledby="featured-title">
      <div class="featured-intro"><h2 id="featured-title">${lines(f.title)}</h2><p>${e(f.description)}</p>
        <a class="text-link" href="${exampleUrl(f.slug)}">${e(f.link)} ${arrow}</a>
        <p class="caption feature-disclaimer">${e(f.disclaimer)}</p>
      </div>
      <div class="brief"><div class="brief-heading"><span class="caption">${e(f.previewLabel)}</span><i class="brief-mark" aria-hidden="true"></i></div>
        <h3>${e(f.briefTitle)}</h3><p>${e(f.briefDescription)}</p>
        <nav class="context-links" aria-label="${e(f.contextLabel)}"><span class="caption">${e(f.contextLabel)}</span>
          ${f.contextLinks.map((link) => `<a href="${exampleUrl(link.slug)}">${e(link.label)} ${arrow}</a>`).join("")}
        </nav>
      </div>
    </section>
    <section class="section examples-section" aria-labelledby="examples-title">
      <h2 id="examples-title">${e(site.examples.title)}</h2>
      <div class="example-grid">${examples
        .filter((example) => example.slug !== f.slug)
        .map(exampleCard)
        .join("")}</div>
    </section>
  </div>${cta(site, { showNote: false })}`;
  return layout(site, {
    title: site.hero.title,
    description: site.description,
    path: "/",
    body,
    artwork: true,
  });
}
export function renderExample(site, example, examples) {
  const related = examples.find((item) => item.slug === example.related);
  const transition = example.transition;
  const body = `<article class="example-page">
    <header class="article-hero">
      <a class="text-link" href="/#examples"><span aria-hidden="true">←</span> ${e(site.examples.back)}</a>
      <p class="eyebrow">${e(site.examples.detailLabel)}</p><h1>${e(example.title)}</h1>
      <p class="article-lead">${e(example.situation)}</p>
    </header>
    <section class="walkthrough" aria-labelledby="walkthrough-title">
      <div><h2 id="walkthrough-title">${e(site.examples.stepsTitle)}</h2>
        <ol class="walkthrough-steps">${example.steps.map((step) => `<li><h3>${e(step.title)}</h3><p>${e(step.body)}</p></li>`).join("")}</ol>
      </div>
      <div class="sample-column"><aside class="example-artifact" aria-label="${e(example.sample.label)}">
        <p class="caption">${e(example.sample.label)}</p><p>${e(example.sample.text)}</p>
      </aside>
      ${
        transition
          ? `<aside class="status-example" aria-label="${e(transition.label)}"><p class="caption">${e(transition.label)}</p>
        <ol class="status-transition"><li>${e(transition.from)}</li><li><span aria-hidden="true">→</span> ${e(transition.to)}</li></ol>
        <p class="caption">${e(transition.description)}</p></aside>`
          : ""
      }
      </div>
    </section>
    <section class="boundary"><h2>${e(site.examples.boundaryTitle)}</h2><p>${e(example.boundary)}</p></section>
    ${example.takeaway ? `<p class="takeaway">${e(example.takeaway)}</p>` : ""}
    <nav class="related" aria-label="${e(site.examples.relatedTitle)}"><span>${e(site.examples.relatedTitle)}</span><a class="text-link" href="${exampleUrl(related.slug)}">${e(related.title)} ${arrow}</a></nav>
  </article>${cta(site, { compact: true })}`;
  return layout(site, {
    title: example.title,
    description: example.summary,
    path: exampleUrl(example.slug),
    body,
  });
}
export function renderProject(site, project) {
  const body = `<article class="project-page"><header class="article-hero">
    <h1>${e(project.title)}</h1><p class="article-lead">${e(project.intro)}</p>
    <div class="action-row"><a class="text-link" href="${e(site.links.author)}">${e(project.authorLabel)} ${arrow}</a><a class="text-link" href="${e(site.links.repository)}">${e(project.sourceLabel)} ${arrow}</a></div>
  </header><section class="engineering"><h2>${e(project.approachTitle)}</h2>
    ${project.choices.map((choice) => `<section class="engineering-choice"><h3>${e(choice.title)}</h3><div><p>${e(choice.body)}</p><p class="tradeoff">${e(choice.tradeoff)}</p></div></section>`).join("")}
  </section><section class="boundary"><h2>${e(project.statusTitle)}</h2><p>${e(project.status)}</p><a class="text-link" href="${e(site.links.issues)}">${e(project.feedbackLabel)} ${arrow}</a></section>
  </article>${cta(site, { compact: true, showNote: false })}`;
  return layout(site, {
    title: project.title,
    description: project.intro,
    path: "/project/",
    body,
  });
}
export function renderNotFound(site) {
  return layout(site, {
    title: site.notFound.title,
    description: site.notFound.description,
    path: "/404.html",
    noindex: true,
    body: `<section class="article-hero"><p class="eyebrow">404</p><h1>${e(site.notFound.title)}</h1><p>${e(site.notFound.description)}</p><a class="button" href="/">${e(site.notFound.link)}</a></section>`,
  });
}
