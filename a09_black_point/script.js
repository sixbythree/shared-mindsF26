// Black Point: agree or disagree by leaning your hand in or out. Each answer is a tone curve;
// the ten curves and the ten pictures average into your own black-and-white filter.
import { STATEMENTS } from "./statements.js";
import { startCamera, createHand } from "./hand.js";

const params = new URLSearchParams(location.search);
const SECONDS_PER_STATEMENT = Number(params.get("seconds")) || 6;
const RECORD_LAST = Math.min(3, SECONDS_PER_STATEMENT / 2); // the answer is the average lean over these last seconds
const GAP = 0.9; // pause between statements
const SIZE = 480; // the stage is processed at this size
const SNAP = 480; // saved pictures are this size (the stage size, so the averaged picture stays sharp)

// Lean: +1 is all the way in (agree), −1 all the way out (disagree).
const LEAN = {
  inRange: 0.6, // palm looks 60% bigger than when calibrated = all the way in
  outRange: 0.38, // palm looks 38% smaller = all the way out
  deadZone: 0.08, // small wobbles around your resting hand count as nothing
  smoothing: 0.12, // seconds
  lostAfter: 400, // ms without a hand before the lean drifts back to neutral
  keyRate: 1.3, // per second while holding an arrow key
};
// How far a full lean moves the curve.
const MAX_CRUSH = 0.42; // leaning in moves the black point up and the white point down by this much
const AGREE = 0.15; // an answer beyond ±this counts as agreeing or disagreeing

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const sctx = stage.getContext("2d", { willReadFrequently: true });
const curveCanvas = $("curve");
const cctx = curveCanvas.getContext("2d");
const video = $("video");

const raw = document.createElement("canvas"); // the camera (or sketch) before the curve
raw.width = raw.height = SIZE;
const rctx = raw.getContext("2d", { willReadFrequently: true });
const small = document.createElement("canvas");
small.width = small.height = SNAP;
const smctx = small.getContext("2d", { willReadFrequently: true });

const hand = createHand(video);

const state = {
  mode: "intro", // intro | calibrate | countdown | run | results
  input: "hand", // hand | keys
  camera: false,
  lean: 0,
  target: 0,
  base: 0, // calibrated palm size
  calSizes: [],
  calProgress: 0,
  countdown: 0,
  index: 0,
  t: 0, // seconds into the current statement (negative during the gap before it)
  samples: [],
  answers: [],
  view: "live", // results: live | average
  saturation: 0,
  avgLut: null,
  composite: null, // { gray, color } Float32Arrays at SNAP×SNAP
  histogram: new Float32Array(64),
  keys: { up: false, down: false },
};

// ---------- Tone curves ----------

// A lean becomes a curve, a list of [input, output] points from 0 to 1, plus the points to mark on it.
// Leaning in moves the black point up and the white point down: more contrast, crushed blacks, blown whites.
// Leaning out solarizes, like a print exposed to light in the darkroom: the curve rises to a peak and
// falls back, so the brightest tones flip first. The peak slides left as you lean further, until at
// full lean the whole picture is inverted. (A straight slide to the inverse would pass through flat
// gray halfway, and a half "no" would erase the picture.)
export function curveFor(d) {
  if (d >= 0) {
    const bi = MAX_CRUSH * d;
    const wi = 1 - MAX_CRUSH * d;
    return { points: [[0, 0], [bi, 0], [wi, 1], [1, 1]], marks: [[bi, 0], [wi, 1]] };
  }
  const p = 1 + d; // where the curve peaks: 1 is no inversion, 0 is a full one
  if (p <= 0.001) return { points: [[0, 1], [1, 0]], marks: [[0, 1], [1, 0]] };
  return { points: [[0, 0], [p, 1], [1, 0]], marks: [[0, 0], [p, 1], [1, 0]] };
}

export function lutFor(c) {
  const lut = new Uint8ClampedArray(256);
  const pts = c.points;
  let s = 0;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    while (s < pts.length - 2 && x > pts[s + 1][0]) s++;
    const [x0, y0] = pts[s];
    const [x1, y1] = pts[s + 1];
    const y = x1 > x0 ? y0 + ((x - x0) / (x1 - x0)) * (y1 - y0) : y1;
    lut[i] = Math.round(Math.min(1, Math.max(0, y)) * 255);
  }
  return lut;
}

