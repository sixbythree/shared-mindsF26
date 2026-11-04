// Plants for Human Nature: species, how each one grows, and how to draw it.
// A plant needs sun to grow and water to stay alive. Crops flower, then fruit.
// Weeds grow on water alone and drink from their neighbours.

export const SPECIES = {
  tomato: {
    name: "Tomato", latin: "Solanum lycopersicum", kind: "crop", habit: "upright",
    height: 0.95, rate: 1 / 70, leaves: 7, leaf: "round", leafColor: "#4f8a3c",
    flower: "#f2cf3f", fruit: { ripe: "#e2432f", unripe: "#9cc25a", shape: "round", size: 0.085, count: 5 },
    about: "A vine from the Andes. It needs long days of sun and steady water, and its small yellow flowers become red fruit.",
  },
  pepper: {
    name: "Pepper", latin: "Capsicum annuum", kind: "crop", habit: "upright",
    height: 0.7, rate: 1 / 75, leaves: 6, leaf: "long", leafColor: "#3f7d3a",
    flower: "#f4f1e6", fruit: { ripe: "#d8361f", unripe: "#4c8f2f", shape: "long", size: 0.13, count: 3 },
    about: "Peppers start green and turn red as they ripen. They like heat and sun more than almost anything in the field.",
  },
  eggplant: {
    name: "Eggplant", latin: "Solanum melongena", kind: "crop", habit: "upright",
    height: 0.8, rate: 1 / 80, leaves: 6, leaf: "round", leafColor: "#57804a",
    flower: "#b58ad6", fruit: { ripe: "#4b2459", unripe: "#9b7bb0", shape: "oval", size: 0.15, count: 2 },
    about: "A cousin of the tomato with purple flowers. Each flower can become one heavy, glossy fruit.",
  },
  blueberry: {
    name: "Blueberry", latin: "Vaccinium corymbosum", kind: "crop", habit: "bush",
    height: 0.6, rate: 1 / 85, leaves: 10, leaf: "small", leafColor: "#3d6e4a",
    flower: "#f6eef0", fruit: { ripe: "#3c4f9a", unripe: "#b7c8a2", shape: "berry", size: 0.045, count: 12 },
    about: "A shrub with bell-shaped white flowers. Its berries come in clusters and turn from pale green to deep blue.",
  },
  strawberry: {
    name: "Strawberry", latin: "Fragaria × ananassa", kind: "crop", habit: "rosette",
    height: 0.35, rate: 1 / 55, leaves: 6, leaf: "toothed", leafColor: "#3f8a44",
    flower: "#ffffff", fruit: { ripe: "#e0303c", unripe: "#e8efc0", shape: "heart", size: 0.09, count: 3 },
    about: "A low plant that spreads along the ground. Its white flowers sit close to the soil and the fruit hangs down beside them.",
  },
  sunflower: {
    name: "Sunflower", latin: "Helianthus annuus", kind: "crop", habit: "flowerhead",
    height: 1.25, rate: 1 / 70, leaves: 6, leaf: "heart", leafColor: "#4b8a2f",
    flower: "#f5b81c", fruit: { ripe: "#4a2f1a", unripe: "#7a6a2a", shape: "head", size: 0.2, count: 1 },
    about: "Young sunflowers turn to follow the sun. When the head is full of seeds it gets heavy and bows.",
  },
  pumpkin: {
    name: "Pumpkin", latin: "Cucurbita pepo", kind: "crop", habit: "vine",
    height: 0.4, rate: 1 / 90, leaves: 5, leaf: "lobed", leafColor: "#4d8738",
    flower: "#f6a623", fruit: { ripe: "#e9781f", unripe: "#7ea64a", shape: "pumpkin", size: 0.24, count: 1 },
    about: "A vine that runs along the ground with wide leaves. It drinks a lot of water to grow one big fruit.",
  },
  dandelion: {
    name: "Dandelion", latin: "Taraxacum officinale", kind: "weed", habit: "rosette",
    height: 0.32, rate: 1 / 30, leaves: 7, leaf: "toothed", leafColor: "#5d8f35",
    flower: "#f7d21a", fruit: { ripe: "#f4f1e8", unripe: "#f7d21a", shape: "puff", size: 0.14, count: 1 },
    about: "A weed. Its yellow flower turns into a white puff of seeds that blow across the field. Cut it down before it spreads.",
  },
  thistle: {
    name: "Thistle", latin: "Cirsium arvense", kind: "weed", habit: "upright",
    height: 0.85, rate: 1 / 35, leaves: 6, leaf: "spiky", leafColor: "#6b8a5c",
    flower: "#a34fb0", fruit: { ripe: "#a34fb0", unripe: "#a34fb0", shape: "none", size: 0, count: 0 },
    about: "A spiny weed with purple flowers. Its roots run sideways under the soil and take water from everything nearby.",
  },
  crabgrass: {
    name: "Crabgrass", latin: "Digitaria sanguinalis", kind: "weed", habit: "grass",
    height: 0.45, rate: 1 / 25, leaves: 9, leaf: "blade", leafColor: "#7aa53e",
    flower: "#8b6d3d", fruit: { ripe: "#8b6d3d", unripe: "#8b6d3d", shape: "none", size: 0, count: 0 },
    about: "A weed that grows fast in wet ground and crowds out the plants around it.",
  },
  bindweed: {
    name: "Bindweed", latin: "Convolvulus arvensis", kind: "weed", habit: "upright",
    height: 0.6, rate: 1 / 32, leaves: 8, leaf: "arrow", leafColor: "#4f7f3c",
    flower: "#fbf4f4", fruit: { ripe: "#fbf4f4", unripe: "#fbf4f4", shape: "none", size: 0, count: 0 },
    about: "A twining weed with pretty white flowers. It wraps around other plants and drinks their water.",
  },
};

