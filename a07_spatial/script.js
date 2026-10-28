import * as THREE from "three";
import { buildWorld, buildFigure, growFigure, buildItem, heightAt, caveRoofAt, inCaveDoor, paintSky, setStyle, CAVE, SHAPE_NAMES, WORLD_HALF } from "./world.js";

const REPLICATE_PROXY_URL = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
const JUDGE_MODEL = "openai/gpt-4o-mini";
const START_AGE = 1;
const END_AGE = 90;
const GROWN_AT = 18;
// Childhood passes more slowly than adult life. At an aging rate of 1 a whole life takes about 7 minutes.
const yearsPerSecond = (age) => (age < GROWN_AT ? 0.12 : 0.25);
// Stages of growing up, by how grown you are (not how old). Babies crawl until they stand at 2 to 2.5.
const STAGES = [["baby", 0], ["toddler", 2.5], ["child", 5], ["teen", 12], ["adult", GROWN_AT]];
const BASE_SPEED = 7;
const GRAVITY = 22;
const REACH = 3;
// The model sometimes names shapes that don't exist; map the common ones onto the real primitives.
const SHAPE_ALIASES = { cube: "box", rectangle: "box", square: "box", book: "box", pyramid: "tetrahedron", disc: "cylinder", disk: "cylinder", coin: "cylinder", ball: "sphere", orb: "sphere", egg: "capsule", pill: "capsule", donut: "torus", crystal: "octahedron", gem: "octahedron", diamond: "octahedron", triangle: "tetrahedron" };

const canvas = document.querySelector("#scene");
const ageEl = document.querySelector("#age");
const stageEl = document.querySelector("#stage");
const clockEl = document.querySelector("#clock");
const statusEl = document.querySelector("#status");
const retryButton = document.querySelector("#retry");
const labelsEl = document.querySelector("#labels");
const card = document.querySelector("#card");
const cardName = document.querySelector("#card-name");
const cardNote = document.querySelector("#card-note");
const takeButton = document.querySelector("#take");
const feelingEl = document.querySelector("#feeling");
const jumpButton = document.querySelector("#jump");
const intro = document.querySelector("#intro");
const startButton = document.querySelector("#start");
const ending = document.querySelector("#ending");
const endingTitle = document.querySelector("#ending-title");
const endingSummary = document.querySelector("#ending-summary");
const endingCreed = document.querySelector("#ending-creed");
const endingChoices = document.querySelector("#ending-choices");
const againButton = document.querySelector("#again");
const styleButtons = document.querySelectorAll("[data-style]");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf7f7f7, 60, 330);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);

scene.add(new THREE.HemisphereLight(0xffffff, 0xeeeae6, 2.2));
const sunlight = new THREE.DirectionalLight(0xffffff, 1.1);
scene.add(sunlight);

const { sky, sun } = buildWorld(scene);
const rig = buildFigure();
const { figure, hips, torso, arms, legs } = rig;
scene.add(figure);

const player = { position: new THREE.Vector3(), heading: 0, vy: 0, grounded: true, stride: 0, inCave: false };
let tooBigShownAt = -Infinity;
const keys = new Set();
const walkDrag = { id: null, x: 0, y: 0, dx: 0, dy: 0 };
const lookDrag = { id: null, x: 0, y: 0 };
const look = { pitch: 0.32 }; // below 0 the camera tilts up toward the sky
let body = growFigure(rig, 0);
let crawl = 1;
let game = newGame();

function newGame() {
  return {
    phase: "intro",
    strength: 1,
    agingRate: 1,
    age: START_AGE,
    grown: START_AGE, // how grown up you are, in years; it follows your age unless you're stuck
    stuck: false,
    stage: "baby",
    seconds: 0,
    creed: null,
    rounds: [],
    offered: [],
    loading: false,
    request: 0,
    ending: null,
  };
}

function resetPlayer() {
  player.position.set(0, heightAt(0, 0), 0);
  player.heading = 0;
  player.vy = 0;
  player.grounded = true;
  player.inCave = false;
  camera.position.set(0, player.position.y + 5, 10);
}

// ---------- The judge ----------