function averageLut(luts) {
  const out = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let sum = 0;
    for (const l of luts) sum += l[i];
    out[i] = Math.round(sum / luts.length);
  }
  return out;
}

// Applies a curve to pixels in place. Saturation 0 is black and white; 1 runs the curve on each color channel.
function applyLut(data, lut, saturation, hist) {
  if (hist) hist.fill(0);
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const y = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    if (hist) hist[y >> 2]++;
    const gy = lut[y];
    if (saturation <= 0) {
      data[p] = data[p + 1] = data[p + 2] = gy;
    } else {
      data[p] = gy + saturation * (lut[r] - gy);
      data[p + 1] = gy + saturation * (lut[g] - gy);
      data[p + 2] = gy + saturation * (lut[b] - gy);
    }
  }
}

// ---------- Picture source ----------

// Camera, mirrored, cropped to a square. Without a camera, a drawn stand-in like the sketch in my notes.
function drawSource(time) {
  if (state.camera && video.readyState >= 2) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const side = Math.min(vw, vh);
    rctx.save();
    rctx.translate(SIZE, 0);
    rctx.scale(-1, 1);
    rctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, SIZE, SIZE);
    rctx.restore();
    return;
  }
  const s = SIZE;
  const light = 0.5 + 0.5 * Math.sin(time / 1400);
  const bg = rctx.createLinearGradient(0, 0, s, s);
  bg.addColorStop(0, "#c9b79c");
  bg.addColorStop(1, "#3f4a5a");
  rctx.fillStyle = bg;
  rctx.fillRect(0, 0, s, s);
  const lx = s * (0.3 + 0.4 * light);
  const glow = rctx.createRadialGradient(lx, s * 0.25, 10, lx, s * 0.3, s * 0.8);
  glow.addColorStop(0, "rgb(255 236 200 / 70%)");
  glow.addColorStop(1, "rgb(255 236 200 / 0%)");
  rctx.fillStyle = glow;
  rctx.fillRect(0, 0, s, s);
  const skin = rctx.createRadialGradient(lx, s * 0.33, 5, s * 0.5, s * 0.42, s * 0.2);
  skin.addColorStop(0, "#e3b48f");
  skin.addColorStop(1, "#6b4430");
  rctx.fillStyle = "#24303f";
  rctx.beginPath();
  rctx.ellipse(s * 0.5, s * 1.02, s * 0.33, s * 0.4, 0, Math.PI, 0);
  rctx.fill();
  rctx.fillStyle = skin;
  rctx.beginPath();
  rctx.ellipse(s * 0.5, s * 0.42, s * 0.13, s * 0.17, 0, 0, Math.PI * 2);
  rctx.fill();
}

// ---------- Lean ----------

function leanFromSize(size) {
  if (!state.base) return 0;
  const ratio = size / state.base;
  let d = ratio >= 1 ? (ratio - 1) / LEAN.inRange : -(1 - ratio) / LEAN.outRange;
  d = Math.max(-1, Math.min(1, d));
  const m = Math.max(0, Math.abs(d) - LEAN.deadZone) / (1 - LEAN.deadZone);
  return Math.sign(d) * m;
}

let updateLean = function (dt, now) {
  if (state.input === "hand") {
    const fresh = now - hand.state.lastSeen < LEAN.lostAfter;
    state.target = fresh && state.base ? leanFromSize(hand.state.size) : 0;
  } else {
    if (state.keys.up) state.target += LEAN.keyRate * dt;
    if (state.keys.down) state.target -= LEAN.keyRate * dt;
    state.target = Math.max(-1, Math.min(1, state.target));
  }
  state.lean += (state.target - state.lean) * (1 - Math.exp(-dt / LEAN.smoothing));
}

// ---------- Flow ----------

function setMode(mode) {
  state.mode = mode;
  document.body.dataset.mode = mode;
  $("intro").hidden = mode !== "intro";
  $("calibrate").hidden = mode !== "calibrate";
  $("countdown").hidden = mode !== "countdown";
  $("statement").hidden = mode !== "run";
  $("result-controls").hidden = mode !== "results";
  $("answers").hidden = mode !== "results";
  $("reading").hidden = mode !== "results";
  $("lean-card").hidden = mode === "results";
}