export const CROPS = Object.keys(SPECIES).filter((k) => SPECIES[k].kind === "crop");
export const WEEDS = Object.keys(SPECIES).filter((k) => SPECIES[k].kind === "weed");

// Numbers that set the pace of the field.
export const RULES = {
  dryRate: 0.011,        // water lost per second (about 90 seconds from full to dry)
  sunDryRate: 0.008,     // extra water lost per second in full sun
  rainRate: 0.22,        // water gained per second in full rain
  wiltAfter: 0.12,       // below this much water a plant is thirsty and stops growing
  dieSeconds: 40,        // seconds with no water before a plant dies
  ripenRate: 1 / 25,     // fruit ripening per second of full sun once grown
  barrenBase: 0.12,      // chance a crop grows up without fruit
  barrenPerDrySecond: 1 / 90, // extra chance for each second it spent thirsty while growing
  weedThirst: 0.006,     // water a grown weed takes per second from each nearby plant
};

let nextId = 1;

export function createPlant(species, x, z, growth = 0, extra = {}) {
  return {
    id: nextId++,
    species,
    x,
    z,
    growth,
    water: 0.6,
    fruit: 0,
    barren: false,
    dryTime: 0,
    thirstTime: 0,
    dead: false,
    lean: 0,
    seed: Math.random() * 1000,
    flip: Math.random() < 0.5 ? -1 : 1,
    spreadTimer: 20 + Math.random() * 15,
    announced: false,
    ...extra,
  };
}

export function syncNextId(plants) {
  for (const p of plants) nextId = Math.max(nextId, p.id + 1);
}

export function isBad(p) {
  return SPECIES[p.species].kind === "weed" || p.barren || p.dead || p.spent;
}

export function isRipe(p) {
  return SPECIES[p.species].kind === "crop" && !p.barren && !p.spent && !p.dead && p.growth >= 1 && p.fruit >= 1;
}

// A plant can be picked this many times; after that it's spent and should be cut down.
export const MAX_HARVESTS = 3;
export const SEEDS_PER_HARVEST = 2;

// Pick a ripe plant: all its fruit, plus a couple of its seeds. The fruit grows back.
export function harvest(p) {
  if (!isRipe(p)) return null;
  const count = SPECIES[p.species].fruit.count;
  p.fruit = 0;
  p.announced = false;
  p.harvests = (p.harvests || 0) + 1;
  if (p.harvests >= MAX_HARVESTS) p.spent = true;
  return { count, seeds: SEEDS_PER_HARVEST, spent: !!p.spent };
}

