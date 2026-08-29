const canvas = document.querySelector("#aeroform");
const context = canvas.getContext("2d", { alpha: true });
const experience = document.querySelector("#experience");
const railProgress = document.querySelector("#rail-progress");
const stageItems = [...document.querySelectorAll("#orbit-stages li")];
const controlGroups = [...document.querySelectorAll(".control-group")];
const permutationCode = document.querySelector("#permutation-code");
const coordinateReadout = document.querySelector("#coordinates");
const nodeIndex = document.querySelector("#node-index");
const nodeTitle = document.querySelector("#node-title");
const nodeDescription = document.querySelector("#node-description");

const TAU = Math.PI * 2;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const stages = [
  {
    title: "Fragment",
    description: "Context exists, but its relationships remain unresolved.",
    yaw: -0.7,
    elevation: 0.68,
    radius: 6.7,
  },
  {
    title: "Capture",
    description: "A durable memory becomes a stable point in the field.",
    yaw: 0.38,
    elevation: -0.18,
    radius: 5.8,
  },
  {
    title: "Connect",
    description: "Local relationships resolve from the surrounding atmosphere.",
    yaw: 1.48,
    elevation: 0.82,
    radius: 7,
  },
  {
    title: "Govern",
    description: "Protected knowledge remains visible inside a layered system.",
    yaw: 2.63,
    elevation: -0.55,
    radius: 6,
  },
  {
    title: "Retrieve",
    description: "One useful path illuminates while the larger graph recedes.",
    yaw: 3.82,
    elevation: 0.32,
    radius: 6.5,
  },
];

const materials = {
  airbrush: {
    code: "A1",
    note: "Fast vapor density with particulate edges and directional drag.",
  },
  liquid: {
    code: "A2",
    note: "Soft liquid volume with sparse directional chrome highlights.",
  },
  emulsion: {
    code: "A3",
    note: "High-contrast photographic grain resolves into durable structure.",
  },
};

const palettes = {
  "petrol-soft": {
    code: "C1",
    note: "Restrained petrol with low-chroma alloy and a quiet warm index.",
    dark: [18, 31, 28],
    mid: [55, 80, 73],
    light: [143, 165, 156],
    signal: [126, 207, 187],
    accent: [193, 113, 74],
    paper: [7, 13, 12],
  },
  petroleum: {
    code: "C2",
    note: "Balanced black petrol, oxidized green, mint interference, and amber.",
    dark: [16, 35, 31],
    mid: [39, 91, 78],
    light: [158, 194, 180],
    signal: [83, 242, 204],
    accent: [255, 118, 69],
    paper: [5, 11, 10],
  },
  "petrol-high": {
    code: "C3",
    note: "Charged petrol with brighter interference color and a hotter index.",
    dark: [9, 41, 32],
    mid: [18, 119, 95],
    light: [159, 231, 207],
    signal: [72, 255, 203],
    accent: [255, 101, 48],
    paper: [2, 9, 7],
  },
};

const typefaces = {
  extended: {
    code: "T1",
    note: "Wide corporate grotesk with compressed vertical rhythm.",
  },
  industrial: {
    code: "T2",
    note: "Direct industrial grotesk with practical proportions.",
  },
  humanist: {
    code: "T3",
    note: "Humanist technical sans with a quieter editorial voice.",
  },
};

const logos = {
  slant: {
    code: "L1",
    note: "Forward-skewed extended wordmark with the optical ellipse in-line.",
  },
  mono: {
    code: "L2",
    note: "Monospaced wordmark proxy for testing a Slight Chance Mono direction.",
  },
  wide: {
    code: "L3",
    note: "Low, geometric wordmark with wider aerospace proportions.",
  },
};

const optionSets = {
  material: materials,
  palette: palettes,
  type: typefaces,
  logo: logos,
};

const state = {
  material: "liquid",
  palette: "petroleum",
  type: "extended",
  logo: "slant",
};

let width = 0;
let height = 0;
let pixelRatio = 1;
let scrollProgress = 0;
let activeStage = 0;
let pointerX = 0;
let pointerY = 0;
let frame = 0;
let form = null;

function createRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  const a = Math.max(random(), 1e-7);
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(TAU * random());
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value) {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function distanceSquared(a, b) {
  const x = a[0] - b[0];
  const y = a[1] - b[1];
  const z = a[2] - b[2];
  return x * x + y * y + z * z;
}

function rgba(color, alpha) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function anchorPositions() {
  const heights = [0.42, -0.36, 0.7, -0.48, 0.18];
  return stages.map((stage, index) => [
    Math.cos(stage.yaw) * 2.15,
    heights[index],
    Math.sin(stage.yaw) * 1.85,
  ]);
}

function createMasses(anchors) {
  return [
    { center: [0, 0, 0], scale: [1.4, 1.05, 1.3], weight: 3 },
    ...anchors.map((position, index) => ({
      center: position.map((value) => value * 0.55),
      scale: [0.92 + (index % 2) * 0.2, 0.62, 0.82],
      weight: 1,
    })),
    { center: [-1.35, 0.72, 0.2], scale: [0.85, 0.5, 0.75], weight: 0.7 },
    { center: [1.2, -0.76, -0.8], scale: [0.72, 0.42, 0.9], weight: 0.65 },
  ];
}

function createCloudSampler(random, masses) {
  const weighted = masses.flatMap((mass) => Array(Math.ceil(mass.weight * 4)).fill(mass));
  return () => {
    const mass = weighted[Math.floor(random() * weighted.length)];
    let x = mass.center[0] + gaussian(random) * mass.scale[0];
    let y = mass.center[1] + gaussian(random) * mass.scale[1];
    let z = mass.center[2] + gaussian(random) * mass.scale[2];
    const falloff = 0.84 + random() * 0.18;
    x = x * falloff + Math.sin(y * 1.7 + z * 0.7) * 0.12;
    y = y * falloff + Math.sin(z * 1.4 - x * 0.4) * 0.08;
    z = z * falloff + Math.cos(x * 1.3 + y) * 0.12;
    return [x, y, z];
  };
}

function createParticles(random, sample) {
  return Array.from({ length: 5200 }, () => ({
    position: sample(),
    tone: random(),
    accent: random(),
    opacity: 0.45 + random() * 0.55,
    size: 0.65 + random() ** 2 * 4.3,
    shape: random(),
  }));
}

function connectEdge(edges, keys, from, to) {
  if (from === to) return;
  const key = from < to ? `${from}:${to}` : `${to}:${from}`;
  if (keys.has(key)) return;
  keys.add(key);
  edges.push([from, to]);
}

function nearestNodes(nodes, node, index) {
  return nodes
    .map((candidate, candidateIndex) => ({
      index: candidateIndex,
      distance: distanceSquared(node.position, candidate.position),
    }))
    .filter((candidate) => candidate.index !== index)
    .sort((a, b) => a.distance - b.distance);
}

function bridgeNode(nodes, anchors, index) {
  return nodes
    .map((node, nodeIndex) => ({
      index: nodeIndex,
      distance:
        distanceSquared(node.position, anchors[index]) +
        distanceSquared(node.position, anchors[index + 1]),
    }))
    .filter((candidate) => candidate.index >= anchors.length)
    .sort((a, b) => a.distance - b.distance)[0];
}

function buildGraph(random, anchors, sample) {
  const nodes = anchors.map((position, index) => ({
    position,
    anchor: true,
    stage: index,
    size: 4.2,
  }));

  for (let index = 0; index < 34; index += 1) {
    nodes.push({
      position: sample(),
      anchor: false,
      stage: -1,
      size: 1.3 + random() * 1.8,
    });
  }

  const keys = new Set();
  const edges = [];
  nodes.forEach((node, index) => {
    const nearest = nearestNodes(nodes, node, index);
    connectEdge(edges, keys, index, nearest[0].index);
    if (node.anchor || random() < 0.24) connectEdge(edges, keys, index, nearest[1].index);
  });

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const bridge = bridgeNode(nodes, anchors, index);
    connectEdge(edges, keys, index, bridge.index);
    connectEdge(edges, keys, bridge.index, index + 1);
  }
  return { nodes, edges };
}

function buildCloud() {
  const random = createRandom(4317);
  const anchors = anchorPositions();
  const masses = createMasses(anchors);
  const sample = createCloudSampler(random, masses);
  const particles = createParticles(random, sample);
  const graph = buildGraph(random, anchors, sample);
  return { particles, anchors, masses, ...graph };
}

function validOption(kind, value) {
  return Object.hasOwn(optionSets[kind], value);
}

function updateUrl() {
  const parameters = new URLSearchParams();
  parameters.set("material", state.material);
  parameters.set("palette", state.palette);
  parameters.set("type", state.type);
  window.history.replaceState(null, "", `${window.location.pathname}?${parameters}`);
}