function setStatus(text) {
  $("status").textContent = text;
}

async function begin(input) {
  state.input = input;
  $("start-hand").disabled = $("start-keys").disabled = true;
  setStatus("Asking for the camera…");
  state.camera = params.get("camera") === "off" ? false : await startCamera(video);
  if (input === "hand") {
    if (!state.camera) {
      state.input = "keys";
      setStatus("No camera, so the keys it is: hold ↑ to lean in, ↓ to lean out.");
    } else {
      try {
        await hand.start(setStatus);
      } catch (err) {
        console.warn(err);
        state.input = "keys";
        setStatus("The hand model didn't load, so the keys it is: ↑ in, ↓ out.");
      }
    }
  } else {
    setStatus(state.camera ? "" : "No camera: using a drawn stand-in.");
  }
  if (state.input === "hand") startCalibration();
  else startCountdown();
}

function startCalibration() {
  state.calSizes = [];
  state.calProgress = 0;
  state.base = 0;
  $("calibrate-text").textContent = "Hold up one open hand, palm to the camera, where it feels natural.";
  setMode("calibrate");
}

function updateCalibration(dt, now) {
  const fresh = now - hand.state.lastSeen < 200;
  if (fresh) {
    state.calSizes.push(hand.state.size);
    state.calProgress += dt / 1.5;
  } else {
    state.calProgress = Math.max(0, state.calProgress - dt);
    if (state.calProgress === 0) state.calSizes = [];
  }
  $("calibrate-fill").style.width = `${Math.min(1, state.calProgress) * 100}%`;
  if (state.calProgress >= 1) {
    const sorted = [...state.calSizes].sort((a, b) => a - b);
    state.base = sorted[Math.floor(sorted.length / 2)];
    startCountdown();
  }
}

function startCountdown() {
  state.countdown = 3;
  state.answers = [];
  state.index = 0;
  if (state.input === "keys") state.target = state.lean = 0;
  setMode("countdown");
}

function updateCountdown(dt) {
  state.countdown -= dt;
  $("countdown-text").textContent = Math.max(1, Math.ceil(state.countdown));
  if (state.countdown <= 0) startStatement(0);
}

function startStatement(i) {
  state.index = i;
  state.t = 0;
  state.samples = [];
  if (state.input === "keys") state.target = 0;
  $("count").textContent = `${i + 1} / ${STATEMENTS.length}`;
  $("statement-text").textContent = STATEMENTS[i];
  $("statement").classList.remove("fading");
  setMode("run");
}

function updateRun(dt) {
  state.t += dt;
  if (state.t < 0) return; // the gap before the next statement
  if (state.t >= SECONDS_PER_STATEMENT - RECORD_LAST) state.samples.push(state.lean);
  $("timer-fill").style.width = `${Math.min(1, state.t / SECONDS_PER_STATEMENT) * 100}%`;
  if (state.t >= SECONDS_PER_STATEMENT) {
    recordAnswer();
    if (state.index + 1 >= STATEMENTS.length) return finish();
    $("statement").classList.add("fading");
    const next = state.index + 1;
    state.t = -GAP;
    setTimeout(() => {
      if (state.mode !== "run") return;
      $("count").textContent = `${next + 1} / ${STATEMENTS.length}`;
      $("statement-text").textContent = STATEMENTS[next];
      $("statement").classList.remove("fading");
      $("timer-fill").style.width = "0%";
      state.index = next;
      state.samples = [];
      if (state.input === "keys") state.target = 0;
    }, GAP * 1000 * 0.5);
  }
}

function recordAnswer() {
  const d = state.samples.length ? state.samples.reduce((a, b) => a + b, 0) / state.samples.length : state.lean;
  const curve = curveFor(d);
  smctx.drawImage(raw, 0, 0, SNAP, SNAP);
  const picture = smctx.getImageData(0, 0, SNAP, SNAP);
  state.answers.push({ text: STATEMENTS[state.index], d, curve, lut: lutFor(curve), picture });
}