// One step of the simulation for one plant. Returns an event name or null.
export function stepPlant(p, dt, env) {
  const sp = SPECIES[p.species];
  if (p.cut) return null;

  const dryMul = env.dryMul ?? 1;
  const growMul = env.growMul ?? 1;
  p.water -= dt * (RULES.dryRate + RULES.sunDryRate * env.sun) * dryMul;
  p.water += dt * RULES.rainRate * env.rain;
  p.water = Math.min(1, Math.max(0, p.water));

  // Plants lean toward the screen (toward you) when the sun is out, and rest otherwise.
  const leanTarget = p.dead ? 0 : env.sun * (p.water > RULES.wiltAfter ? 1 : 0.35);
  p.lean += (leanTarget - p.lean) * Math.min(1, dt * 1.6);

  if (p.dead) return null;

  if (p.water <= 0) {
    p.dryTime += dt;
    if (p.dryTime > RULES.dieSeconds) {
      p.dead = true;
      return "died";
    }
  } else {
    p.dryTime = Math.max(0, p.dryTime - dt * 2);
  }

  const thirsty = p.water < RULES.wiltAfter;
  if (thirsty && p.growth < 1) p.thirstTime += dt;

  if (sp.kind === "weed") {
    // Weeds don't wait for the sun.
    if (!thirsty && p.growth < 1) p.growth = Math.min(1, p.growth + dt * sp.rate * (0.5 + 0.5 * env.sun) * growMul);
    return null;
  }

  if (p.growth < 1) {
    if (!thirsty && env.sun > 0.05) {
      const wet = Math.min(1, p.water / 0.45);
      p.growth = Math.min(1, p.growth + dt * sp.rate * env.sun * (0.35 + 0.65 * wet) * growMul);
      if (p.growth >= 1) {
        const chance = RULES.barrenBase + Math.min(0.45, p.thirstTime * RULES.barrenPerDrySecond);
        p.barren = Math.random() < chance;
        return p.barren ? "barren" : "grown";
      }
    }
    return null;
  }

  if (!p.barren && !p.spent && p.fruit < 1 && !thirsty && env.sun > 0.05) {
    p.fruit = Math.min(1, p.fruit + dt * RULES.ripenRate * env.sun * growMul);
    if (p.fruit >= 1 && !p.announced) {
      p.announced = true;
      return "ripe";
    }
  }
  return null;
}

export function describe(p) {
  const sp = SPECIES[p.species];
  const pct = Math.round(p.growth * 100);
  let status;
  if (p.dead) status = "It dried out and died. Cut it down to make room.";
  else if (sp.kind === "weed") status = p.growth < 1 ? `A weed, ${pct}% grown. It drinks the water around it. Cut it down.` : "A grown weed, spreading. Cut it down.";
  else if (p.growth < 0.08) status = "A seed, just planted.";
  else if (p.growth < 1) status = `Growing, ${pct}%.`;
  else if (p.barren) status = "Fully grown, but it never fruited. Cut it down.";
  else if (p.spent) status = `It has given all its fruit (${MAX_HARVESTS} harvests). Cut it down to make room.`;
  else if (p.fruit < 1) status = `${p.harvests ? `Picked ${p.harvests} of ${MAX_HARVESTS} times. Fruit growing back` : "Fully grown. Fruit ripening"}, ${Math.round(p.fruit * 100)}%.`;
  else status = "Bearing fruit. Pinch it to pick.";
  let water;
  if (p.dead) water = "";
  else if (p.water <= 0) water = "Bone dry.";
  else if (p.water < RULES.wiltAfter) water = "Thirsty.";
  else if (p.water < 0.4) water = "A little dry.";
  else water = "Well watered.";
  return { name: sp.name, latin: sp.latin, about: sp.about, status, water, bad: isBad(p), kind: sp.kind };
}

// ---------- drawing ----------

const rgbCache = new Map();
function rgb(hex) {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}
export function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  t = Math.max(0, Math.min(1, t)) || 0;
  const n = (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t);
  return `#${n.toString(16).padStart(6, "0")}`;
}

export function rgba(hex, a) {
  const c = rgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

const STRAW = "#b9a058";
const DEAD = "#8a6a43";
const INK = "#26301f";

function quad(p0, c, p1, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}
function quadAngle(p0, c, p1, t) {
  const dx = 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x);
  const dy = 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y);
  return Math.atan2(dy, dx);
}