async function requestRound() {
  const request = ++game.request;
  game.loading = true;
  retryButton.hidden = true;
  setStatus(game.rounds.length === 0 ? "Something is deciding what to offer you…" : "Something is deciding what comes next…");
  try {
    const round = await askJudge();
    if (request !== game.request || game.phase !== "playing") return;
    if (round.creed && !game.creed) game.creed = round.creed;
    spawnItems(round.items);
    setStatus("Walk up to something and take it.");
  } catch (error) {
    if (request !== game.request) return;
    setStatus(error.message);
    retryButton.hidden = false;
  } finally {
    if (request === game.request) game.loading = false;
  }
}

async function askJudge() {
  const roundNumber = game.rounds.length + 1;
  const history = game.rounds.map((round, i) =>
    `Round ${i + 1}: offered ${round.offered.map((item) => `"${item.name}"`).join(", ")}; they took "${round.taken.name}" (you judged it ${round.taken.verdict}).`,
  );
  const prompt = [
    "You are the hidden judge of a quiet 3D landscape: a hill, trees, a stream, mountains and a sun.",
    "A person walks through it and keeps being offered three things they could pick up. They take one; the others vanish.",
    "They start life as a one-year-old, crawling, and grow up as they age. You secretly decide whether each thing is good or bad for them.",
    "Good things help them grow up, make them lighter and faster, and slow their aging. Bad things leave them stuck at their stage of growing up, weigh them down and make them age faster. The person never sees your verdicts, only feels them.",
    game.creed
      ? `Your hidden value system, which every verdict must follow: "${game.creed}".`
      : "First invent a hidden value system you will judge by: one specific sentence, not plain mainstream morality (for example \"rewards anything that ties you to other people\" or \"punishes saving things for later\").",
    history.length ? `What has happened so far:\n${history.join("\n")}` : "This is the first round.",
    `This is round ${roundNumber}. Offer three new physical objects that could appear in this landscape, ordinary or strange. Be specific and inventive, and avoid the obvious picks (keys, seeds, letters, feathers, rocks) unless the story calls for them.`,
    "Let the objects respond to what they have taken before. Names must not reveal the verdict, and the three verdicts should not all be the same.",
    "Judge only by your value system, never by how heavy, light, bright or dark an object seems, so the person has to learn what you value.",
    roundNumber >= 3
      ? "One object may have the verdict \"end\", which ends their journey at once. Use it only sometimes, and make it look ordinary or tempting."
      : "Do not use the verdict \"end\" yet.",
    `For each object give: "name" (1 to 3 words, lowercase), "note" (one neutral sentence describing it, no hint of its value), "shape" (one of ${SHAPE_NAMES.join(", ")}), "verdict" ("good", "bad" or "end"), "weight" (1, 2 or 3, how strongly it matters), "reason" (one sentence explaining your verdict through your value system; it is only revealed at the end).`,
    game.creed
      ? "Respond with only JSON: {\"items\": [three objects]}."
      : "Respond with only JSON: {\"creed\": \"your value system\", \"items\": [three objects]}.",
  ].join("\n");

  const prediction = await runModel({ model: JUDGE_MODEL, input: { prompt, temperature: 0.9, max_tokens: 700 } });
  const text = Array.isArray(prediction.output) ? prediction.output.join("") : String(prediction.output ?? "");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The judge's answer couldn't be read.");
  const parsed = JSON.parse(match[0]);
  const items = (parsed.items ?? []).slice(0, 3).map((item) => ({
    name: String(item.name ?? "something").toLowerCase().slice(0, 40),
    note: String(item.note ?? ""),
    shape: toShape(item.shape),
    verdict: ["good", "bad", "end"].includes(item.verdict) && (item.verdict !== "end" || roundNumber >= 3) ? item.verdict : "bad",
    weight: Math.min(3, Math.max(1, Math.round(Number(item.weight) || 1))),
    reason: String(item.reason ?? ""),
  }));
  if (items.length < 2) throw new Error("The judge didn't offer anything.");
  return { creed: parsed.creed ? String(parsed.creed) : null, items };
}

function toShape(name) {
  const shape = String(name ?? "").toLowerCase().trim();
  return SHAPE_NAMES.includes(shape) ? shape : SHAPE_ALIASES[shape] ?? "sphere";
}