function finish() {
  const luts = state.answers.map((a) => a.lut);
  state.avgLut = averageLut(luts);
  // Average the ten pictures, each through its own curve.
  const n = SNAP * SNAP;
  const gray = new Float32Array(n);
  const color = new Float32Array(n * 3);
  for (const a of state.answers) {
    const px = a.picture.data;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const y = (0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2]) | 0;
      gray[i] += a.lut[y];
      color[i * 3] += a.lut[px[p]];
      color[i * 3 + 1] += a.lut[px[p + 1]];
      color[i * 3 + 2] += a.lut[px[p + 2]];
    }
  }
  const k = state.answers.length;
  for (let i = 0; i < n; i++) gray[i] /= k;
  for (let i = 0; i < n * 3; i++) color[i] /= k;
  state.composite = { gray, color };
  state.view = "live";
  updateViewButtons();
  renderAnswers();
  writeReading();
  setMode("results");
}

// ---------- Results ----------

function verdict(d) {
  const pct = Math.round(Math.abs(d) * 100);
  if (d > AGREE) return `Agreed · leaned in ${pct}%`;
  if (d < -AGREE) return `Disagreed · leaned out ${pct}%`;
  return "Held still";
}

function renderAnswers() {
  const list = $("answer-list");
  list.innerHTML = "";
  for (const a of state.answers) {
    const li = document.createElement("li");
    const c = document.createElement("canvas");
    c.width = c.height = SNAP;
    c.setAttribute("aria-hidden", "true");
    a.thumb = c;
    const body = document.createElement("div");
    body.className = "answer-body";
    const p = document.createElement("p");
    p.textContent = a.text;
    const v = document.createElement("span");
    v.className = "verdict";
    v.textContent = verdict(a.d);
    body.append(p, v);
    li.append(c, body);
    list.append(li);
  }
  paintThumbs();
}

function paintThumbs() {
  for (const a of state.answers) {
    if (!a.thumb) continue;
    const img = new ImageData(new Uint8ClampedArray(a.picture.data), SNAP, SNAP);
    applyLut(img.data, a.lut, state.saturation);
    a.thumb.getContext("2d").putImageData(img, 0, 0);
  }
}

function writeReading() {
  const ds = state.answers.map((a) => a.d);
  const agreed = ds.filter((d) => d > AGREE).length;
  const disagreed = ds.filter((d) => d < -AGREE).length;
  const still = ds.length - agreed - disagreed;
  // How much yes and how much no, by strength, not just count.
  const yes = ds.reduce((s, d) => s + Math.max(0, d), 0);
  const no = ds.reduce((s, d) => s + Math.max(0, -d), 0);
  const parts = [];
  const counts = [`in on ${agreed}`, `out on ${disagreed}`];
  parts.push(`You leaned ${counts.join(", ")}${still ? ` and held still on ${still}` : ""}.`);
  const most = state.answers.reduce((a, b) => (b.d > a.d ? b : a));
  const least = state.answers.reduce((a, b) => (b.d < a.d ? b : a));
  if (most.d > AGREE) parts.push(`You leaned in hardest on “${most.text.replace(/\.$/, "")}.”`);
  if (least.d < -AGREE) parts.push(`You pulled back hardest from “${least.text.replace(/\.$/, "")}.”`);
  if (yes + no < 1.5) parts.push("You barely moved, so your filter stays close to how the camera sees you.");
  else if (yes > no * 1.5)
    parts.push("Your yeses outweigh your noes, so your filter is high contrast: the blacks are crushed and the whites run bright. You see things in black and white.");
  else if (no > yes * 1.5)
    parts.push("Your noes outweigh your yeses, so your filter runs toward the negative: the brightest parts of you turn dark first, like a print left in the light.");
  else
    parts.push("Your yeses and noes pull against each other, so your filter is both: hard shadows, and highlights that turn dark.");
  $("reading-text").textContent = parts.join(" ");
}

function updateViewButtons() {
  $("view-live").setAttribute("aria-selected", String(state.view === "live"));
  $("view-average").setAttribute("aria-selected", String(state.view === "average"));
}

function drawComposite() {
  const n = SNAP * SNAP;
  const img = smctx.createImageData(SNAP, SNAP);
  const { gray, color } = state.composite;
  const s = state.saturation;
  const hist = state.histogram;
  hist.fill(0);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const g = gray[i];
    img.data[p] = g + s * (color[i * 3] - g);
    img.data[p + 1] = g + s * (color[i * 3 + 1] - g);
    img.data[p + 2] = g + s * (color[i * 3 + 2] - g);
    img.data[p + 3] = 255;
    hist[Math.min(63, g >> 2)]++;
  }
  smctx.putImageData(img, 0, 0);
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(small, 0, 0, SIZE, SIZE);
}

