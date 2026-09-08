# Aero Graph website foundation

## Principle

**Restrained typography, strange material.** The shaded sphere and orbital traversal carry the expressive identity. Layout, language, and interaction remain direct. Acid graphics inform color, material, and optical structure—not a collage of poster motifs.

## Baseline

- **Name and mark:** display the name as Aero Graph, with a small shaded sphere between the words. Preserve the capital G. The accessible name is “Aero Graph”; the sphere is decorative. Product commands and package names remain `aerograph`.
- **Palette:** Vermilion / Ink is primary: near-black, warm cream, red, and violet material. Lavender / Black remains an alternate composition in the experiment, not a requirement for a production theme switcher.
- **Typography:** Syne is the single brand family. The wordmark uses its heavy extended proportions; headlines use medium weight; body copy and controls use regular weight. No decorative serif or monospace labels.
- **Signature visual:** the small sphere traverses a fixed orbit around the principal sphere. Contour bands trace the completed path, closing at 360°. Front/back ordering gives traversal depth. This is an abstract relationship metaphor, not a rendering of project data.

## Typography rules

One family is the starting constraint, not a universal claim that more fonts are bad. Add a face only when real content exposes a functional need.

- Use four content-size roles: display, section heading, body, and caption. `styles.css` defines these as `--text-display`, `--text-heading`, `--text-body`, and `--text-caption`. The wordmark has separate logo sizing.
- Establish hierarchy with spacing, placement, and weight before adding another size or family.
- Keep body copy comfortably readable and captions at least 14 CSS pixels in the prototype. Do not use tiny uppercase text as a shorthand for technical credibility.
- Reserve monospace for actual commands and code. Prefer a system monospace stack unless code content warrants a dedicated font asset.
- Do not add italic accent words, mixed-font headlines, outlined lettering, or typographic distortion as default embellishments.
- Evaluate longer documentation and real navigation before deciding whether Syne needs a companion body face.

## Composition and language

- One clear product explanation takes priority over atmospheric slogans. Explain what AeroGraph stores, who uses it, and why relationships matter.
- Keep the main sculpture dominant. Do not add checkerboard scenery, fake telemetry, decorative numbering, figure captions, or arrows without a navigational purpose.
- Use negative space deliberately; it does not need to be filled with a second slogan.
- Texture belongs to the material, not across text and controls.
- The experiment's copy is provisional. Product claims must agree with the repository's actual capabilities; do not imply hosted sync or other unimplemented features.

## Interaction and accessibility

- Orbit progress is manually scrubbed in the experiment. Do not infer that production needs an always-running animation or a scroll-controlled camera.
- Remain still at rest; respect reduced motion; do not hijack scrolling. Current reduced-motion behavior suppresses pointer displacement while retaining explicit slider control.
- Controls must work by keyboard and have visible focus states. Color is not the sole selection indicator.
- Keep readable content and a static visual when JavaScript or canvas is unavailable.

## Production handoff: Cloudflare

`prototypes/aeroform` is the visual foundation, not the production site. Cloudflare deployment is a separate implementation task. No hosting configuration or production resource is provisioned by this experiment.

Before deployment:

1. Write and review the concise product explanation using real product capabilities.
2. Add genuine navigation and primary actions, likely documentation, source, and installation. Remove design-study controls and their explanatory section from the public page.
3. Choose the Cloudflare hosting/build integration appropriate to the production app; do not introduce a framework solely for the visual study.
4. Self-host the selected Syne weights with the required license notice, choose font-loading behavior, and check fallback layout. The prototype uses Google Fonts for convenience.
5. Decide how visitors traverse the orbit, retain a static fallback, and verify reduced-motion behavior, canvas cost, and layout stability on constrained devices.
6. Check contrast, keyboard access, screen readers, mobile layouts, zoom, and real content. Add production metadata and preview/deployment checks.

## References

Three works reproduced in [Eye on Design's acid graphics article](https://eyeondesign.aiga.org/acid-graphics-are-the-new-psychedelia-with-a-heady-dose-of-cynicism/) inform the material vocabulary:

- **Darren Oorloff — PP, Pure-Romance:** the sphere's synthetic red/violet shading, dark volume, and fine grain.
- **Jack Smith and Jeremy Rieger — Lotus:** overlapping contour systems, optical interference, and reflective organic forms contrasted with flat linework.
- **Anja Kaiser — Balance Presents Siren:** pale lavender against black, sharply resolved type against softly shaded forms.

The artworks, lettering, and compositions are not bundled or reproduced as site assets. Syne is an independent type choice, not an identification of a reference poster's font.
