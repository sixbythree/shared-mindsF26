import { SPECIES, CROPS, WEEDS, RULES, createPlant, syncNextId, stepPlant, drawPlant, describe, isBad, isRipe, mix, rgba } from "./plants.js";
import { createGestures, HAND_BONES, PALM } from "./gestures.js";

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);

const WORLD = 3;          // the field is three screens wide
const MAX_PLANTS = 70;
const MAX_WEEDS = 14;
const SAVE_KEY = "human-nature-field-v1";
// ?speed=4 makes time in the field pass faster (for testing and demos).
const SPEED = Math.min(20, Math.max(0.1, Number(new URLSearchParams(location.search).get("speed")) || 1));

let W = 0;
let H = 0;
let dpr = 1;

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
}
window.addEventListener("resize", resize);
resize();

// ---------- the field ----------

const field = {
  plants: [],
  seeds: [],
  camX: WORLD / 2,
  camV: 0,
  camTarget: null,  // where a fist drag wants the view; the view glides toward it
  dragVel: 0,
  dragAt: 0,
  weedTimer: 16,
  milestone: false,
};

function spot(minGap = 0.09) {
  for (let tries = 0; tries < 40; tries++) {
    const x = 0.1 + Math.random() * (WORLD - 0.2);
    const z = 0.12 + Math.random() * 0.86;
    if (field.plants.every((p) => Math.hypot((p.x - x) * 1.2, p.z - z) > minGap)) return { x, z };
  }
  return { x: 0.1 + Math.random() * (WORLD - 0.2), z: 0.12 + Math.random() * 0.86 };
}

function newField() {
  field.plants = [];
  field.seeds = [];
  field.camX = WORLD / 2;
  field.milestone = false;
  for (let i = 0; i < 16; i++) {
    const { x, z } = spot(0.14);
    const sp = CROPS[i % CROPS.length];
    const growth = i < 3 ? 0.9 + Math.random() * 0.08 : 0.08 + Math.random() * 0.5;
    const p = createPlant(sp, x, z, growth);
    p.water = 0.45 + Math.random() * 0.3;
    field.plants.push(p);
  }
  for (let i = 0; i < 3; i++) {
    const { x, z } = spot(0.1);
    field.plants.push(createPlant(WEEDS[i % WEEDS.length], x, z, 0.3 + Math.random() * 0.4));
  }
}

function save() {
  try {
    const plants = field.plants.filter((p) => !p.cut);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ plants, camX: field.camX, milestone: field.milestone }));
  } catch { /* storage full or blocked */ }
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data || !Array.isArray(data.plants) || !data.plants.length) return false;
    field.plants = data.plants.filter((p) => SPECIES[p.species]);
    field.camX = data.camX ?? WORLD / 2;
    field.milestone = !!data.milestone;
    syncNextId(field.plants);
    return field.plants.length > 0;
  } catch {
    return false;
  }
}

if (!load()) newField();

// ---------- projection ----------

const horizon = () => H * 0.44;
const parallax = (z) => 0.45 + 0.55 * z;

function project(x, z) {
  const hy = horizon();
  const y = hy + (H * 1.02 - hy) * (0.03 + 0.97 * Math.pow(z, 1.25));
  const scale = 0.22 + 0.85 * z;
  const sx = W / 2 + (x - field.camX) * W * 0.8 * parallax(z);
  return { x: sx, y, scale, unit: H * 0.4 * scale };
}

function unproject(sx, z) {
  return field.camX + (sx - W / 2) / (W * 0.8 * parallax(z));
}

// Grass blades and far hills, made once.
const grass = [];
for (let i = 0; i < 1100; i++) {
  grass.push({ x: Math.random() * WORLD * 1.4 - WORLD * 0.2, z: Math.random(), h: 0.04 + Math.random() * 0.07, lean: (Math.random() - 0.5) * 0.6, tint: Math.random() });
}
grass.sort((a, b) => a.z - b.z);

const clouds = Array.from({ length: 7 }, (_, i) => ({ x: Math.random() * 1.4 - 0.2, y: 0.06 + Math.random() * 0.22, r: 0.06 + Math.random() * 0.08, speed: 0.004 + Math.random() * 0.006, i }));
const drops = Array.from({ length: 420 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 }));

