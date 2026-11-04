// The view behind each farm: sky colors, the far landscape, and the ground and grass colors.
// Each drawBack runs after the sky and clouds and before the field, and moves a little as you
// drag the view (parallax), so the far things feel far.

import { mix, rgba } from "./plants.js";

const wave = (x, a, b, c) => Math.sin(x * a + c) * 0.6 + Math.sin(x * b) * 0.25;

function ridge(ctx, W, hy, H, shift, height, a, b, phase, color, step = 10) {
  ctx.beginPath();
  ctx.moveTo(0, hy + 2);
  for (let x = 0; x <= W + step; x += step) {
    const wx = x / W + shift;
    ctx.lineTo(x, hy - H * height * (1 + wave(wx, a, b, phase)));
  }
  ctx.lineTo(W, hy + 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function meadow(ctx, { W, H, hy, camX, rain }) {
  ridge(ctx, W, hy, H, camX * 0.2, 0.035, 5, 13, 0, mix("#a7b8a2", "#6f7d72", rain * 0.5));
  ridge(ctx, W, hy, H, camX * 0.44, 0.05, 8, 13, 1, mix("#8aa37a", "#6f7d72", rain * 0.5));
}

function seaside(ctx, { W, H, hy, camX, rain, time, sun }) {
  // The sea, all the way to the horizon line.
  const seaTop = hy - H * 0.07;
  const g = ctx.createLinearGradient(0, seaTop, 0, hy);
  g.addColorStop(0, mix(mix("#7fa9c4", "#4f97c9", sun), "#6e7f8a", rain * 0.6));
  g.addColorStop(1, mix(mix("#5d8fae", "#2f7fb8", sun), "#566873", rain * 0.6));
  ctx.fillStyle = g;
  ctx.fillRect(0, seaTop, W, hy - seaTop + 2);
  // Glints on the water.
  ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.35 * sun})`;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) {
    const x = ((i * 97.3 + time * 6 - camX * W * 0.06) % (W + 40) + W + 40) % (W + 40) - 20;
    const y = seaTop + ((i * 37) % 100) / 100 * (hy - seaTop);
    const len = 6 + (i % 5) * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  // Cliffs on the left, with a lighthouse.
  const off = W * 0.4 - (camX - 1.5) * W * 0.3;
  ctx.beginPath();
  ctx.moveTo(off - W * 0.6, hy + 2);
  ctx.lineTo(off - W * 0.6, hy - H * 0.11);
  ctx.quadraticCurveTo(off - W * 0.25, hy - H * 0.13, off - W * 0.12, hy - H * 0.09);
  ctx.quadraticCurveTo(off - W * 0.04, hy - H * 0.05, off, hy + 2);
  ctx.closePath();
  ctx.fillStyle = mix("#9aa58a", "#6f776c", rain * 0.5);
  ctx.fill();
  const lx = off - W * 0.3;
  const ly = hy - H * 0.125;
  const lw = Math.max(8, W * 0.012);
  const lh = H * 0.1;
  ctx.fillStyle = "#f4f1ea";
  ctx.beginPath();
  ctx.moveTo(lx - lw * 0.6, ly);
  ctx.lineTo(lx + lw * 0.6, ly);
  ctx.lineTo(lx + lw * 0.42, ly - lh);
  ctx.lineTo(lx - lw * 0.42, ly - lh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c8553d";
  for (let i = 0; i < 3; i++) ctx.fillRect(lx - lw * 0.5, ly - lh * (0.2 + i * 0.28), lw, lh * 0.1);
  ctx.fillStyle = "#3d4a52";
  ctx.fillRect(lx - lw * 0.55, ly - lh - lw * 0.9, lw * 1.1, lw * 0.9);
  ctx.beginPath();
  ctx.arc(lx, ly - lh - lw * 0.45, lw * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,226,140,${0.6 + 0.4 * (1 - sun)})`;
  ctx.fill();
}

function valley(ctx, { W, H, hy, camX, rain }) {
  // Two ranges of peaks with snow caps, then a row of pines.
  for (let layer = 0; layer < 2; layer++) {
    const shift = camX * (0.12 + layer * 0.14) * W;
    const base = layer ? "#7f8fa3" : "#a3afc0";
    const peakH = H * (layer ? 0.2 : 0.27);
    const spacing = W * (layer ? 0.22 : 0.3);
    for (let i = -2; i < W / spacing + 3; i++) {
      const cx = i * spacing - (shift % spacing) + (layer ? spacing * 0.5 : 0);
      const h = peakH * (0.7 + 0.3 * Math.abs(Math.sin(i * 1.7 + layer)));
      const half = spacing * 0.75;
      ctx.beginPath();
      ctx.moveTo(cx - half, hy + 2);
      ctx.lineTo(cx, hy - h);
      ctx.lineTo(cx + half, hy + 2);
      ctx.closePath();
      ctx.fillStyle = mix(base, "#6c7480", rain * 0.5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - half * 0.28, hy - h * 0.72);
      ctx.lineTo(cx, hy - h);
      ctx.lineTo(cx + half * 0.28, hy - h * 0.72);
      ctx.lineTo(cx + half * 0.12, hy - h * 0.76);
      ctx.lineTo(cx, hy - h * 0.7);
      ctx.lineTo(cx - half * 0.12, hy - h * 0.76);
      ctx.closePath();
      ctx.fillStyle = "#f7f8fa";
      ctx.fill();
    }
  }
  const shift = camX * W * 0.4;
  ctx.fillStyle = mix("#3f5f46", "#3a4a40", rain * 0.4);
  for (let i = -2; i < W / 18 + 2; i++) {
    const x = i * 18 - (shift % 18);
    const h = H * (0.03 + 0.02 * Math.abs(Math.sin(i * 2.3)));
    ctx.beginPath();
    ctx.moveTo(x - h * 0.3, hy + 2);
    ctx.lineTo(x, hy - h);
    ctx.lineTo(x + h * 0.3, hy + 2);
    ctx.closePath();
    ctx.fill();
  }
}

