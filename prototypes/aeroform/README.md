# Aeroform — Website foundation

A dependency-free visual experiment for Aero Graph: Syne typography, a sphere between Aero and Graph in the wordmark, and Vermilion / Ink material. The main sculpture uses a small orbiting sphere and progressively completed contour bands as an abstract relationship metaphor, not a visualization of project data.

## Preview

From the repository root:

```bash
python3 -m http.server 4173 --directory prototypes/aeroform
```

Open <http://localhost:4173>.

The design-study section contains two controls:

- **Palette:** Vermilion / Ink (primary) or Lavender / Black (alternate).
- **Orbit traversal:** scrub from 0° to 360° using a pointer or keyboard. The traveler follows a fixed path, passing behind and in front of the principal sphere. The contour trail closes at 360°. There is no automatic playback.

The URL stores palette and orbital progress (under `connection`). Unrecognized values use defaults; numeric progress is clamped to 0–100. Legacy `type` and `mark` parameters do not alter the fixed Syne/sphere wordmark foundation and are removed when controls update the URL.

Alternate preview: <http://localhost:4173/?palette=lavender&connection=75>.

## Implementation

- `index.html`: provisional product copy, wordmark, artwork, and prototype-only controls.
- `styles.css`: one font family, four content-size tokens, palette variables, and responsive layout.
- `aeroform.js`: cached sphere material, fixed orbital geometry, depth ordering, controls, and URL state.
- `DESIGN_DIRECTION.md`: baseline design rules and production handoff checklist for the future Cloudflare website.

Google Fonts supplies Syne; Arial is the offline fallback. No serif or monospace font is loaded. Code samples on a future page may use functional monospace styling, but ordinary labels and controls use Syne.

Canvas rendering is demand-driven, with pixel density capped at 2. Sphere shading is cached per palette. Pointer movement produces a small positional response; touch and reduced-motion users do not receive it. A CSS sphere remains visible when JavaScript or the 2D context is unavailable. There is no scroll hijacking.

The SVG in `assets/aerograph-mark.svg` is an unused earlier logo study. Reference artwork is not bundled. This prototype does not configure or deploy Cloudflare resources.