// ---------- input ----------

const input = { sunKey: false, rainKey: false, mouse: { x: 0.5, y: 0.5, inside: false } };
let gestures = null;
let env = { sun: 0, rain: 0, wind: 0, time: 0 };
let effects = [];
let infoPlant = null;

function cursor() {
  if (gestures && gestures.state.cursor.visible) return { ...gestures.state.cursor, hand: true };
  if (input.mouse.inside) return { x: input.mouse.x, y: input.mouse.y, visible: true, hand: false };
  return { visible: false };
}

function plantScreen(p) {
  const s = project(p.x, p.z);
  const sp = SPECIES[p.species];
  const top = s.y - s.unit * sp.height * Math.max(0.12, Math.pow(p.growth, 0.75)) * (1 + p.lean * 0.14);
  return { ...s, top, half: Math.max(14, s.unit * 0.22) };
}

function pickAt(px, py, maxDist = 110) {
  let best = null;
  let bestD = maxDist;
  for (const p of field.plants) {
    if (p.cut) continue;
    const s = plantScreen(p);
    if (s.x < -50 || s.x > W + 50) continue;
    const dx = Math.max(0, Math.abs(px - s.x) - s.half);
    const dy = py < s.top ? s.top - py : py > s.y + 8 ? py - s.y - 8 : 0;
    const d = Math.hypot(dx, dy) - p.z * 6;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// "a tomato", "an eggplant"
const cap = (text) => text[0].toUpperCase() + text.slice(1);
const a = (word) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;

function toast(text, tone = "") {
  const el = $("toast");
  el.textContent = text;
  el.dataset.tone = tone;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

function throwSeeds(screenX, fromX = screenX) {
  const living = field.plants.filter((p) => !p.cut).length;
  const room = Math.max(0, MAX_PLANTS - living - field.seeds.length);
  if (!room) { toast("The field is full. Cut something down first."); return; }
  const n = Math.min(room, 3 + Math.floor(Math.random() * 3));
  for (let i = 0; i < n; i++) {
    const z = 0.2 + Math.random() * 0.75;
    const x = Math.max(0.05, Math.min(WORLD - 0.05, unproject(screenX, z) + (Math.random() - 0.5) * 0.25));
    field.seeds.push({ x, z, t: 0, dur: 0.7 + Math.random() * 0.4, fromX: fromX + (Math.random() - 0.5) * 40, species: CROPS[Math.floor(Math.random() * CROPS.length)] });
  }
  toast(`You threw ${n} seeds.`);
}

// A chop only cuts the plant you selected by pinching it.
function chop() {
  const p = infoPlant;
  if (!p || p.cut) { toast("Pinch a plant first to choose what to cut."); return; }
  const sp = SPECIES[p.species];
  effects.push({ type: "slash", x: plantScreen(p).x, t: 0 });
  p.cut = { t: 0, dir: Math.random() < 0.5 ? -1 : 1 };
  hideInfo();
  if (p.dead) toast(`You cleared a dead ${sp.name.toLowerCase()}.`, "good");
  else if (sp.kind === "weed") toast(`You cut down ${a(sp.name.toLowerCase())}. Good.`, "good");
  else if (p.barren) toast(`You cut down ${a(sp.name.toLowerCase())} that never fruited. Good.`, "good");
  else toast(`You cut down a healthy ${sp.name.toLowerCase()}.`, "bad");
}

function showInfo(p) {
  infoPlant = p;
  renderInfo();
  $("info").hidden = false;
}

function hideInfo() {
  infoPlant = null;
  $("info").hidden = true;
}

function renderInfo() {
  if (!infoPlant) return;
  const d = describe(infoPlant);
  $("info-name").textContent = d.name;
  $("info-latin").textContent = d.latin;
  $("info-about").textContent = d.about;
  $("info-status").textContent = `${d.status} ${d.water}`.trim();
  $("info").dataset.bad = d.bad ? "true" : "false";
  $("info-kind").textContent = d.kind === "weed" ? "Weed" : d.bad ? "Cut it down" : "Crop";
  const keys = document.body.dataset.mode !== "camera";
  $("info-hint").textContent = keys ? "Press C to cut it down. Click again to close." : "Karate chop to cut it down. Pinch again to close.";
}

// Pinch (or click) a plant to select it and open its card. Pinch again to close it.
function pinch(sx, sy) {
  if (infoPlant) { hideInfo(); return; }
  const p = pickAt(sx, sy);
  if (p) showInfo(p);
}

function onGesture(type, data) {
  if (paused) return;
  if (type === "sun") return;
  if (type === "throw") throwSeeds(data.x * W, data.from * W);
  else if (type === "chop") chop();
  else if (type === "pinch") pinch(data.x * W, data.y * H);
  else if (type === "drag") {
    // The field follows the fist like dragging with the mouse, but glides there.
    const now = performance.now() / 1000;
    if (field.camTarget === null) { field.camTarget = field.camX; field.dragVel = 0; field.dragAt = now; }
    const before = field.camTarget;
    field.camTarget = clampCam(field.camTarget - (data.dx * 1.2) / (0.8 * parallax(0.6)));
    const gap = Math.max(1 / 60, now - field.dragAt);
    field.dragVel += ((field.camTarget - before) / gap - field.dragVel) * 0.35;
    field.dragAt = now;
    field.camV = 0;
  }
}

const clampCam = (x) => Math.max(0.55, Math.min(WORLD - 0.55, x));

// Keyboard and mouse stand in for the body when there's no camera.
// ---------- mirror ----------
// Optional: you, mirrored, in the corner, for recording the game being played.

const MIRROR_KEY = "human-nature-mirror";
let mirrorOn = localStorage.getItem(MIRROR_KEY) === "true";

function setMirror(on) {
  mirrorOn = on;
  try { localStorage.setItem(MIRROR_KEY, String(on)); } catch { /* blocked */ }
  $("camera").dataset.mirror = String(on);
  $("mirror-toggle").setAttribute("aria-pressed", String(on));
  $("mirror-toggle").textContent = on ? "Hide me" : "Show me";
}
setMirror(mirrorOn);
$("mirror-toggle").addEventListener("click", () => setMirror(!mirrorOn));

function drawMirror() {
  if (!mirrorOn || !gestures) return;
  const video = $("video");
  if (video.readyState < 2) return;
  const c = $("mirror");
  const m = c.getContext("2d");
  m.save();
  m.translate(c.width, 0);
  m.scale(-1, 1);
  m.drawImage(video, 0, 0, c.width, c.height);
  m.restore();
}

// ---------- pause ----------

let paused = false;

function setPaused(on) {
  if (on === paused || !$("intro").hidden) return;
  paused = on;
  $("pause").hidden = !on;
  document.body.dataset.paused = String(on);
  input.sunKey = false;
  input.rainKey = false;
  if (!on) last = performance.now();
  else save();
}

$("resume").addEventListener("click", () => setPaused(false));

window.addEventListener("keydown", (e) => {
  // Leave browser shortcuts alone (Cmd+Shift+R, Cmd+C, Ctrl+R…).
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Escape") { setPaused(!paused); e.preventDefault(); return; }
  if (e.key.toLowerCase() === "m" && !e.repeat && gestures) { setMirror(!mirrorOn); e.preventDefault(); return; }
  if (paused) return;
  if (e.target.closest && e.target.closest("button, input")) return;
  const k = e.key.toLowerCase();
  if (k === "o") input.sunKey = true;
  else if (k === "r") input.rainKey = true;
  else if (k === "s" && !e.repeat) throwSeeds(input.mouse.x * W);
  else if (k === "c" && !e.repeat) chop();
  else if (k === "arrowleft") field.camV = -0.9;
  else if (k === "arrowright") field.camV = 0.9;
  else return;
  e.preventDefault();
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === "o") input.sunKey = false;
  else if (k === "r") input.rainKey = false;
});

let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, cam: field.camX, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  input.mouse = { x: e.clientX / W, y: e.clientY / H, inside: e.pointerType === "mouse" };
  if (!drag) return;
  if (Math.abs(e.clientX - drag.x) > 5) drag.moved = true;
  field.camX = clampCam(drag.cam - (e.clientX - drag.x) / (W * 0.8 * parallax(0.6)));
});
canvas.addEventListener("pointerup", (e) => {
  if (drag && !drag.moved) pinch(e.clientX, e.clientY);
  drag = null;
});
canvas.addEventListener("pointerleave", () => { input.mouse.inside = false; });