async function runModel(body) {
  const response = await fetch(REPLICATE_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const prediction = await response.json().catch(() => null);
  if (!response.ok || prediction?.status === "failed" || prediction?.error) {
    const detail = prediction?.detail ?? prediction?.error;
    throw new Error(typeof detail === "string" ? detail : `The model request failed (HTTP ${response.status}).`);
  }
  return prediction;
}

// ---------- Items ----------

// Three things in an arc ahead of you, at different distances, so how freely you move decides what you can reach.
function spawnItems(items) {
  // Off-center, so nothing hides straight behind your own figure.
  const angles = [-0.85, -0.28, 0.5];
  game.offered = items.map((data, i) => {
    const { item, object } = buildItem(data.shape, game.rounds.length * 3 + i);
    const angle = player.heading + angles[i] + (Math.random() - 0.5) * 0.2;
    const distance = 16 + Math.random() * 14;
    const x = clampToWorld(player.position.x - Math.sin(angle) * distance);
    const z = clampToWorld(player.position.z - Math.cos(angle) * distance);
    item.position.set(x, heightAt(x, z), z);
    item.scale.setScalar(0.01);
    scene.add(item);

    const label = document.createElement("div");
    label.className = "item-label";
    label.textContent = data.name;
    labelsEl.append(label);
    return { ...data, item, object, label, phase: Math.random() * Math.PI * 2 };
  });
}

function clearItems() {
  for (const offered of game.offered) {
    scene.remove(offered.item);
    offered.label.remove();
  }
  game.offered = [];
  card.hidden = true;
}

function nearestItem() {
  let best = null;
  let bestDistance = REACH;
  for (const offered of game.offered) {
    const distance = Math.hypot(offered.item.position.x - player.position.x, offered.item.position.z - player.position.z);
    if (distance < bestDistance) {
      best = offered;
      bestDistance = distance;
    }
  }
  return best;
}

function take(offered) {
  if (game.phase !== "playing" || !offered) return;
  game.rounds.push({
    offered: game.offered.map(({ name, verdict, reason }) => ({ name, verdict, reason })),
    taken: { name: offered.name, verdict: offered.verdict, weight: offered.weight, reason: offered.reason },
  });
  clearItems();

  if (offered.verdict === "end") {
    finish("end", offered.name);
    return;
  }
  const w = offered.weight;
  // Good choices make you lighter, slow your aging and keep you growing up, with a little head start.
  // Bad ones weigh you down, age you faster and leave you stuck at your stage until a good one frees you.
  if (offered.verdict === "good") {
    game.strength = Math.min(3.2, game.strength + 0.3 * w);
    game.agingRate = Math.max(0.3, game.agingRate - 0.2 * w);
    game.stuck = false;
    game.grown = Math.min(game.age, game.grown + 0.6 * w);
    showFeeling("lighter");
  } else {
    game.strength = Math.max(0.2, game.strength - 0.22 * w);
    game.agingRate = Math.min(5, game.agingRate + 0.5 * w);
    game.stuck = game.grown < GROWN_AT;
    showFeeling("heavier");
  }
  requestRound();
}

function showFeeling(word) {
  feelingEl.textContent = word;
  feelingEl.classList.remove("show");
  void feelingEl.offsetWidth;
  feelingEl.classList.add("show");
}

// ---------- Start and end ----------

function start() {
  clearItems();
  game = newGame();
  game.phase = "playing";
  resetPlayer();
  intro.hidden = true;
  ending.hidden = true;
  document.body.classList.remove("faded");
  requestRound();
}

function finish(reason, itemName) {
  if (game.phase !== "playing") return;
  game.phase = "ended";
  game.request++;
  clearItems();
  setStatus("");
  retryButton.hidden = true;
  document.body.classList.add("faded");

  const age = Math.floor(game.age);
  const grownUp = game.stage === "adult";
  endingTitle.textContent = reason === "end" ? `The ${itemName} ended it.` : grownUp ? "You grew old." : `You grew old, still a ${game.stage}.`;
  endingSummary.textContent = `You lived to ${age} in ${formatClock(game.seconds)} on the clock, after ${game.rounds.length} ${game.rounds.length === 1 ? "choice" : "choices"}${grownUp ? ", and grew up" : `, and never grew past a ${game.stage}`}.`;
  endingCreed.textContent = game.creed ? `“${game.creed}”` : "It never told you.";
  endingChoices.replaceChildren(...game.rounds.map((round) => {
    const li = document.createElement("li");
    const taken = document.createElement("p");
    taken.className = "choice-taken";
    const verdict = document.createElement("span");
    verdict.className = `verdict verdict-${round.taken.verdict}`;
    verdict.textContent = round.taken.verdict;
    taken.append(`You took the ${round.taken.name} `, verdict);
    const reason = document.createElement("p");
    reason.className = "choice-reason";
    reason.textContent = round.taken.reason;
    const others = document.createElement("p");
    others.className = "choice-others";
    const left = round.offered.filter((item) => item.name !== round.taken.name);
    others.textContent = `Left behind: ${left.map((item) => `${item.name} (${item.verdict})`).join(", ")}`;
    li.append(taken, reason, others);
    return li;
  }));
  setTimeout(() => { ending.hidden = false; }, 1200);
}

// ---------- Input ----------

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLButtonElement && (event.key === " " || event.key === "Enter")) return;
  keys.add(event.key.toLowerCase());
  if (event.key === " ") {
    event.preventDefault();
    jump();
  }
  if ((event.key === "e" || event.key === "Enter") && !card.hidden) take(nearestItem());
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

