# AeroGraph Cloud Design Lab

A controlled environment for developing AeroGraph's visual language around one fixed signature form. The Cloud geometry, graph topology, and tangential orbital camera remain deterministic while material, Petrol intensity, typography, and wordmark treatments are compared.

Dark space is the fixed base environment. It supplies the contrast needed for speed, metallic depth, and concentrated chromatic highlights rather than treating dark mode as another permutation.

## Variables

### Material

- **Vapor** — fast airbrushed density with directional particulate drag
- **Liquid** — soft liquid-metal volume with sparse directional chrome highlights
- **Emulsion** — high-contrast photographic grain

### Petrol intensity

- **Restrained** — low-chroma alloy and a quiet warm index
- **Balanced** — black petrol, oxidized green, mint interference, and amber
- **Charged** — brighter interference color and a hotter index

Balanced is the working default. Petrol is fixed as the color family rather than one palette among unrelated alternatives.

### Typography

- **Extended** — wide, forward-leaning corporate grotesk
- **Industrial** — practical industrial grotesk
- **Humanist** — quieter editorial technical sans

### Wordmark

- **Slant** — forward-skewed extended wordmark
- **Mono** — `Space Mono` proxy for evaluating a Slight Chance Mono direction
- **Wide** — low geometric aerospace proportions

The control buttons preview each direction, and the larger lockup above the headline shows the active wordmark. The reusable optical ellipse is available at `assets/aerograph-mark.svg`. The Mono option prefers a locally available `Slight Chance Mono` font and falls back to `Space Mono`. The exact face requires a licensed webfont asset before it can be evaluated or shipped accurately.

Ambient graph detail remains subdued. The active neighborhood receives the strongest contrast and color so topology resolves through focus rather than an equally weighted mesh.

## Run

From the repository root:

```bash
python3 -m http.server 4173 --directory prototypes/aeroform
```

Open <http://localhost:4173>. Scroll to orbit the Cloud. Use the controls or press `M`, `C`, `T`, and `L` to cycle material, color, typography, and wordmark. The current permutation is encoded in the URL for sharing.

The prototype renders only in response to interaction and caps canvas pixel density. It is a dependency-free design study rather than production rendering code.

See `DESIGN_DIRECTION.md` for the locked foundation, remaining calibration decisions, and near-term website scope.