// ---------- drawing ----------

function drawSky() {
  const hy = horizon();
  const sun = env.sun;
  const rain = env.rain;
  const g = ctx.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, mix(mix("#b8c2c9", "#7fb6e6", sun), "#7d8790", rain * 0.8));
  g.addColorStop(1, mix(mix("#e4e3da", "#fbe7b8", sun), "#a9afb0", rain * 0.8));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, hy + 2);

  // The sun comes out when you make an O.
  if (sun > 0.01) {
    const sx = W * 0.5;
    const sy = hy * (0.75 - 0.45 * sun);
    const r = Math.min(W, H) * 0.07;
    const halo = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 6);
    halo.addColorStop(0, `rgba(255,236,170,${0.55 * sun})`);
    halo.addColorStop(1, "rgba(255,236,170,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, hy);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(env.time * 0.05);
    ctx.strokeStyle = `rgba(255,214,90,${0.7 * sun})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
      ctx.lineTo(Math.cos(a) * r * (1.8 + 0.3 * Math.sin(env.time * 2 + i)), Math.sin(a) * r * (1.8 + 0.3 * Math.sin(env.time * 2 + i)));
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,${206 + 20 * sun},${80 + 40 * sun},${Math.min(1, sun * 1.4)})`;
    ctx.fill();
  }

  // Clouds drift; rain makes them heavy and dark.
  for (const c of clouds) {
    const x = (((c.x + env.time * c.speed * (1 + rain * 2) - field.camX * 0.05) % 1.4) + 1.4) % 1.4 - 0.2;
    const cx = x * W;
    const cy = c.y * hy;
    const r = c.r * W * (1 + rain * 0.5);
    ctx.fillStyle = rgba(mix("#ffffff", "#5e6870", rain), 0.55 - sun * 0.35 + rain * 0.4);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.38, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + r * 0.5, cy - r * 0.15, r * 0.6, r * 0.35, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - r * 0.55, cy + r * 0.05, r * 0.5, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Far hills.
  for (let layer = 0; layer < 2; layer++) {
    const par = 0.1 + layer * 0.12;
    ctx.beginPath();
    ctx.moveTo(0, hy + 2);
    for (let x = 0; x <= W; x += 12) {
      const wx = x / W + field.camX * par * 2;
      const y = hy - H * (0.035 + layer * 0.015) * (1 + Math.sin(wx * (5 + layer * 3) + layer) * 0.6 + Math.sin(wx * 13) * 0.15);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, hy + 2);
    ctx.closePath();
    ctx.fillStyle = mix(layer ? "#8aa37a" : "#a7b8a2", "#6f7d72", rain * 0.5);
    ctx.fill();
  }
}