// Dragging looks around: sideways turns you, up and down tilts the camera, all the way up to the sky.
// On a touch screen the left half of the screen walks instead, like a joystick.
canvas.addEventListener("pointerdown", (event) => {
  const walking = event.pointerType !== "mouse" && event.clientX < window.innerWidth / 2;
  const drag = walking ? walkDrag : lookDrag;
  if (drag.id !== null) return;
  drag.id = event.pointerId;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (walking) walkDrag.dx = walkDrag.dy = 0;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId === walkDrag.id) {
    walkDrag.dx = Math.max(-1, Math.min(1, (event.clientX - walkDrag.x) / 80));
    walkDrag.dy = Math.max(-1, Math.min(1, (event.clientY - walkDrag.y) / 80));
  } else if (event.pointerId === lookDrag.id) {
    if (game.phase === "playing") player.heading -= (event.clientX - lookDrag.x) * 0.005;
    look.pitch = Math.max(-0.75, Math.min(1.2, look.pitch + (event.clientY - lookDrag.y) * 0.004));
    lookDrag.x = event.clientX;
    lookDrag.y = event.clientY;
  }
});
for (const type of ["pointerup", "pointercancel"]) {
  canvas.addEventListener(type, (event) => {
    if (event.pointerId === walkDrag.id) walkDrag.id = null;
    if (event.pointerId === lookDrag.id) lookDrag.id = null;
  });
}

jumpButton.addEventListener("click", jump);
takeButton.addEventListener("click", () => take(nearestItem()));
retryButton.addEventListener("click", requestRound);
startButton.addEventListener("click", start);
againButton.addEventListener("click", start);

// Ink, like the original drawing, or watercolor. The choice is remembered on this device.
function chooseStyle(name) {
  setStyle(name);
  document.body.dataset.style = name;
  for (const button of styleButtons) button.setAttribute("aria-pressed", String(button.dataset.style === name));
  try {
    localStorage.setItem("decisions-style", name);
  } catch {}
}

for (const button of styleButtons) button.addEventListener("click", () => chooseStyle(button.dataset.style));

function jump() {
  // Babies who still crawl can't jump.
  if (game.phase !== "playing" || !player.grounded || crawl > 0.5) return;
  player.vy = 6.5 * Math.pow(game.strength, 0.75) * (0.6 + 0.4 * body.growth);
  player.grounded = false;
}

// ---------- Loop ----------

const clock = new THREE.Clock();
const projected = new THREE.Vector3();

