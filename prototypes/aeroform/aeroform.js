const canvas = document.querySelector("#aeroform");
const context = canvas.getContext("2d");
const connection = document.querySelector("#connection");
const output = document.querySelector("#connection-value");
const readout = document.querySelector("#form-readout");
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const state = { palette: "vermilion", connection: 35 };
const query = new URLSearchParams(location.search);
if (["vermilion", "lavender"].includes(query.get("palette"))) {
  state.palette = query.get("palette");
}
const initialConnection = Number(query.get("connection"));
if (query.has("connection") && Number.isFinite(initialConnection)) {
  state.connection = Math.max(0, Math.min(100, initialConnection));
}
let width = 0;
let height = 0;
let frame = 0;
let pointer = { x: 0, y: 0 };
let sphere = null;

function syncControls() {
  document.body.dataset.palette = state.palette;
  document.querySelectorAll("button[data-palette]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.palette === state.palette));
  });
  connection.value = state.connection;
  output.value = `${state.connection}%`;
  readout.textContent = `${Math.round(state.connection * 3.6)}° / ${state.connection === 100 ? "Orbit complete" : "Traversing"}`;
}

function saveState() {
  const url = new URL(location.href);
  url.searchParams.delete("type");
  url.searchParams.delete("mark");
  for (const [key, value] of Object.entries(state)) url.searchParams.set(key, value);
  history.replaceState(null, "", url);
}

// The material is rasterized once per palette; interaction redraws only its placement and contours.
function buildSphere() {
  const size = 620;
  const surface = document.createElement("canvas");
  surface.width = surface.height = size;
  const ctx = surface.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  const lavender = state.palette === "lavender";
  const stops = lavender
    ? [[15, 12, 20], [47, 36, 61], [119, 99, 149], [191, 171, 219], [234, 222, 249]]
    : [[12, 10, 17], [49, 16, 39], [207, 27, 66], [246, 54, 70], [141, 125, 191]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - size / 2) / (size / 2 - 2);
      const ny = (y + 0.5 - size / 2) / (size / 2 - 2);
      const radius = nx * nx + ny * ny;
      if (radius >= 1) continue;
      const z = Math.sqrt(1 - radius);
      const light = Math.max(0, nx * 0.23 - ny * 0.64 + z * 0.66);
      const band = Math.exp(-((ny + 0.52 + nx * 0.26) ** 2) / 0.09);
      const value = Math.max(0, Math.min(0.999, light * 0.76 + band * 0.22));
      const scaled = value * (stops.length - 1);
      const index = Math.floor(scaled);
      const blend = scaled - index;
      const grain = (Math.sin(x * 127.1 + y * 311.7) * 43758.5453 % 1) * 3;
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        image.data[offset + channel] = stops[index][channel] * (1 - blend) + stops[index + 1][channel] * blend + grain;
      }
      image.data[offset + 3] = Math.min(1, (1 - Math.sqrt(radius)) * size / 2) * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return surface;
}

function orbitPoint(angle, t, cx, cy, radius) {
  const spread = radius * (0.46 + t * 0.8);
  const x = Math.cos(angle) * (radius * 1.12 + spread * 0.5);
  const y = Math.sin(angle) * (radius * 0.24 + spread * 0.28) + (t - 0.5) * radius * 0.65;
  const rotation = -0.6;
  return {
    x: cx + x * Math.cos(rotation) - y * Math.sin(rotation),
    y: cy + x * Math.sin(rotation) + y * Math.cos(rotation),
    front: Math.sin(angle) >= 0,
  };
}

function contourField(cx, cy, radius, front) {
  const amount = state.connection / 100;
  const lavender = state.palette === "lavender";
  context.strokeStyle = lavender ? "#21172d" : "#b29bcd";
  context.lineWidth = Math.max(0.65, width / 1300);
  const count = 42;
  // The traveler and trace share a fixed path; progress reveals geometry rather than deforming it.
  const start = Math.PI;
  const end = start + amount * Math.PI * 2;
  const from = front ? Math.PI * 2 : Math.PI;
  const to = Math.min(end, front ? Math.PI * 3 : Math.PI * 2);
  if (to <= from) return;
  for (let ring = 0; ring < count; ring++) {
    const t = ring / (count - 1);
    context.globalAlpha = front ? (lavender ? 0.7 : 0.62) : 0.48;
    context.beginPath();
    const steps = Math.max(2, Math.ceil((to - from) * 80));
    for (let step = 0; step <= steps; step++) {
      const angle = from + step / steps * (to - from);
      const point = orbitPoint(angle, t, cx, cy, radius);
      if (step === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.stroke();
  }
  context.globalAlpha = 1;
}

function render() {
  frame = 0;
  if (!context || !width || !height || !sphere) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  const radius = Math.min(width * 0.225, height * 0.32);
  const cx = width * 0.55 + pointer.x * 7;
  const cy = height * 0.53 + pointer.y * 5;
  const amount = state.connection / 100;
  const traveler = orbitPoint(Math.PI + amount * Math.PI * 2, 0.5, cx, cy, radius);
  const satellite = radius * 0.17;
  const drawTraveler = () => context.drawImage(sphere, traveler.x - satellite, traveler.y - satellite, satellite * 2, satellite * 2);
  contourField(cx, cy, radius, false);
  if (!traveler.front) drawTraveler();
  context.drawImage(sphere, cx - radius, cy - radius, radius * 2, radius * 2);
  contourField(cx, cy, radius, true);
  if (traveler.front) drawTraveler();
  canvas.parentElement.classList.add("is-rendered");
}

function requestRender() {
  if (!frame) frame = requestAnimationFrame(render);
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  width = bounds.width;
  height = bounds.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  requestRender();
}

document.querySelectorAll("button[data-palette]").forEach((button) => {
  button.addEventListener("click", () => {
    state.palette = button.dataset.palette;
    if (context) sphere = buildSphere();
    syncControls();
    saveState();
    requestRender();
  });
});
connection.addEventListener("input", () => {
  state.connection = Number(connection.value);
  syncControls();
  saveState();
  requestRender();
});
canvas.addEventListener("pointermove", (event) => {
  if (motionPreference.matches || event.pointerType === "touch") return;
  const bounds = canvas.getBoundingClientRect();
  pointer = { x: (event.clientX - bounds.left) / width - 0.5, y: (event.clientY - bounds.top) / height - 0.5 };
  requestRender();
});
function resetPointer() {
  pointer = { x: 0, y: 0 };
  requestRender();
}
canvas.addEventListener("pointerleave", resetPointer);
motionPreference.addEventListener("change", resetPointer);
syncControls();
if (context) {
  sphere = buildSphere();
  new ResizeObserver(resize).observe(canvas);
  resize();
}