function drawGround() {
  const hy = horizon();
  const avgWater = field.plants.length ? field.plants.reduce((s, p) => s + p.water, 0) / field.plants.length : 0.5;
  const dryness = 1 - Math.min(1, avgWater / 0.5);
  const g = ctx.createLinearGradient(0, hy, 0, H);
  g.addColorStop(0, mix(mix("#a9bd7d", "#c9c07d", dryness), "#7f9468", env.rain * 0.4));
  g.addColorStop(1, mix(mix("#6b8f45", "#a08f55", dryness), "#56703e", env.rain * 0.4));
  ctx.fillStyle = g;
  ctx.fillRect(0, hy, W, H - hy);
  // Furrows, receding to the horizon.
  ctx.strokeStyle = "rgba(60,70,40,0.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const z = Math.pow(i / 14, 1.1);
    const y = project(0, z).y;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  return dryness;
}

function drawGrassBlade(b, dryness) {
  const s = project(b.x, b.z);
  if (s.x < -20 || s.x > W + 20) return;
  const h = s.unit * b.h * 2.2;
  const sway = Math.sin(env.time * 1.6 + b.x * 9) * (0.15 + env.wind * 0.3);
  ctx.strokeStyle = mix(mix("#4f7a35", "#86a64a", b.tint), "#b5a560", dryness * 0.8);
  ctx.lineWidth = Math.max(0.6, s.scale * 1.6);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.quadraticCurveTo(s.x + (b.lean + sway) * h * 0.3, s.y - h * 0.6, s.x + (b.lean + sway) * h * 0.7, s.y - h);
  ctx.stroke();
}