function update(dt) {
  const playing = game.phase === "playing";
  if (playing) {
    game.seconds += dt;
    const years = dt * yearsPerSecond(game.age) * game.agingRate;
    game.age += years;
    if (!game.stuck) game.grown = Math.min(game.age, game.grown + years);
    const stage = STAGES.findLast(([, from]) => game.grown >= from)[0];
    if (stage !== game.stage) {
      game.stage = stage;
      showFeeling(stage === "adult" ? "grown up" : `a ${stage}`);
    }
    if (game.age >= END_AGE) {
      game.age = END_AGE;
      finish("age");
    }
  }

  // Your body follows how grown you are: babies crawl, stand up around two, and keep growing until 18.
  body = growFigure(rig, Math.min(1, (game.grown - START_AGE) / (GROWN_AT - START_AGE)));
  crawl = Math.max(0, Math.min(1, (2.5 - game.grown) / 0.5));
  const height = body.height * (1 - 0.45 * crawl);

  let forward = 0;
  let turn = 0;
  if (playing) {
    if (keys.has("w") || keys.has("arrowup")) forward += 1;
    if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
    if (keys.has("a") || keys.has("arrowleft")) turn += 1;
    if (keys.has("d") || keys.has("arrowright")) turn -= 1;
    if (walkDrag.id !== null) {
      forward -= walkDrag.dy;
      turn -= walkDrag.dx;
    }
  }
  forward = Math.max(-1, Math.min(1, forward));
  turn = Math.max(-1, Math.min(1, turn));
  player.heading += turn * 2.2 * dt;

  // Good choices make you lighter and faster. Crawling is slow, and so is old age.
  const pace = (0.4 + 0.6 * Math.min(1, body.growth * 1.6)) * (1 - Math.max(0, game.age - 60) / 30 * 0.35);
  const step = forward * BASE_SPEED * game.strength * pace * dt;
  let nextX = clampToWorld(player.position.x - Math.sin(player.heading) * step);
  let nextZ = clampToWorld(player.position.z - Math.cos(player.heading) * step);

  // The cave: in through the doorway if you still fit, walls hold you inside, and outside you can climb its roof.
  const caveDistance = Math.hypot(nextX - CAVE.x, nextZ - CAVE.z);
  if (player.inCave) {
    if (caveDistance > CAVE.radius - 0.6 && !inCaveDoor(nextX, nextZ)) {
      nextX = player.position.x;
      nextZ = player.position.z;
    } else if (caveDistance > CAVE.radius) {
      player.inCave = false;
    }
  } else if (caveDistance < CAVE.radius && inCaveDoor(nextX, nextZ) && player.position.y < CAVE.floor + 1.5) {
    if (height < CAVE.doorHeight) {
      player.inCave = true;
    } else if (clock.elapsedTime - tooBigShownAt > 4) {
      tooBigShownAt = clock.elapsedTime;
      showFeeling("too big");
    }
  }

  const climb = Math.abs(step) > 0 ? (groundAt(nextX, nextZ) - groundAt(player.position.x, player.position.z)) / Math.abs(step) : 0;
  const slope = Math.max(0.15, 1 - Math.max(0, climb) * 1.6 / game.strength);
  player.position.x += (nextX - player.position.x) * slope;
  player.position.z += (nextZ - player.position.z) * slope;

  const ground = groundAt(player.position.x, player.position.z);
  player.vy -= GRAVITY * dt;
  player.position.y += player.vy * dt;
  if (player.position.y <= ground) {
    player.position.y = ground;
    player.vy = 0;
    player.grounded = true;
  }
  if (player.inCave) {
    const ceiling = caveRoofAt(player.position.x, player.position.z) - height;
    if (player.position.y > ceiling) {
      player.position.y = Math.max(ground, ceiling);
      player.vy = Math.min(player.vy, 0);
    }
  }

  // Walking: legs swing from the hip and bend at the knee on the back swing, arms swing opposite,
  // knees tuck in the air, and the back stoops in old age. Crawling: hands and knees, opposite limbs together.
  const moving = Math.abs(forward) > 0.05 && player.grounded;
  player.stride += moving ? dt * mix(7, 5, crawl) * Math.sign(forward) : 0;
  const amount = moving ? 1 : 0;
  // Lean the body forward until the hands reach the ground from the shoulders.
  const kneel = body.kneel;
  const lean = Math.acos(Math.max(0.05, Math.min(0.95, (body.arm + 0.06 - kneel) / body.shoulder)));
  const stoop = Math.max(0, (game.age - 55) / 35) * 0.45;
  legs.forEach((leg, i) => {
    const phase = Math.sin(player.stride + i * Math.PI);
    if (player.grounded) {
      leg.hip.rotation.x = mix(phase * 0.55, phase * 0.3, crawl) * amount;
      leg.knee.rotation.x = mix(-Math.max(0, -phase) * 0.9 * amount, -Math.PI / 2, crawl);
    } else {
      leg.hip.rotation.x = 0.6;
      leg.knee.rotation.x = -1;
    }
  });
  arms.forEach((arm, i) => {
    const phase = Math.sin(player.stride + i * Math.PI);
    arm.shoulder.rotation.x = mix(-phase * 0.5 * amount, lean + phase * 0.3 * amount, crawl);
    arm.shoulder.rotation.z = arm.side * 0.12 * (1 - crawl);
    arm.elbow.rotation.x = (0.25 + 0.2 * amount) * (1 - crawl);
  });
  torso.rotation.x = -mix(stoop, lean, crawl);
  hips.position.y = mix(body.hip + (moving ? Math.abs(Math.cos(player.stride)) * 0.05 : 0), kneel, crawl);
  figure.position.copy(player.position);
  figure.rotation.y = player.heading;

  // The camera follows from behind, like the sketch. Drag down to rise above, drag up to look at the sky.
  const back = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  const distance = player.inCave ? 2 + 1.6 * height : 1.6 + 2.4 * height;
  const rise = Math.max(0.06, look.pitch);
  const desired = player.position.clone().addScaledVector(back, distance * Math.cos(rise));
  desired.y += height * 0.8 + distance * Math.sin(rise);
  // Inside the cave the camera comes in close and stays under the roof.
  if (player.inCave) {
    for (let i = 0; i < 8 && Math.hypot(desired.x - CAVE.x, desired.z - CAVE.z) > CAVE.radius - 1.5; i++) desired.lerp(player.position, 0.25);
    desired.y = Math.min(desired.y, caveRoofAt(desired.x, desired.z) - 0.6);
  }
  desired.y = Math.max(desired.y, groundAt(desired.x, desired.z) + 0.4);
  camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
  const skyward = Math.tan(Math.max(0, -look.pitch) * 1.05) * distance;
  camera.lookAt(player.position.x, player.position.y + height * 0.75 + skyward, player.position.z);
  const lifeLived = (game.age - START_AGE) / (END_AGE - START_AGE);

  // The sun crosses the sky from right to left over a lifetime, not over the clock, and the sky warms toward dusk.
  const arc = Math.PI * (0.08 + lifeLived * 0.84);
  sun.position.set(
    player.position.x + Math.cos(arc) * 90,
    16 + Math.sin(arc) * 30,
    player.position.z - 150,
  );
  sun.lookAt(camera.position);
  sunlight.position.copy(sun.position);
  sunlight.target.position.copy(player.position);
  sky.position.copy(camera.position);
  scene.fog.color.copy(paintSky(sky, lifeLived));

  updateItems(dt);
  if (playing) {
    ageEl.textContent = Math.floor(game.age);
    stageEl.textContent = game.stuck ? `${game.stage}, stuck` : game.stage;
    clockEl.textContent = formatClock(game.seconds);
  }
}