function leafPath(ctx, style, len, w) {
  ctx.beginPath();
  switch (style) {
    case "long":
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.45, -w * 0.9, len, 0);
      ctx.quadraticCurveTo(len * 0.45, w * 0.9, 0, 0);
      break;
    case "small":
      ctx.ellipse(len * 0.5, 0, len * 0.5, w * 0.8, 0, 0, Math.PI * 2);
      break;
    case "blade":
      ctx.moveTo(0, -w * 0.25);
      ctx.quadraticCurveTo(len * 0.6, -w * 0.4, len, 0);
      ctx.quadraticCurveTo(len * 0.6, w * 0.15, 0, w * 0.25);
      break;
    case "spiky": {
      ctx.moveTo(0, 0);
      const n = 5;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const ww = w * Math.sin(Math.PI * t) * 1.2;
        ctx.lineTo(len * (t - 0.5 / n), -ww);
        ctx.lineTo(len * t, -ww * 0.35);
      }
      for (let i = n; i >= 1; i--) {
        const t = i / n;
        const ww = w * Math.sin(Math.PI * t) * 1.2;
        ctx.lineTo(len * (t - 0.5 / n), ww);
        ctx.lineTo(len * (t - 1 / n), ww * 0.35);
      }
      ctx.closePath();
      break;
    }
    case "toothed": {
      ctx.moveTo(0, 0);
      const n = 4;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const ww = w * Math.sin(Math.PI * Math.min(0.95, t)) * 1.1;
        ctx.quadraticCurveTo(len * (t - 0.6 / n), -ww * 1.15, len * t, -ww * 0.6);
      }
      ctx.lineTo(len, 0);
      for (let i = n; i >= 1; i--) {
        const t = i / n;
        const ww = w * Math.sin(Math.PI * Math.min(0.95, t)) * 1.1;
        ctx.quadraticCurveTo(len * (t - 0.4 / n), ww * 1.15, len * (t - 1 / n), ww * 0.6);
      }
      ctx.closePath();
      break;
    }
    case "heart":
    case "arrow":
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(len * 0.05, -w * 1.5, len * 0.75, -w * 0.9, len, 0);
      ctx.bezierCurveTo(len * 0.75, w * 0.9, len * 0.05, w * 1.5, 0, 0);
      break;
    case "lobed":
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(len * 0.1, -w * 1.6, len * 0.7, -w * 1.7, len * 0.75, -w * 0.5);
      ctx.bezierCurveTo(len * 1.05, -w * 0.6, len * 1.05, w * 0.6, len * 0.75, w * 0.5);
      ctx.bezierCurveTo(len * 0.7, w * 1.7, len * 0.1, w * 1.6, 0, 0);
      break;
    default: // round
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(len * 0.15, -w * 1.25, len * 0.8, -w * 1.1, len, 0);
      ctx.bezierCurveTo(len * 0.8, w * 1.1, len * 0.15, w * 1.25, 0, 0);
  }
}

function drawLeaf(ctx, x, y, angle, len, w, style, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  leafPath(ctx, style, len, w);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
  if (style !== "small" && style !== "blade") {
    ctx.beginPath();
    ctx.moveTo(len * 0.08, 0);
    ctx.lineTo(len * 0.85, 0);
    ctx.globalAlpha *= 0.45;
    ctx.stroke();
  }
  ctx.restore();
}

function drawFlower(ctx, x, y, r, color, open = 1) {
  const petals = 5;
  ctx.fillStyle = color;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.55 * open, y + Math.sin(a) * r * 0.55 * open, r * 0.5, r * 0.32, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = "#e8b923";
  ctx.fill();
}