function drawRain() {
  if (env.rain < 0.02) return;
  const n = Math.floor(drops.length * env.rain);
  ctx.strokeStyle = `rgba(210,225,240,${0.35 + env.rain * 0.3})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const d = drops[i];
    const x = d.x * W;
    const y = d.y * H;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3 * d.s, y + 16 * d.s);
  }
  ctx.stroke();
}

function drawSeeds() {
  for (const s of field.seeds) {
    const k = Math.min(1, s.t / s.dur);
    const end = project(s.x, s.z);
    const x = s.fromX + (end.x - s.fromX) * k;
    const y = H + (end.y - H) * k - Math.sin(k * Math.PI) * H * 0.35;
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + 3 * (1 - k), 3 + 2 * (1 - k), k * 6, 0, Math.PI * 2);
    ctx.fillStyle = "#6b4a2e";
    ctx.fill();
  }
}

function drawEffects(dt) {
  effects = effects.filter((e) => (e.t += dt) < 0.4);
  for (const e of effects) {
    if (e.type === "slash") {
      const k = e.t / 0.4;
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`;
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath();
      ctx.moveTo(e.x - 60, horizon() + H * 0.05);
      ctx.lineTo(e.x + 60, H * 0.98);
      ctx.stroke();
    }
  }
}

// ---------- ghost hands ----------
// Your hands, floating over the field as soft white shapes with dotted joints.
// They take on each gesture: warm when you make a fist, a glow at the fingertips when you
// pinch, blue with falling drops when you show the back of your hand, gold as you hold the O.

const ghostCanvas = document.createElement("canvas");
const gctx = ghostCanvas.getContext("2d");
const ghostDrops = [];

function ghostLayer() {
  const w = Math.round(W * dpr);
  const h = Math.round(H * dpr);
  if (ghostCanvas.width !== w || ghostCanvas.height !== h) {
    ghostCanvas.width = w;
    ghostCanvas.height = h;
  }
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.clearRect(0, 0, w, h);
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  gctx.lineCap = "round";
  gctx.lineJoin = "round";
}

function stampGhost(alpha) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(ghostCanvas, 0, 0);
  ctx.restore();
}