function updateItems(dt) {
  const time = clock.elapsedTime;
  for (const offered of game.offered) {
    offered.item.scale.setScalar(Math.min(1, offered.item.scale.x + dt * 2));
    offered.object.position.y = 2 + Math.sin(time * 1.6 + offered.phase) * 0.18;
    offered.object.rotation.y += dt * 0.7;

    projected.copy(offered.item.position);
    projected.y += 3.4;
    projected.project(camera);
    const visible = projected.z < 1;
    offered.label.hidden = !visible;
    if (visible) {
      offered.label.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) * 50}vw, ${(1 - projected.y) * 50}vh)`;
    }
  }

  const near = game.phase === "playing" ? nearestItem() : null;
  card.hidden = !near;
  if (near && cardName.textContent !== near.name) {
    cardName.textContent = near.name;
    cardNote.textContent = near.note;
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// Where your feet rest: the cave floor when inside, otherwise the ground or the cave's roof, whichever is higher.
function groundAt(x, z) {
  return player.inCave ? CAVE.floor : Math.max(heightAt(x, z), caveRoofAt(x, z));
}

function setStatus(text) {
  statusEl.textContent = text;
}

function formatClock(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function clampToWorld(value) {
  return Math.max(-WORLD_HALF, Math.min(WORLD_HALF, value));
}

// ?style=watercolor or ?style=ink in the link wins over what this device remembers.
let savedStyle = new URLSearchParams(location.search).get("style");
try {
  savedStyle ??= localStorage.getItem("decisions-style");
} catch {}
chooseStyle(savedStyle === "watercolor" ? "watercolor" : "ink");

window.addEventListener("resize", resize);
resize();
resetPlayer();
loop();