// ---------- Drawing ----------

function drawStage(time) {
  drawSource(time);
  if (state.mode === "results" && state.view === "average") return drawComposite();
  const img = rctx.getImageData(0, 0, SIZE, SIZE);
  let lut;
  if (state.mode === "results") lut = state.avgLut;
  else if (state.mode === "intro") lut = lutFor(curveFor(0));
  else lut = lutFor(curveFor(state.lean));
  applyLut(img.data, lut, state.mode === "results" ? state.saturation : 0, state.histogram);
  sctx.putImageData(img, 0, 0);
}

let curveDpr = 0;
function drawCurve() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = curveCanvas.clientWidth || 300;
  if (curveDpr !== dpr || curveCanvas.width !== Math.round(cssW * dpr)) {
    curveDpr = dpr;
    curveCanvas.width = curveCanvas.height = Math.round(cssW * dpr);
  }
  const W = curveCanvas.width;
  const pad = 10 * dpr;
  const inner = W - pad * 2;
  const X = (x) => pad + x * inner;
  const Y = (y) => pad + (1 - y) * inner;
  cctx.clearRect(0, 0, W, W);
  cctx.fillStyle = "#0b0b0b";
  cctx.fillRect(pad, pad, inner, inner);

  // Histogram of the picture going in.
  const hist = state.histogram;
  let max = 1;
  for (let i = 2; i < hist.length - 2; i++) max = Math.max(max, hist[i]);
  cctx.beginPath();
  cctx.moveTo(X(0), Y(0));
  for (let i = 0; i < hist.length; i++) cctx.lineTo(X((i + 0.5) / hist.length), Y(Math.min(1, hist[i] / max) * 0.85));
  cctx.lineTo(X(1), Y(0));
  cctx.closePath();
  cctx.fillStyle = "rgb(255 255 255 / 12%)";
  cctx.fill();

  // Quarter grid, and both diagonals faintly, like the sketch: straight up is as-is, straight down is inverted.
  cctx.strokeStyle = "rgb(255 255 255 / 9%)";
  cctx.lineWidth = dpr;
  cctx.beginPath();
  for (const q of [0.25, 0.5, 0.75]) {
    cctx.moveTo(X(q), Y(0));
    cctx.lineTo(X(q), Y(1));
    cctx.moveTo(X(0), Y(q));
    cctx.lineTo(X(1), Y(q));
  }
  cctx.stroke();
  cctx.setLineDash([4 * dpr, 4 * dpr]);
  cctx.beginPath();
  cctx.moveTo(X(0), Y(0));
  cctx.lineTo(X(1), Y(1));
  cctx.moveTo(X(0), Y(1));
  cctx.lineTo(X(1), Y(0));
  cctx.stroke();
  cctx.setLineDash([]);
  cctx.strokeStyle = "rgb(255 255 255 / 35%)";
  cctx.strokeRect(pad, pad, inner, inner);

  const drawLut = (lut, style, width) => {
    cctx.strokeStyle = style;
    cctx.lineWidth = width * dpr;
    cctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = X(i / 255);
      const y = Y(lut[i] / 255);
      if (i === 0) cctx.moveTo(x, y);
      else cctx.lineTo(x, y);
    }
    cctx.stroke();
  };
  const dot = (x, y) => {
    cctx.fillStyle = "#fff";
    cctx.beginPath();
    cctx.arc(X(x), Y(y), 4.5 * dpr, 0, Math.PI * 2);
    cctx.fill();
    cctx.strokeStyle = "#0b0b0b";
    cctx.lineWidth = 1.5 * dpr;
    cctx.stroke();
  };

  if (state.mode === "results") {
    for (const a of state.answers) drawLut(a.lut, "rgb(255 255 255 / 18%)", 1);
    drawLut(state.avgLut, "#fff", 2.5);
    dot(0, state.avgLut[0] / 255);
    dot(1, state.avgLut[255] / 255);
    $("curve-label").textContent = "Your filter";
    $("black-point").textContent = `0 → ${state.avgLut[0]}`;
    $("white-point").textContent = `255 → ${state.avgLut[255]}`;
    return;
  }
  const c = curveFor(state.mode === "intro" ? 0 : state.lean);
  drawLut(lutFor(c), "#fff", 2.5);
  for (const [x, y] of c.marks) dot(x, y);
  const pct = Math.round(Math.abs(state.lean) * 100);
  $("curve-label").textContent =
    state.lean > AGREE ? `Leaning in · ${pct}%` : state.lean < -AGREE ? `Leaning out · ${pct}%` : "Neutral";
  // The black point is the first mark on the curve and the white point the last, as input → output.
  const level = (v) => Math.round(v * 255);
  const [b, w] = [c.marks[0], c.marks[c.marks.length - 1]];
  $("black-point").textContent = `${level(b[0])} → ${level(b[1])}`;
  $("white-point").textContent = `${level(w[0])} → ${level(w[1])}`;
}