function drawGhostHand(hand, dt, oProgress) {
  const pts = hand.pts.map((p) => ({ x: p.x * W, y: p.y * H }));
  const size = Math.max(16, Math.hypot(pts[0].x - pts[9].x, pts[0].y - pts[9].y));
  const bone = size * 0.3;
  const fill = oProgress > 0 ? mix("#ffffff", "#ffd75e", oProgress) : hand.fist ? "#ffe3a8" : hand.back ? "#cfe5ff" : "#ffffff";

  ghostLayer();
  for (const pass of [0, 1]) {
    gctx.strokeStyle = pass ? fill : "#2c3a26";
    gctx.fillStyle = pass ? fill : "#2c3a26";
    gctx.lineWidth = pass ? bone : bone + 4;
    gctx.beginPath();
    PALM.forEach((i, k) => (k ? gctx.lineTo(pts[i].x, pts[i].y) : gctx.moveTo(pts[i].x, pts[i].y)));
    gctx.closePath();
    gctx.fill();
    gctx.stroke();
    gctx.beginPath();
    for (const [a, b] of HAND_BONES) {
      gctx.moveTo(pts[a].x, pts[a].y);
      gctx.lineTo(pts[b].x, pts[b].y);
    }
    gctx.stroke();
  }
  stampGhost(0.55 * hand.alpha);

  // Dotted joints.
  ctx.save();
  ctx.globalAlpha = 0.75 * hand.alpha;
  ctx.fillStyle = "#2c3a26";
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.5, size * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }
  // A dashed outline traced around the fingertips, like a sketch.
  ctx.setLineDash([3, 6]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(44,58,38,0.7)";
  for (const tip of [4, 8, 12, 16, 20]) {
    ctx.beginPath();
    ctx.arc(pts[tip].x, pts[tip].y, bone * 0.75, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Pinch: a glow where thumb meets index.
  if (hand.pinch) {
    const x = (pts[4].x + pts[8].x) / 2;
    const y = (pts[4].y + pts[8].y) / 2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, size * 0.6);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rain: drops fall from the fingertips.
  if (hand.back && hand.alpha > 0.5) {
    for (const tip of [8, 12, 16, 20]) {
      if (Math.random() < dt * 9) ghostDrops.push({ x: pts[tip].x, y: pts[tip].y, vy: 80 + Math.random() * 60, life: 0.9 });
    }
  }

  // The gesture's name under the wrist.
  const name = hand.fist ? "fist" : hand.pinch ? "pinch" : hand.back ? "rain" : "";
  if (name) {
    ctx.globalAlpha = hand.alpha;
    ctx.font = `700 ${Math.round(Math.max(18, size * 0.32))}px Caveat, cursive`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#2c3a26";
    ctx.fillText(name, pts[0].x, pts[0].y + size * 0.55);
  }
  ctx.restore();
}

function drawGhosts(dt) {
  if (!gestures || !gestures.state.ready) return;
  const st = gestures.state;
  for (const hand of st.hands) if (hand.alpha > 0.02) drawGhostHand(hand, dt, st.oProgress);

  for (let i = ghostDrops.length - 1; i >= 0; i--) {
    const d = ghostDrops[i];
    d.life -= dt;
    d.vy += 500 * dt;
    d.y += d.vy * dt;
    if (d.life <= 0) { ghostDrops.splice(i, 1); continue; }
    ctx.fillStyle = `rgba(120,170,230,${Math.min(1, d.life * 1.5)})`;
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, 2.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCursor(c, hover) {
  // The selected plant: a ring at its base, and a dashed line up its height.
  if (infoPlant && !infoPlant.cut) {
    const s = plantScreen(infoPlant);
    const pulse = 0.5 + 0.5 * Math.sin(env.time * 4);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.half * 1.25, s.half * 0.36, 0, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = isBad(infoPlant) ? `rgba(194,73,43,${0.6 + 0.4 * pulse})` : `rgba(255,255,255,${0.6 + 0.4 * pulse})`;
    ctx.stroke();
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x - s.half * 1.25, s.y);
    ctx.lineTo(s.x - s.half * 1.25, s.top);
    ctx.moveTo(s.x + s.half * 1.25, s.y);
    ctx.lineTo(s.x + s.half * 1.25, s.top);
    ctx.stroke();
    ctx.restore();
  }
  if (hover && hover !== infoPlant) {
    const s = plantScreen(hover);
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.half * 1.1, s.half * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = isBad(hover) ? "rgba(214,80,50,0.28)" : "rgba(255,255,255,0.35)";
    ctx.fill();
  }
  if (!c.visible || !c.hand || c.fist) return;
  // A small target between thumb and index: this is where a pinch picks.
  ctx.beginPath();
  ctx.arc(c.x * W, c.y * H, 6, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(44,58,38,0.8)";
  ctx.stroke();
}

// ---------- loop ----------

let last = performance.now();
let statsTimer = 0;
let saveTimer = 0;

function frame(nowMs) {
  drawMirror();
  if (paused) {
    // Frozen: the last picture stays on screen and nothing grows or dries.
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  env.time += dt;

  if (gestures && gestures.state.ready) gestures.update(dt);
  const sunWanted = input.sunKey || (gestures && gestures.state.sun) ? 1 : 0;
  const rainWanted = Math.max(input.rainKey ? 1 : 0, gestures ? gestures.state.rain : 0);
  env.sun += (sunWanted - env.sun) * Math.min(1, dt * 1.8);
  env.rain += (rainWanted - env.rain) * Math.min(1, dt * 2.2);
  env.wind = 0.3 + env.rain * 0.7;

  // Fist drag: ease toward the target; when the fist opens, keep a little momentum.
  if (field.camTarget !== null) {
    field.camX += (field.camTarget - field.camX) * Math.min(1, dt * 9);
    const dragging = gestures && gestures.state.active === "drag";
    if (!dragging) {
      const recent = performance.now() / 1000 - field.dragAt < 0.15;
      // Carry on from where the view is (it lags the fist a little), toward the fist's last spot.
      const toGo = field.camTarget - field.camX;
      field.camV = (recent ? Math.max(-1.5, Math.min(1.5, field.dragVel * 0.6)) : 0) + toGo * 3;
      field.camTarget = null;
    }
  }

  // Camera glide.
  if (field.camV) {
    field.camX = clampCam(field.camX + field.camV * dt);
    field.camV *= Math.pow(0.02, dt);
    if (Math.abs(field.camV) < 0.01) field.camV = 0;
  }

  for (let i = 0; i < Math.ceil(SPEED); i++) simulate((dt * SPEED) / Math.ceil(SPEED));

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSky();
  const dryness = drawGround();

  const c = cursor();
  const hover = c.visible ? pickAt(c.x * W, c.y * H, 70) : null;

  // Back to front: grass and plants together.
  const plants = field.plants.slice().sort((a, b) => a.z - b.z);
  let gi = 0;
  for (const p of plants) {
    while (gi < grass.length && grass[gi].z <= p.z) drawGrassBlade(grass[gi++], dryness);
    const s = project(p.x, p.z);
    if (s.x < -s.unit || s.x > W + s.unit) continue;
    drawPlant(ctx, p, s.x, s.y, s.unit, env);
  }
  while (gi < grass.length) drawGrassBlade(grass[gi++], dryness);

  drawSeeds();
  drawRain();
  drawEffects(dt);
  drawGhosts(dt);
  drawCursor(c, hover);

  // Rain falls.
  for (const d of drops) {
    d.y += dt * (1.1 + d.s * 0.6);
    d.x -= dt * 0.08 * d.s;
    if (d.y > 1) { d.y = -0.05; d.x = Math.random() * 1.1; }
  }

  statsTimer -= dt;
  if (statsTimer <= 0) { statsTimer = 0.25; updateStats(); }
  saveTimer -= dt;
  if (saveTimer <= 0) { saveTimer = 5; save(); }
  if (infoPlant) {
    if (infoPlant.cut) hideInfo();
    else positionInfo();
  }

  requestAnimationFrame(frame);
}

function simulate(dt) {
  for (const p of field.plants) {
    if (p.cut) { p.cut.t += dt; continue; }
    const ev = stepPlant(p, dt, env);
    const sp = SPECIES[p.species];
    if (ev === "ripe") toast(`${cap(a(sp.name.toLowerCase()))} is bearing fruit.`, "good");
    else if (ev === "barren") toast(`${cap(a(sp.name.toLowerCase()))} grew up without fruit.`, "bad");
    else if (ev === "died") toast(`${cap(a(sp.name.toLowerCase()))} dried out and died.`, "bad");

    // Grown weeds drink from their neighbours and spread.
    if (sp.kind === "weed" && !p.dead && p.growth > 0.5) {
      for (const q of field.plants) {
        if (q === p || q.cut || Math.abs(q.x - p.x) > 0.22 || Math.abs(q.z - p.z) > 0.2) continue;
        q.water = Math.max(0, q.water - dt * RULES.weedThirst * p.growth);
      }
      if (p.growth >= 1) {
        p.spreadTimer -= dt;
        if (p.spreadTimer <= 0) {
          p.spreadTimer = 25 + Math.random() * 15;
          spawnWeed(p.x + (Math.random() - 0.5) * 0.3, p.z + (Math.random() - 0.5) * 0.2, p.species);
        }
      }
    }
  }
  field.plants = field.plants.filter((p) => !p.cut || p.cut.t < 1.3);

  // New weeds arrive on their own, faster in the rain.
  field.weedTimer -= dt * (1 + env.rain * 1.5);
  if (field.weedTimer <= 0) {
    field.weedTimer = 16 + Math.random() * 10;
    const { x, z } = spot(0.06);
    spawnWeed(x, z);
  }

  for (const s of field.seeds) s.t += dt;
  const landed = field.seeds.filter((s) => s.t >= s.dur);
  field.seeds = field.seeds.filter((s) => s.t < s.dur);
  for (const s of landed) {
    const p = createPlant(s.species, s.x, Math.min(0.98, Math.max(0.1, s.z)), 0.0);
    p.water = 0.5;
    field.plants.push(p);
  }
}

function spawnWeed(x, z, species) {
  const weeds = field.plants.filter((p) => !p.cut && SPECIES[p.species].kind === "weed").length;
  if (weeds >= MAX_WEEDS || field.plants.length >= MAX_PLANTS) return;
  x = Math.max(0.05, Math.min(WORLD - 0.05, x));
  z = Math.max(0.1, Math.min(0.98, z));
  field.plants.push(createPlant(species || WEEDS[Math.floor(Math.random() * WEEDS.length)], x, z, 0.03));
}

function updateStats() {
  const live = field.plants.filter((p) => !p.cut);
  const crops = live.filter((p) => SPECIES[p.species].kind === "crop" && !p.dead);
  const ripe = crops.filter(isRipe).length;
  const growing = crops.filter((p) => !p.barren && !isRipe(p)).length;
  const bad = live.filter(isBad).length;
  const water = live.length ? live.reduce((s, p) => s + p.water, 0) / live.length : 0;
  $("stat-fruit").textContent = ripe;
  $("stat-growing").textContent = growing;
  $("stat-bad").textContent = bad;
  $("water-fill").style.width = `${Math.round(water * 100)}%`;
  $("water-fill").dataset.low = water < 0.2 ? "true" : "false";
  if (!field.milestone && ripe >= 8) {
    field.milestone = true;
    toast("Eight plants are bearing fruit. The field is thriving.", "good");
  }
  if (gestures && gestures.state.ready) {
    $("gesture-label").textContent = gestures.state.label;
  }
  if (infoPlant) renderInfo();
}

function positionInfo() {
  const el = $("info");
  const s = plantScreen(infoPlant);
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let x = s.x + s.half + 16;
  if (x + w > W - 12) x = s.x - s.half - 16 - w;
  let y = Math.min(H - h - 12, Math.max(12, s.top - 10));
  el.style.transform = `translate(${Math.max(12, x)}px, ${y}px)`;
}

// ---------- start ----------

$("start-camera").addEventListener("click", async () => {
  $("intro").hidden = true;
  $("camera").hidden = false;
  document.body.dataset.mode = "camera";
  gestures = createGestures({
    video: $("video"),
    view: () => ({ w: W, h: H }),
    onEvent: onGesture,
    onStatus: (text) => { $("gesture-label").textContent = text; },
  });
  if (new URLSearchParams(location.search).has("debug")) window.humanNature = gestures;
  try {
    await gestures.start();
    toast("Make an O with your arms over your head to bring out the sun.");
  } catch (err) {
    console.error(err);
    $("camera").hidden = true;
    document.body.dataset.mode = "keys";
    gestures = null;
    toast("The camera didn't start. You can play with the keyboard.", "bad");
  }
});

$("start-keys").addEventListener("click", () => {
  $("intro").hidden = true;
  document.body.dataset.mode = "keys";
  toast("Hold O for the sun and R for rain.");
});

$("new-field").addEventListener("click", () => {
  if (!confirm("Start over with a new field?")) return;
  newField();
  hideInfo();
  save();
  toast("A new field.");
});

$("guide-toggle").addEventListener("click", () => {
  const g = $("guide");
  const open = g.dataset.open !== "true";
  g.dataset.open = String(open);
  $("guide-toggle").setAttribute("aria-expanded", String(open));
});

$("info-close").addEventListener("click", hideInfo);

requestAnimationFrame(frame);