function updateControls() {
  document.body.dataset.material = state.material;
  document.body.dataset.palette = state.palette;
  document.body.dataset.type = state.type;
  document.querySelector("#material-note").textContent = materials[state.material].note;
  document.querySelector("#palette-note").textContent = palettes[state.palette].note;
  document.querySelector("#type-note").textContent = typefaces[state.type].note;
  document.querySelector("#logo-note").textContent = logos[state.logo].note;
  permutationCode.textContent = `AG–CL / ${materials[state.material].code}·${palettes[state.palette].code}·${typefaces[state.type].code}·${logos[state.logo].code}`;

  for (const group of controlGroups) {
    const kind = group.dataset.control;
    for (const button of group.querySelectorAll("button")) {
      const selected = button.dataset.value === state[kind];
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
  }
}

function selectOption(kind, value, writeUrl = true) {
  if (!validOption(kind, value)) return;
  state[kind] = value;
  updateControls();
  if (writeUrl) updateUrl();
  requestRender();
}

function cycleOption(kind) {
  const options = Object.keys(optionSets[kind]);
  const nextIndex = (options.indexOf(state[kind]) + 1) % options.length;
  selectOption(kind, options[nextIndex]);
}

function loadState() {
  const parameters = new URLSearchParams(window.location.search);
  for (const kind of Object.keys(optionSets)) {
    const value = parameters.get(kind);
    if (value && validOption(kind, value)) state[kind] = value;
  }
  updateControls();
  updateUrl();
}

function updateStage(index) {
  if (index === activeStage && nodeTitle.textContent === stages[index].title) return;
  activeStage = index;
  const stage = stages[index];
  nodeIndex.textContent = String(index + 1).padStart(2, "0");
  nodeTitle.textContent = stage.title;
  nodeDescription.textContent = stage.description;
  stageItems.forEach((item, itemIndex) => {
    item.classList.toggle("is-active", itemIndex === index);
  });
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  const ratioLimit = width < 800 ? 1.25 : 1.5;
  pixelRatio = Math.min(window.devicePixelRatio || 1, ratioLimit);
  canvas.width = Math.floor(width * pixelRatio);
  canvas.height = Math.floor(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  requestRender();
}

function updateScroll() {
  const bounds = experience.getBoundingClientRect();
  const travel = Math.max(bounds.height - window.innerHeight, 1);
  scrollProgress = clamp(-bounds.top / travel, 0, 1);
  updateStage(Math.round(scrollProgress * (stages.length - 1)));
  railProgress.style.height = `${scrollProgress * 100}%`;
  requestRender();
}

function cameraAt(progress) {
  const scaled = progress * (stages.length - 1);
  const startIndex = Math.min(Math.floor(scaled), stages.length - 2);
  const endIndex = startIndex + 1;
  const amount = smoothstep(scaled - startIndex);
  const start = stages[startIndex];
  const end = stages[endIndex];
  const yaw = mix(start.yaw, end.yaw, amount);
  const elevation = mix(start.elevation, end.elevation, amount);
  const radius = mix(start.radius, end.radius, amount);
  const position = [Math.cos(yaw) * radius, elevation, Math.sin(yaw) * radius];
  const inward = normalize([-position[0], -elevation * 0.3, -position[2]]);
  const tangent = normalize([-Math.sin(yaw), 0.03, Math.cos(yaw)]);
  const orbitalView = normalize([
    inward[0] * 0.9 + tangent[0] * 0.42,
    inward[1] * 0.9 + tangent[1] * 0.42,
    inward[2] * 0.9 + tangent[2] * 0.42,
  ]);
  const pointerRight = normalize(cross(orbitalView, [0, 1, 0]));
  const forward = normalize([
    orbitalView[0] + pointerRight[0] * pointerX * 0.035,
    orbitalView[1] - pointerY * 0.035,
    orbitalView[2] + pointerRight[2] * pointerX * 0.035,
  ]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { position, forward, right, up, yaw, elevation, radius };
}

function createProjector(camera) {
  const focalLength = Math.min(width, height) * 1.34;
  const centerX = width * (width > 800 ? 0.5 : 0.48);
  const centerY = height * 0.5;
  return (position) => {
    const relative = subtract(position, camera.position);
    const depth = dot(relative, camera.forward);
    if (depth < 0.5) return null;
    const scale = focalLength / depth;
    return {
      x: centerX + dot(relative, camera.right) * scale,
      y: centerY - dot(relative, camera.up) * scale,
      depth,
      scale,
    };
  };
}

function particleFocus(position) {
  const distance = Math.sqrt(distanceSquared(position, form.anchors[activeStage]));
  return Math.exp(-distance * 0.72);
}

function baseParticleColor(particle, palette) {
  if (particle.tone < 0.18) return palette.dark;
  if (particle.tone < 0.72) return palette.mid;
  return palette.light;
}

function particleColor(particle, focus, palette) {
  if (focus > 0.6 && particle.accent > 0.84) return palette.signal;
  if (particle.accent > 0.995) return palette.accent;
  return baseParticleColor(particle, palette);
}

function drawAtmosphere(project, palette) {
  if (state.material === "emulsion") return;
  context.globalCompositeOperation = "screen";
  for (const mass of form.masses) {
    const projected = project(mass.center);
    if (!projected) continue;
    const radius = Math.max(...mass.scale) * projected.scale * 1.4;
    const gradient = context.createRadialGradient(
      projected.x - radius * 0.16,
      projected.y - radius * 0.12,
      0,
      projected.x,
      projected.y,
      radius
    );
    const centerAlpha = state.material === "liquid" ? 0.092 : 0.055;
    gradient.addColorStop(0, rgba(palette.light, centerAlpha));
    gradient.addColorStop(0.34, rgba(palette.mid, centerAlpha * 0.68));
    gradient.addColorStop(0.7, rgba(palette.dark, centerAlpha * 0.28));
    gradient.addColorStop(1, rgba(palette.dark, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(projected.x, projected.y, radius, 0, TAU);
    context.fill();
  }
  context.globalCompositeOperation = "source-over";
}

function materialAppearance(particle, point) {
  const perspective = 7.2 / point.depth;
  if (state.material === "liquid") {
    const nearness = clamp((10.5 - point.depth) / 5, 0.18, 1);
    const glint = smoothstep((particle.shape - 0.76) / 0.24);
    return {
      alpha: (0.052 + particle.opacity * 0.13 + glint * 0.19) * point.depthFade * nearness,
      size: clamp(particle.size * perspective, 0.75, 6.8),
    };
  }
  if (state.material === "emulsion") {
    return {
      alpha: (0.14 + particle.opacity * 0.32) * point.depthFade,
      size: clamp(particle.size * perspective * 0.58, 0.55, 3.4),
    };
  }
  return {
    alpha: (0.1 + particle.opacity * 0.24) * point.depthFade,
    size: clamp(particle.size * perspective * 0.74, 0.6, 5),
  };
}

function drawLiquidParticle(point, size) {
  const glint = smoothstep((point.particle.shape - 0.76) / 0.24);
  const length = size * (0.58 + glint * 2.8);
  const thickness = Math.max(0.35, size * (0.34 - glint * 0.13));
  context.save();
  context.translate(point.x, point.y);
  context.rotate(0.34);
  context.beginPath();
  context.ellipse(0, 0, length, thickness, 0, 0, TAU);
  context.fill();
  context.restore();
}

function drawParticle(point, palette) {
  const appearance = materialAppearance(point.particle, point);
  const color = particleColor(point.particle, point.focus, palette);
  context.fillStyle = rgba(color, appearance.alpha);

  if (state.material === "liquid" && appearance.size > 1.2) {
    drawLiquidParticle(point, appearance.size);
    return;
  }
  if (state.material === "emulsion" || appearance.size < 1.25) {
    context.fillRect(point.x, point.y, appearance.size, appearance.size);
    return;
  }
  context.beginPath();
  context.arc(point.x, point.y, appearance.size * 0.5, 0, TAU);
  context.fill();
}

function visibleParticles(project) {
  const visible = [];
  for (const particle of form.particles) {
    if (state.material === "liquid" && particle.shape < 0.06) continue;
    const projected = project(particle.position);
    if (
      !projected ||
      projected.x < -30 ||
      projected.x > width + 30 ||
      projected.y < -30 ||
      projected.y > height + 30
    ) {
      continue;
    }
    visible.push({
      particle,
      ...projected,
      focus: particleFocus(particle.position),
      depthFade: clamp(1.15 - Math.abs(projected.depth - 7) * 0.05, 0.48, 1),
    });
  }
  return visible.sort((a, b) => b.depth - a.depth);
}

function drawParticles(project, palette) {
  context.globalCompositeOperation = state.material === "emulsion" ? "source-over" : "screen";
  for (const point of visibleParticles(project)) drawParticle(point, palette);
  context.globalCompositeOperation = "source-over";
}

function graphAffinity(activeAnchor) {
  return form.nodes.map((node) => {
    const distance = Math.sqrt(distanceSquared(node.position, activeAnchor.position));
    return Math.exp(-distance * 0.72);
  });
}

function drawEdges(projectedNodes, affinity, palette) {
  context.lineCap = "round";
  for (const [fromIndex, toIndex] of form.edges) {
    const from = projectedNodes[fromIndex];
    const to = projectedNodes[toIndex];
    if (!from || !to) continue;
    const strength = Math.max(affinity[fromIndex], affinity[toIndex]);
    const anchored = fromIndex === activeStage || toIndex === activeStage;
    if (!anchored && strength < 0.12) continue;
    context.strokeStyle = anchored
      ? rgba(palette.signal, 0.9)
      : rgba(palette.light, 0.04 + strength * 0.26);
    context.lineWidth = anchored ? 2.2 : 0.85;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
}

function drawActiveNode(projected, palette) {
  if (state.material === "airbrush") {
    const gradient = context.createRadialGradient(
      projected.x,
      projected.y,
      0,
      projected.x,
      projected.y,
      24
    );
    gradient.addColorStop(0, rgba(palette.signal, 0.22));
    gradient.addColorStop(1, rgba(palette.signal, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(projected.x, projected.y, 24, 0, TAU);
    context.fill();
  }
  context.fillStyle = rgba(palette.paper, 0.96);
  context.strokeStyle = rgba(palette.signal, 0.95);
  context.lineWidth = 2;
  context.beginPath();
  context.arc(projected.x, projected.y, 8, 0, TAU);
  context.fill();
  context.stroke();
}

function drawNode(projected, index, affinity, palette) {
  const node = form.nodes[index];
  const isActive = index === activeStage;
  if (isActive) {
    drawActiveNode(projected, palette);
    return;
  }
  const size = node.anchor ? 4.8 : clamp(node.size * (7 / projected.depth), 1.3, 4);
  if (!node.anchor && affinity[index] < 0.1) return;
  context.fillStyle = node.anchor
    ? rgba(palette.signal, 0.86)
    : rgba(palette.light, 0.12 + affinity[index] * 0.62);
  if (state.material === "emulsion") {
    context.fillRect(projected.x - size, projected.y - size, size * 2, size * 2);
    return;
  }
  context.beginPath();
  context.arc(projected.x, projected.y, size, 0, TAU);
  context.fill();
}

function drawGraph(project, palette) {
  const projectedNodes = form.nodes.map((node) => project(node.position));
  const affinity = graphAffinity(form.nodes[activeStage]);
  drawEdges(projectedNodes, affinity, palette);
  projectedNodes
    .map((projected, index) => ({ projected, index }))
    .filter(({ projected }) => projected)
    .sort((a, b) => b.projected.depth - a.projected.depth)
    .forEach(({ projected, index }) => {
      drawNode(projected, index, affinity, palette);
    });
}

function requestRender() {
  if (frame !== 0 || document.hidden) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    render();
  });
}

function render() {
  if (!form || width === 0 || height === 0) return;
  context.clearRect(0, 0, width, height);
  const camera = cameraAt(scrollProgress);
  const project = createProjector(camera);
  const palette = palettes[state.palette];
  drawAtmosphere(project, palette);
  drawParticles(project, palette);
  drawGraph(project, palette);

  const azimuth = Math.round((camera.yaw * 180) / Math.PI);
  const elevation = Math.round((Math.atan2(camera.elevation, camera.radius) * 180) / Math.PI);
  coordinateReadout.textContent = `AZ ${azimuth >= 0 ? "+" : "−"}${String(Math.abs(azimuth)).padStart(3, "0")}° / EL ${elevation >= 0 ? "+" : "−"}${String(Math.abs(elevation)).padStart(2, "0")}° / R ${camera.radius.toFixed(1)}`;
}

for (const group of controlGroups) {
  const kind = group.dataset.control;
  for (const button of group.querySelectorAll("button")) {
    button.addEventListener("click", () => selectOption(kind, button.dataset.value));
  }
}

window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key.toLowerCase() === "m") cycleOption("material");
  if (event.key.toLowerCase() === "c") cycleOption("palette");
  if (event.key.toLowerCase() === "t") cycleOption("type");
  if (event.key.toLowerCase() === "l") cycleOption("logo");
});

window.addEventListener("pointermove", (event) => {
  if (reducedMotion) return;
  pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
  pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
  requestRender();
});
window.addEventListener("scroll", updateScroll, { passive: true });
window.addEventListener("resize", resize);
window.addEventListener("visibilitychange", requestRender);
window.addEventListener("pagehide", () => window.cancelAnimationFrame(frame));

form = buildCloud();
loadState();
resize();
updateScroll();
requestRender();