function drawFruit(ctx, x, y, r, shape, color, ripe) {
  ctx.fillStyle = color;
  ctx.beginPath();
  switch (shape) {
    case "long":
      ctx.ellipse(x, y + r * 0.6, r * 0.32, r * 0.75, 0.15, 0, Math.PI * 2);
      break;
    case "oval":
      ctx.ellipse(x, y + r * 0.55, r * 0.42, r * 0.7, -0.1, 0, Math.PI * 2);
      break;
    case "heart":
      ctx.moveTo(x, y + r);
      ctx.bezierCurveTo(x - r * 0.9, y + r * 0.2, x - r * 0.55, y - r * 0.55, x, y - r * 0.3);
      ctx.bezierCurveTo(x + r * 0.55, y - r * 0.55, x + r * 0.9, y + r * 0.2, x, y + r);
      break;
    case "pumpkin":
      ctx.ellipse(x - r * 0.38, y, r * 0.5, r * 0.62, 0, 0, Math.PI * 2);
      ctx.moveTo(x + r * 0.88, y);
      ctx.ellipse(x + r * 0.38, y, r * 0.5, r * 0.62, 0, 0, Math.PI * 2);
      ctx.moveTo(x + r * 0.5, y);
      ctx.ellipse(x, y, r * 0.5, r * 0.66, 0, 0, Math.PI * 2);
      break;
    default:
      ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  if (ripe > 0.5 && shape !== "pumpkin") {
    ctx.beginPath();
    ctx.arc(x - r * 0.16, y - r * 0.12 + (shape === "long" || shape === "oval" ? r * 0.4 : 0), r * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();
  }
  if (shape === "heart") {
    ctx.fillStyle = "#f6e27a";
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(x - r * 0.35 + (i % 3) * r * 0.3, y + r * 0.05 + Math.floor(i / 3) * r * 0.3, r * 0.06, r * 0.08);
    }
  }
}

// Draw one plant with its base at (bx, by). unit is the plant height at full growth, in pixels.
export function drawPlant(ctx, plant, bx, by, unit, env) {
  // A spent plant looks like one that never fruited.
  const p = plant.spent ? { ...plant, barren: true } : plant;
  const sp = SPECIES[p.species];
  const g = p.growth;
  const dry = p.dead ? 1 : Math.max(0, Math.min(1, 1 - p.water / 0.3));
  const leafColor = p.dead ? DEAD : mix(p.barren ? mix(sp.leafColor, STRAW, 0.35) : sp.leafColor, STRAW, dry * 0.85);
  const lw = Math.max(0.6, unit * 0.012);

  ctx.save();
  ctx.translate(bx, by);
  if (p.cut) {
    const k = Math.min(1, p.cut.t / 0.9);
    ctx.rotate(p.cut.dir * k * k * 1.45);
    ctx.globalAlpha = 1 - Math.max(0, (p.cut.t - 0.7) / 0.6);
  }
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;

  // A lean toward the screen: the plant opens up and grows a little toward you.
  const lean = p.lean;
  const sway = Math.sin(env.time * 1.3 + p.seed) * (0.04 + env.wind * 0.08) * (1 - lean * 0.6);
  const s = 1 + lean * 0.14;
  ctx.scale(s, s);

  // Seed or freshly planted.
  if (g < 0.06) {
    ctx.fillStyle = "#6b4a2e";
    ctx.beginPath();
    ctx.ellipse(0, 0, unit * 0.06, unit * 0.022, 0, Math.PI, 0);
    ctx.fill();
    if (g > 0.025) {
      const h = unit * 0.05 * (g / 0.06);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -h);
      ctx.stroke();
      drawLeaf(ctx, 0, -h, -Math.PI / 2 - 0.9, unit * 0.04, unit * 0.018, "round", leafColor);
      drawLeaf(ctx, 0, -h, -Math.PI / 2 + 0.9, unit * 0.04, unit * 0.018, "round", leafColor);
    }
    ctx.restore();
    return;
  }

  const grow = Math.pow(Math.min(1, g), 0.75);
  const flowerUp = g > 0.7 && !p.dead;
  const fruitT = p.fruit;
  const droopDir = p.flip;

  if (sp.habit === "grass") {
    const n = Math.round(3 + sp.leaves * grow);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 1.6 + sway + dry * droopDir * 0.5;
      drawLeaf(ctx, (i - n / 2) * unit * 0.012, 0, a, unit * sp.height * grow * (0.6 + 0.4 * Math.sin(i * 2.1 + p.seed) ** 2), unit * 0.03, "blade", leafColor);
    }
    if (g > 0.8) {
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.3 + sway;
        const len = unit * sp.height * 1.05;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.strokeStyle = sp.flower;
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  if (sp.habit === "rosette" || sp.habit === "vine") {
    const n = Math.round(2 + sp.leaves * grow);
    const vine = sp.habit === "vine";
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const spread = vine ? 0.25 + 0.9 * (i / n) : 0.35 + 0.5 * (i / n);
      const a = -Math.PI / 2 + side * spread * (1 + dry * 0.6) - lean * side * 0.15 + sway;
      const len = unit * (vine ? 0.2 : 0.17) * grow * (1.2 - 0.3 * (i / n));
      const ox = vine ? side * unit * 0.12 * grow * (i / n) * 2 : 0;
      drawLeaf(ctx, ox, 0, a, len, len * 0.42, sp.leaf, leafColor);
    }
    // Flower stalks.
    if (flowerUp) {
      const stalks = sp.fruit.count;
      for (let i = 0; i < stalks; i++) {
        const side = (i - (stalks - 1) / 2) * 0.9 + sway;
        const tip = { x: Math.sin(side) * unit * sp.height * 0.8, y: -unit * sp.height * (vine ? 0.4 : 0.85) * (0.85 + 0.15 * i) };
        if (sp.kind === "crop" && fruitT > 0.05 && !p.barren && !vine) tip.y *= 0.55; // fruit hangs down
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(tip.x * 0.3, tip.y * 0.6, tip.x, tip.y);
        ctx.strokeStyle = mix("#5d7d3c", STRAW, dry);
        ctx.stroke();
        ctx.strokeStyle = INK;
        drawBloomOrFruit(ctx, p, sp, tip.x, tip.y, unit, fruitT, i, vine);
      }
    }
    ctx.restore();
    return;
  }

  // Upright, bush and flowerhead: a curved stem with leaves along it.
  const h = unit * sp.height * grow;
  const p0 = { x: 0, y: 0 };
  const headHeavy = sp.habit === "flowerhead" ? Math.max(0, fruitT - 0.4) : 0;
  const tipX = (sway * 1.4 + dry * droopDir * 0.4 + headHeavy * droopDir * 0.25) * h;
  const tipY = -h * (1 - dry * 0.3 - headHeavy * 0.12);
  const p1 = { x: tipX, y: tipY };
  const c = { x: tipX * 0.2, y: tipY * 0.55 };

  const stems = sp.habit === "bush" ? 3 : 1;
  for (let k = 0; k < stems; k++) {
    const spread = stems === 1 ? 0 : (k - 1) * 0.35;
    const q1 = { x: p1.x + spread * h, y: p1.y * (k === 1 ? 1 : 0.82) };
    const qc = { x: c.x + spread * h * 0.3, y: c.y };
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(qc.x, qc.y, q1.x, q1.y);
    ctx.strokeStyle = mix(p.dead ? DEAD : "#4e6e33", STRAW, dry);
    ctx.lineWidth = lw * (sp.habit === "flowerhead" ? 2.6 : 1.6) * (0.6 + 0.4 * grow);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;

    const n = Math.max(2, Math.round(sp.leaves * grow / stems + 1));
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const t = 0.15 + 0.8 * (i / n);
      const pt = quad(p0, qc, q1, t);
      const ang = quadAngle(p0, qc, q1, t);
      const side = (i + k) % 2 ? 1 : -1;
      // Leaves lift and open toward you in the sun, and hang when dry.
      const lift = 1.05 - lean * 0.35 + dry * 0.7;
      const a = ang + side * lift;
      const len = unit * (sp.leaf === "small" ? 0.08 : 0.17) * (0.55 + 0.45 * grow) * (1.1 - 0.4 * t) * (1 + lean * 0.12);
      drawLeaf(ctx, pt.x, pt.y, a, len, len * (sp.leaf === "long" || sp.leaf === "spiky" ? 0.28 : 0.42), sp.leaf, leafColor);
      nodes.push({ ...pt, side });
    }

    if (sp.habit === "flowerhead") {
      if (flowerUp) drawSunflower(ctx, q1.x, q1.y, unit, sp, fruitT, p, lean);
      continue;
    }
    if (flowerUp) {
      const count = Math.ceil(sp.fruit.count / stems) || 2;
      for (let i = 0; i < count; i++) {
        const node = nodes[nodes.length - 1 - (i % nodes.length)];
        const fx = node.x + node.side * unit * 0.05 * (1 + (i % 3) * 0.4);
        const fy = node.y + unit * 0.02 * (i % 2);
        drawBloomOrFruit(ctx, p, sp, fx, fy, unit, fruitT, i + k * 7, false);
      }
      if (sp.fruit.count === 0) drawBloomOrFruit(ctx, p, sp, q1.x, q1.y, unit, fruitT, 99, false);
    }
  }
  ctx.restore();
}