function drawMeter(now) {
  $("meter-dot").style.top = `${50 - state.lean * 50}%`;
  let label;
  if (state.input === "keys") label = "↑ in · ↓ out";
  else if (!hand.state.ready) label = "No hand yet";
  else if (now - hand.state.lastSeen < LEAN.lostAfter) label = "Hand found";
  else label = "Show me your hand";
  $("hand-label").textContent = label;
}

// ---------- Loop ----------

let last = performance.now();
function frame(now) {
  // Capped so a hidden tab doesn't jump ahead; scripted runs (often headless, few frames) allow bigger steps.
  const dt = Math.min(params.has("answers") ? 0.5 : 0.1, (now - last) / 1000);
  last = now;
  updateLean(dt, now);
  if (state.mode === "calibrate") updateCalibration(dt, now);
  else if (state.mode === "countdown") updateCountdown(dt);
  else if (state.mode === "run") updateRun(dt);
  drawStage(now);
  drawCurve();
  drawMeter(now);
  // Headless browsers barely send animation frames, so scripted runs tick on a timer.
  if (params.has("answers")) setTimeout(() => frame(performance.now()), 33);
  else requestAnimationFrame(frame);
}

// ---------- Controls ----------

$("start-hand").addEventListener("click", () => begin("hand"));
$("start-keys").addEventListener("click", () => begin("keys"));
$("again").addEventListener("click", () => {
  if (state.input === "hand") startCalibration();
  else startCountdown();
});
$("view-live").addEventListener("click", () => {
  state.view = "live";
  updateViewButtons();
});
$("view-average").addEventListener("click", () => {
  state.view = "average";
  updateViewButtons();
});
$("saturation").addEventListener("input", (e) => {
  state.saturation = Number(e.target.value) / 100;
  $("sat-value").textContent = `${e.target.value}%`;
  paintThumbs();
});
$("save").addEventListener("click", () => {
  stage.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = state.view === "average" ? "black-point-averaged.png" : "black-point.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
});

function isTyping(e) {
  return e.metaKey || e.ctrlKey || e.altKey;
}
window.addEventListener("keydown", (e) => {
  if (isTyping(e)) return;
  if (e.key === "ArrowUp") state.keys.up = true;
  else if (e.key === "ArrowDown") state.keys.down = true;
  else return;
  if (state.mode === "run" || state.mode === "countdown") e.preventDefault();
});
window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowUp") state.keys.up = false;
  if (e.key === "ArrowDown") state.keys.down = false;
});
window.addEventListener("blur", () => {
  state.keys.up = state.keys.down = false;
});

if (params.has("debug")) window.blackPoint = { state, hand, curveFor, lutFor };

// For testing and demos: ?answers=0.8,-0.5,… plays those leans with the keys path, one per statement.
// ?view=average opens the results on the averaged picture, ?sat=40 sets the color.
const scripted = params.get("answers")?.split(",").map(Number);
if (scripted) {
  const keyStep = updateLean;
  updateLean = (dt, now) => {
    if (state.mode === "run" && state.t >= 0) state.target = scripted[state.index] ?? 0;
    keyStep(dt, now);
  };
  begin("keys");
  const done = setInterval(() => {
    if (state.mode !== "results") return;
    clearInterval(done);
    if (params.get("view") === "average") $("view-average").click();
    if (params.has("sat")) {
      $("saturation").value = params.get("sat");
      $("saturation").dispatchEvent(new Event("input"));
    }
  }, 100);
}

requestAnimationFrame(frame);