function lake(ctx, { W, H, hy, camX, rain, sun, time, skyBottom }) {
  const lakeTop = hy - H * 0.045;
  // Hills beyond the lake, then their reflection in it.
  const hillY = lakeTop;
  const hill = (x) => H * 0.06 * (1 + wave(x / W + camX * 0.2, 4, 11, 2));
  ctx.beginPath();
  ctx.moveTo(0, hillY);
  for (let x = 0; x <= W + 10; x += 10) ctx.lineTo(x, hillY - hill(x));
  ctx.lineTo(W, hillY);
  ctx.closePath();
  ctx.fillStyle = mix("#7c9a7a", "#66736a", rain * 0.5);
  ctx.fill();
  const g = ctx.createLinearGradient(0, lakeTop, 0, hy);
  g.addColorStop(0, mix(skyBottom, "#7fa6b8", 0.5));
  g.addColorStop(1, mix("#6d9ab0", "#5f7d8a", rain * 0.6));
  ctx.fillStyle = g;
  ctx.fillRect(0, lakeTop, W, hy - lakeTop + 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, lakeTop, W, hy - lakeTop + 2);
  ctx.clip();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(0, lakeTop);
  for (let x = 0; x <= W + 10; x += 10) ctx.lineTo(x, lakeTop + hill(x) * 0.6 + Math.sin(x * 0.05 + time) * 1.2);
  ctx.lineTo(W, lakeTop);
  ctx.closePath();
  ctx.fillStyle = "#5c7a5c";
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = `rgba(255,255,255,${0.2 + 0.3 * sun})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    const x = ((i * 131.7 - camX * W * 0.08) % W + W) % W;
    const y = lakeTop + 4 + ((i * 29) % 100) / 100 * (hy - lakeTop - 6);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 14, y);
    ctx.stroke();
  }
}

function palm(ctx, x, base, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, h * 0.05);
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x + h * 0.12, base - h * 0.5, x + h * 0.05, base - h);
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55;
    ctx.beginPath();
    ctx.ellipse(x + h * 0.05 + Math.cos(a) * h * 0.22, base - h + Math.sin(a) * h * 0.1 + h * 0.06, h * 0.25, h * 0.05, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

function oasis(ctx, { W, H, hy, camX, rain }) {
  ridge(ctx, W, hy, H, camX * 0.15, 0.04, 3, 9, 0.5, mix("#e6c48d", "#a99a80", rain * 0.5), 8);
  ridge(ctx, W, hy, H, camX * 0.35, 0.028, 5, 12, 2.2, mix("#d8ab6e", "#a08c70", rain * 0.5), 8);
  // The pool and its palms.
  const cx = W * 0.6 - (camX - 1.5) * W * 0.35;
  const poolY = hy - 3;
  ctx.beginPath();
  ctx.ellipse(cx, poolY, W * 0.09, H * 0.012, 0, 0, Math.PI * 2);
  ctx.fillStyle = mix("#4fa3b8", "#5d7f88", rain * 0.5);
  ctx.fill();
  const c = mix("#4e6b3a", "#47553f", rain * 0.4);
  palm(ctx, cx - W * 0.07, poolY, H * 0.11, c);
  palm(ctx, cx + W * 0.05, poolY, H * 0.085, c);
  palm(ctx, cx + W * 0.1, poolY, H * 0.13, c);
}

export const SCENES = {
  meadow: {
    sky: { restTop: "#b8c2c9", restBottom: "#e4e3da", sunTop: "#7fb6e6", sunBottom: "#fbe7b8" },
    ground: { far: "#a9bd7d", near: "#6b8f45", dryFar: "#c9c07d", dryNear: "#a08f55" },
    grass: ["#4f7a35", "#86a64a"],
    drawBack: meadow,
  },
  seaside: {
    sky: { restTop: "#b3c4d0", restBottom: "#e6ebea", sunTop: "#6fb3ea", sunBottom: "#f6eac4" },
    ground: { far: "#9fbf86", near: "#5f8f4c", dryFar: "#c2bf86", dryNear: "#9a8d5a" },
    grass: ["#4c7a40", "#88ad58"],
    drawBack: seaside,
  },
  valley: {
    sky: { restTop: "#aebbc9", restBottom: "#e2e5ea", sunTop: "#73aee8", sunBottom: "#eaf1f8" },
    ground: { far: "#92b07a", near: "#557f43", dryFar: "#b8b884", dryNear: "#8e8656" },
    grass: ["#3f6c34", "#6f9a48"],
    drawBack: valley,
  },
  lake: {
    sky: { restTop: "#b6c3cb", restBottom: "#e3e7e2", sunTop: "#82bbe8", sunBottom: "#f8e9c2" },
    ground: { far: "#a3c184", near: "#5c8d46", dryFar: "#c4c286", dryNear: "#9c905a" },
    grass: ["#447a3a", "#7faa4e"],
    drawBack: lake,
  },
  oasis: {
    sky: { restTop: "#c9c4b9", restBottom: "#efe3cc", sunTop: "#7ab0dc", sunBottom: "#ffe2a8" },
    ground: { far: "#e3c993", near: "#c9a56a", dryFar: "#ead6a6", dryNear: "#d1b07a" },
    grass: ["#8a9a4a", "#b7b25e"],
    drawBack: oasis,
  },
};

export const sceneFor = (id) => SCENES[id] || SCENES.meadow;
export { rgba };