function drawBloomOrFruit(ctx, p, sp, x, y, unit, fruitT, i, onGround) {
  if (p.dead) {
    ctx.beginPath();
    ctx.arc(x, y, unit * 0.012, 0, Math.PI * 2);
    ctx.fillStyle = DEAD;
    ctx.fill();
    return;
  }
  const bloomR = unit * (sp.kind === "weed" ? 0.05 : 0.035);
  if (sp.kind === "weed") {
    if (p.species === "dandelion") {
      if (p.growth >= 1) {
        // A white puff of seeds.
        ctx.save();
        ctx.strokeStyle = "rgba(90,90,80,0.5)";
        for (let a = 0; a < 14; a++) {
          const ang = (a / 14) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(ang) * unit * 0.06, y + Math.sin(ang) * unit * 0.06);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, unit * 0.065, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,250,0.75)";
        ctx.fill();
        ctx.restore();
        return;
      }
      drawFlower(ctx, x, y, bloomR, sp.flower);
      return;
    }
    if (p.species === "thistle") {
      ctx.beginPath();
      ctx.ellipse(x, y + bloomR * 0.5, bloomR * 0.5, bloomR * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#7c9a62";
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.strokeStyle = sp.flower;
      ctx.lineWidth *= 1.6;
      for (let a = -3; a <= 3; a++) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + a * bloomR * 0.22, y - bloomR * 0.9);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    drawFlower(ctx, x, y, bloomR * 0.9, sp.flower);
    return;
  }
  if (p.barren) {
    // Flowers that dropped without setting fruit.
    ctx.beginPath();
    ctx.arc(x, y, unit * 0.012, 0, Math.PI * 2);
    ctx.fillStyle = "#a08a52";
    ctx.fill();
    return;
  }
  if (p.growth < 1 || fruitT < 0.04) {
    drawFlower(ctx, x, y, bloomR, sp.flower, Math.min(1, (p.growth - 0.7) / 0.2));
    return;
  }
  const r = unit * sp.fruit.size * (0.35 + 0.65 * fruitT) * (0.85 + 0.15 * Math.sin(i * 1.7));
  const color = mix(sp.fruit.unripe, sp.fruit.ripe, fruitT);
  if (sp.fruit.shape === "berry") {
    for (let b = 0; b < 3; b++) drawFruit(ctx, x + (b - 1) * r * 0.8, y + (b % 2) * r * 0.6, r, "round", color, fruitT);
    return;
  }
  if (onGround) {
    drawFruit(ctx, x, -r * 0.45, r, sp.fruit.shape, color, fruitT);
    return;
  }
  drawFruit(ctx, x, y, r, sp.fruit.shape, color, fruitT);
}

function drawSunflower(ctx, x, y, unit, sp, fruitT, p, lean) {
  const r = unit * 0.1 * (0.6 + 0.4 * Math.min(1, (p.growth - 0.7) / 0.3)) * (1 + lean * 0.2);
  if (p.dead) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = DEAD;
    ctx.fill();
    ctx.stroke();
    return;
  }
  const petals = 16;
  ctx.fillStyle = p.barren ? "#c9a44a" : sp.flower;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, r * 0.42, r * 0.15, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = p.barren ? "#8d7a4a" : mix("#8a6a2a", sp.fruit.ripe, fruitT);
  ctx.fill();
  ctx.stroke();
  if (fruitT > 0.2 && !p.barren) {
    ctx.fillStyle = "rgba(240,220,170,0.6)";
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4;
      const d = Math.sqrt(i / 18) * r * 0.52;
      ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.05, r * 0.05);
    }
  }
}
