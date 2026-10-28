// The landscape from the sketch, in two styles: black ink on white paper like the drawing,
// or watercolor with pastel washes, soft outlines and chalk-white lines.
import * as THREE from "three";

export const WORLD_HALF = 280;
const INK = 0x1c1917;
const CHALK = 0xfffdf6;

// Every material and object remembers what it looks like in each style, so the style can switch live.
let style = "ink";
const styled = [];

function paint(material, watercolor, ink) {
  styled.push({ material, watercolor: new THREE.Color(watercolor), ink: new THREE.Color(ink), vertexColors: material.vertexColors });
  applyTo(styled.at(-1));
  return material;
}

function onlyIn(object, which) {
  styled.push({ object, which });
  applyTo(styled.at(-1));
  return object;
}

function applyTo(entry) {
  if (entry.object) {
    entry.object.visible = entry.which === style;
    return;
  }
  entry.material.color.copy(entry[style]);
  // Ink is flat paper: a little self-light washes out most of the shading, like the drawing.
  if (entry.material.emissive) entry.material.emissive.copy(entry.ink).multiplyScalar(style === "ink" ? 0.55 : 0);
  if (entry.vertexColors && entry.material.vertexColors !== (style === "watercolor")) {
    entry.material.vertexColors = style === "watercolor";
    entry.material.needsUpdate = true;
  }
}

export function setStyle(next) {
  style = next;
  styled.forEach(applyTo);
}

const OUTLINE = paint(new THREE.MeshBasicMaterial({ side: THREE.BackSide }), 0x4a4366, INK);

// A blotchy grey-on-white texture that makes any color look like a wash of paint.
const washTexture = (() => {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 12 + Math.random() * 60;
    const gradient = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    const alpha = 0.012 + Math.random() * 0.03;
    gradient.addColorStop(0, `rgba(70,60,90,${alpha})`);
    gradient.addColorStop(0.85, `rgba(70,60,90,${alpha * 1.6})`); // pigment pools at the edge of a wash
    gradient.addColorStop(1, "rgba(70,60,90,0)");
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
})();

// Watercolor shows the color; ink shows white paper (or another ink color) with the same texture.
export function wash(color, options = {}, ink = 0xffffff) {
  return paint(new THREE.MeshLambertMaterial({ map: washTexture, ...options }), color, ink);
}

// Outline by the inverted-hull trick: a slightly larger copy that only draws its back faces.
export function outlined(mesh, thickness = 0.05) {
  const hull = new THREE.Mesh(mesh.geometry, OUTLINE);
  hull.scale.setScalar(1 + thickness);
  mesh.add(hull);
  return mesh;
}

// The hill you start on and rolling ground, before mountains.
function baseHeight(x, z) {
  const hill = 6 * Math.exp(-(x * x + z * z) / (2 * 18 * 18));
  const rolling = 1.6 * Math.sin(x * 0.045) * Math.cos(z * 0.038) + 0.9 * Math.sin((x + z) * 0.08);
  return hill + rolling;
}

// Mountains are part of the ground, so you can climb them. Like the sketch they're rounded and lumpy:
// the footprint wobbles with direction, the profile is a smooth dome, and bumps break up the top.
const MOUNTAINS = [
  { x: -90, z: -215, radius: 48, height: 45, tint: 0xb9a8dc, seed: 1.1 },
  { x: -25, z: -255, radius: 70, height: 64, tint: 0xa7b4e3, seed: 2.7 },
  { x: 50, z: -232, radius: 54, height: 48, tint: 0xc5a9d6, seed: 4.2 },
  { x: 118, z: -212, radius: 42, height: 30, tint: 0xb4bde0, seed: 5.9 },
  { x: -168, z: -188, radius: 38, height: 32, tint: 0xc8b5e0, seed: 0.4 },
  { x: 178, z: -198, radius: 46, height: 38, tint: 0xa9a3d6, seed: 3.3 },
  { x: 5, z: -310, radius: 95, height: 82, tint: 0x9fa8d8, seed: 6.6 },
];

function footprint(mountain, angle) {
  const s = mountain.seed;
  return mountain.radius * (1 + 0.16 * Math.sin(3 * angle + s) + 0.09 * Math.sin(5 * angle + 2 * s) + 0.05 * Math.sin(11 * angle + 3 * s));
}

function mountainAt(mountain, x, z) {
  const dx = x - mountain.x;
  const dz = z - mountain.z;
  const t = Math.hypot(dx, dz) / footprint(mountain, Math.atan2(dz, dx));
  if (t >= 1) return 0;
  const dome = 1 - t * t * (3 - 2 * t);
  const s = mountain.seed;
  const bumps = 0.82 + 0.1 * Math.sin(x * 0.11 + s) * Math.cos(z * 0.09 - s) + 0.08 * Math.sin(x * 0.27 - z * 0.21 + 2 * s);
  return mountain.height * Math.pow(dome, 1.15) * bumps;
}

// A cave at the foot of the left mountain, facing back toward where you start. Inside it's flat.
export const CAVE = { x: -80, z: -176, radius: 11, height: 8, doorHeight: 1.9, doorAngle: 0.22 };
CAVE.floor = baseHeight(CAVE.x, CAVE.z);

function caveBlend(x, z) {
  const r = Math.hypot(x - CAVE.x, z - CAVE.z);
  // Flat a little past the dome, so the ground mesh can't poke up through its walls between grid points.
  return THREE.MathUtils.clamp((r - CAVE.radius - 3) / 5, 0, 1);
}

function mountainsAt(x, z) {
  let h = 0;
  for (const mountain of MOUNTAINS) h += mountainAt(mountain, x, z);
  return h;
}

export function heightAt(x, z) {
  const h = baseHeight(x, z) + mountainsAt(x, z);
  const blend = caveBlend(x, z);
  return blend < 1 ? THREE.MathUtils.lerp(CAVE.floor, h, blend) : h;
}

// The cave's outer surface, for walking on its roof. Returns -Infinity away from it.
export function caveRoofAt(x, z) {
  const r = Math.hypot(x - CAVE.x, z - CAVE.z) / CAVE.radius;
  return r < 1 ? CAVE.floor + CAVE.height * Math.sqrt(1 - r * r) : -Infinity;
}

// True when (x, z) is inside the wedge of the cave's doorway, which faces +z.
export function inCaveDoor(x, z) {
  return Math.abs(Math.atan2(x - CAVE.x, z - CAVE.z)) < CAVE.doorAngle;
}

export function streamX(z) {
  return 6 * Math.sin(z * 0.06) + 2.5 * Math.sin(z * 0.17);
}

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function buildWorld(scene) {
  const rand = seeded(7);
  const sky = addSky(scene);
  addGround(scene);
  addStream(scene);
  addMountains(scene);
  addCave(scene);
  addTrees(scene, rand);
  addFlowers(scene, rand);
  return { sky, sun: addSun(scene) };
}

const SKIES = {
  watercolor: { top: 0x8fbfe6, horizon: 0xfdf0d8, duskTop: 0xc9a3d4, duskHorizon: 0xffc9a8 },
  ink: { top: 0xf7f7f7, horizon: 0xf7f7f7, duskTop: 0xf1e4da, duskHorizon: 0xf6e3d6 },
};

// The sky moves from morning toward dusk as a life is lived (0 to 1). Returns the horizon color for the fog.
export function paintSky(sky, lived) {
  const colors = SKIES[style];
  const { top, horizon } = sky.material.uniforms;
  top.value.set(colors.top).lerp(new THREE.Color(colors.duskTop), lived);
  horizon.value.set(colors.horizon).lerp(new THREE.Color(colors.duskHorizon), lived);
  return horizon.value;
}

// A painted gradient dome with soft blotches, whose colors shift toward dusk over a lifetime.
function addSky(scene) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x8fbfe6) },
      horizon: { value: new THREE.Color(0xfdf0d8) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 horizon;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }
      void main() {
        float h = smoothstep(-0.05, 0.55, vDir.y);
        float blot = noise(vDir * 4.0) * 0.6 + noise(vDir * 11.0) * 0.4;
        vec3 color = mix(horizon, top, clamp(h + (blot - 0.5) * 0.35, 0.0, 1.0));
        color *= 0.97 + blot * 0.05;
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), material);
  dome.renderOrder = -1;
  scene.add(dome);
  return dome;
}

// Sage green, lighter on the high ground, deeper in the dips, turning into each mountain's color and then snow.
function addGround(scene) {
  const geometry = new THREE.PlaneGeometry(WORLD_HALF * 2.4, WORLD_HALF * 2.4, 240, 240);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = [];
  const low = new THREE.Color(0x8fbf88);
  const high = new THREE.Color(0xd8e8a4);
  const snow = new THREE.Color(0xfbf8ff);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = heightAt(x, z);
    position.setY(i, y);
    color.copy(low).lerp(high, THREE.MathUtils.clamp((baseHeight(x, z) + 2) / 8, 0, 1));
    let tallest = null;
    let rise = 0;
    for (const mountain of MOUNTAINS) {
      const m = mountainAt(mountain, x, z);
      if (m > rise) {
        rise = m;
        tallest = mountain;
      }
    }
    if (tallest) {
      color.lerp(new THREE.Color(tallest.tint), THREE.MathUtils.clamp(rise / 5, 0, 1));
      if (rise > tallest.height * 0.55) color.lerp(snow, 0.85);
    }
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 30, uv.getY(i) * 30);
  geometry.computeVertexNormals();
  // Pushed back a touch in depth so lines drawn on the ground always show on top of it.
  const material = wash(0xffffff, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }, 0xf3f1ee);
  scene.add(new THREE.Mesh(geometry, material));
}

// A blue ribbon of water with the two wavy chalk lines from the sketch on top.
function addStream(scene) {
  const vertices = [];
  const indices = [];
  const uvs = [];
  for (let z = -16, row = 0; z > -150; z -= 1.5, row++) {
    const center = streamX(z);
    for (const side of [-1.4, 1.4]) {
      const x = center + side;
      vertices.push(x, heightAt(x, z) + 0.05, z);
      uvs.push(side > 0 ? 1 : 0, row * 0.1);
    }
    if (row > 0) {
      const a = (row - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  scene.add(onlyIn(new THREE.Mesh(geometry, wash(0x86bde6, { transparent: true, opacity: 0.85, side: THREE.DoubleSide })), "watercolor"));

  const chalk = paint(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 }), CHALK, INK);
  for (const side of [-0.5, 0.5]) {
    const points = [];
    for (let z = -16; z > -150; z -= 1.5) {
      const x = streamX(z) + side + 0.3 * Math.sin(z * 0.9);
      points.push(new THREE.Vector3(x, heightAt(x, z) + 0.1, z));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), chalk));
  }
}

// The mountains are drawn onto the ground as contour lines, like a pen sketch (black in ink, soft plum
// in watercolor). Marching squares over a grid traces where the mountains cross each height.
function addMountains(scene) {
  const lines = paint(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 }), 0x8a7fb0, INK);
  const step = 2;
  const x0 = -WORLD_HALF * 1.2;
  const z0 = -WORLD_HALF * 1.2;
  const columns = Math.ceil((WORLD_HALF * 2.4) / step);
  const rows = Math.ceil((-110 - z0) / step);
  const grid = new Float32Array((columns + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) grid[j * (columns + 1) + i] = mountainsAt(x0 + i * step, z0 + j * step);
  }
  const value = (i, j) => grid[j * (columns + 1) + i];
  const onGround = (x, z) => new THREE.Vector3(x, heightAt(x, z) + 0.15, z);
  const segments = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const heights = corners.map(([ci, cj]) => value(ci, cj));
      const high = Math.max(...heights);
      if (high < 2.5) continue;
      for (let level = 2.5; level < high; level += 6) {
        const crossings = [];
        for (let e = 0; e < 4; e++) {
          const a = heights[e];
          const b = heights[(e + 1) % 4];
          if ((a < level) === (b < level)) continue;
          const f = (level - a) / (b - a);
          const [ai, aj] = corners[e];
          const [bi, bj] = corners[(e + 1) % 4];
          crossings.push(onGround(x0 + (ai + (bi - ai) * f) * step, z0 + (aj + (bj - aj) * f) * step));
        }
        for (let c = 0; c + 1 < crossings.length; c += 2) segments.push(crossings[c], crossings[c + 1]);
      }
    }
  }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments), lines));
}

// A dome of rock with an arched doorway, half sunk into the mountain behind it. Dark inside.
function addCave(scene) {
  const { radius, height, doorHeight, doorAngle } = CAVE;
  const squash = height / radius;
  const doorTheta = Math.acos(doorHeight / height); // polar angle where the door's top edge meets the dome
  const front = Math.PI / 2; // SphereGeometry's phi that points toward +z
  const cave = new THREE.Group();
  const shell = [
    new THREE.SphereGeometry(radius, 40, 16, front + doorAngle, Math.PI * 2 - doorAngle * 2, 0, Math.PI / 2),
    new THREE.SphereGeometry(radius, 8, 8, front - doorAngle, doorAngle * 2, 0, doorTheta),
  ];
  const rock = wash(0xb9a8dc);
  const inside = wash(0x5e4f80, { side: THREE.BackSide }, 0xc9c4bf);
  for (const geometry of shell) {
    geometry.scale(1, squash, 1);
    cave.add(outlined(new THREE.Mesh(geometry, rock), 0.03), new THREE.Mesh(geometry, inside));
  }

  // The doorway's edge: up one side, across the top, down the other.
  const edge = [];
  const point = (phi, theta) => new THREE.Vector3(-radius * Math.cos(phi) * Math.sin(theta), height * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta));
  for (const phi of [front - doorAngle, front + doorAngle]) {
    for (let theta = Math.PI / 2; theta > doorTheta; theta -= 0.05) edge.push(point(phi, theta), point(phi, Math.max(doorTheta, theta - 0.05)));
  }
  for (let phi = front - doorAngle; phi < front + doorAngle; phi += 0.04) edge.push(point(phi, doorTheta), point(Math.min(front + doorAngle, phi + 0.04), doorTheta));
  cave.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edge), paint(new THREE.LineBasicMaterial(), 0x4a4366, INK)));

  // A few stalagmites inside.
  const spike = new THREE.ConeGeometry(0.5, 1, 6);
  for (const [x, z, h] of [[-4, -3, 2.2], [3.5, -5, 1.6], [-1, -7, 2.8], [5, 0, 1.2], [-6, 1, 1.4]]) {
    const stalagmite = outlined(new THREE.Mesh(spike, rock), 0.08);
    stalagmite.scale.set(1, h, 1);
    stalagmite.position.set(x, h / 2, z);
    cave.add(stalagmite);
  }

  cave.position.set(CAVE.x, CAVE.floor, CAVE.z);
  scene.add(cave);
}

// Puffy crowns in a few greens on thin brown trunks, in clusters on both sides like the sketch.
function addTrees(scene, rand) {
  const trunkMaterial = wash(0x9a7458, {}, INK);
  const crowns = [0x7fbf7a, 0x9ccf74, 0x6aa98a, 0xb5d77f].map((color) => wash(color));
  const crown = new THREE.IcosahedronGeometry(1, 1);
  const trunk = new THREE.CylinderGeometry(0.08, 0.11, 1, 6);
  const clusters = [[-38, -40, 26], [40, -45, 28], [-70, -110, 30], [75, -100, 30], [-30, 40, 24], [45, 50, 26]];
  const spots = [];
  for (const [cx, cz, r] of clusters) {
    for (let i = 0; i < 28; i++) spots.push([cx + (rand() - 0.5) * r * 2, cz + (rand() - 0.5) * r * 2]);
  }
  for (let i = 0; i < 70; i++) spots.push([(rand() - 0.5) * WORLD_HALF * 2, (rand() - 0.5) * WORLD_HALF * 2]);

  // Every trunk, every crown color and every outline is one instanced mesh, so the whole forest is a few draw calls.
  const stems = [];
  const puffs = crowns.map(() => []);
  const matrix = (x, y, z, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  for (const [x, z] of spots) {
    const onMountain = MOUNTAINS.some((mountain) => mountainAt(mountain, x, z) > 1.5);
    const nearCave = Math.hypot(x - CAVE.x, z - CAVE.z) < CAVE.radius + 6;
    if (Math.hypot(x, z) < 16 || (z > -150 && Math.abs(x - streamX(z)) < 5) || onMountain || nearCave) continue;
    const y = heightAt(x, z) - 0.1;
    const size = 0.8 + rand() * 0.8;
    stems.push(matrix(x, y + 1.3 * size, z, 1, 2.6 * size, 1));
    const color = Math.floor(rand() * crowns.length);
    const count = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const scale = size * (0.6 + rand() * 0.4);
      puffs[color].push({ x: x + (rand() - 0.5) * size * 1.4, y: y + size * (2.6 + rand() * 0.8), z: z + (rand() - 0.5) * size, scale });
    }
  }
  const instanced = (geometry, material, matrices) => {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    scene.add(mesh);
  };
  instanced(trunk, trunkMaterial, stems);
  crowns.forEach((material, c) => instanced(crown, material, puffs[c].map((p) => matrix(p.x, p.y, p.z, p.scale, p.scale, p.scale))));
  const all = puffs.flat();
  instanced(crown, OUTLINE, all.map((p) => matrix(p.x, p.y, p.z, p.scale * 1.06, p.scale * 1.06, p.scale * 1.06)));
}

// Grass strokes and dots of pastel flowers scattered over the hills.
function addFlowers(scene, rand) {
  const strokes = [];
  for (let i = 0; i < 900; i++) {
    const x = (rand() - 0.5) * WORLD_HALF * 1.6;
    const z = (rand() - 0.5) * WORLD_HALF * 1.6;
    const y = heightAt(x, z);
    strokes.push(new THREE.Vector3(x, y, z), new THREE.Vector3(x + (rand() - 0.5) * 0.3, y + 0.35 + rand() * 0.3, z));
  }
  const grass = paint(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 }), 0x5f9a63, 0x78716c);
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(strokes), grass));

  const petal = new THREE.SphereGeometry(0.16, 6, 4);
  for (const color of [0xf6a6b8, 0xfff1a8, 0xc7b3f2, 0xffffff]) {
    const flowers = new THREE.InstancedMesh(petal, new THREE.MeshLambertMaterial({ color }), 160);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 160; i++) {
      const x = (rand() - 0.5) * WORLD_HALF * 1.4;
      const z = (rand() - 0.5) * WORLD_HALF * 1.4;
      matrix.makeTranslation(x, heightAt(x, z) + 0.2, z);
      flowers.setMatrixAt(i, matrix);
    }
    scene.add(onlyIn(flowers, "watercolor"));
  }
}

// A circle with short rays, always facing the camera: butter yellow in watercolor, outlined in ink.
function addSun(scene) {
  const sun = new THREE.Group();
  sun.add(new THREE.Mesh(new THREE.CircleGeometry(6, 40), paint(new THREE.MeshBasicMaterial({ fog: false }), 0xffd877, 0xffffff)));
  sun.add(new THREE.Mesh(new THREE.TorusGeometry(6, 0.3, 6, 48), paint(new THREE.MeshBasicMaterial({ fog: false }), 0xffb35c, INK)));
  const rayMaterial = paint(new THREE.MeshBasicMaterial({ fog: false }), 0xffc56b, INK);
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.2, 0.1), rayMaterial);
    ray.position.set(Math.cos(angle) * 9, Math.sin(angle) * 9, 0);
    ray.rotation.z = angle - Math.PI / 2;
    sun.add(ray);
  }
  sun.scale.setScalar(0.75);
  scene.add(sun);
  return sun;
}

// The figure from the sketch: a round head on a bell-shaped body, two soft pod legs and thin arms held close.
// It's built at adult proportions; growFigure() reshapes it for any stage from baby to grown-up.
const HIP_HEIGHT = 0.86;
const TORSO_HEIGHT = 0.92;
const HEAD_RADIUS = 0.27;
const SHOULDER = { x: 0.31, y: 0.7 };
const ARM_LENGTH = 0.66;

export function buildFigure() {
  const body = wash(0xc9b6e8, {}, 0xffffff);
  const skin = wash(0xffe2c4);
  const pod = (radius, length, thickness) => {
    const mesh = outlined(new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 14), body), thickness);
    mesh.position.y = -length / 2;
    return mesh;
  };
  const joint = (x, y, ...children) => {
    const group = new THREE.Group();
    group.position.set(x, y, 0);
    group.add(...children);
    return group;
  };

  const figure = new THREE.Group();
  const hips = joint(0, HIP_HEIGHT);
  figure.add(hips);

  // The body is a bell: rounded shoulders, straight sides that flare a little, a flat hem over the legs.
  const profile = [[0, -0.08], [0.34, -0.08], [0.35, 0.02], [0.33, 0.4], [0.31, 0.62], [0.26, 0.78], [0.17, 0.88], [0, TORSO_HEIGHT]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const bell = outlined(new THREE.Mesh(new THREE.LatheGeometry(profile, 28), body), 0.05);
  bell.scale.z = 0.72;
  const torso = joint(0, 0);
  const trunk = joint(0, 0, bell);
  const head = outlined(new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS, 24, 16), skin), 0.06);
  torso.add(trunk, head);
  hips.add(torso);

  const arms = [-1, 1].map((side) => {
    const elbow = joint(0, -0.34, pod(0.055, 0.26, 0.16));
    const shoulder = joint(side * SHOULDER.x, SHOULDER.y, pod(0.062, 0.26, 0.15), elbow);
    shoulder.rotation.z = side * 0.12;
    torso.add(shoulder);
    return { shoulder, elbow, side };
  });

  // Legs are two pods each, overlapping at the knee so a standing leg reads as one shape.
  const legs = [-1, 1].map((side) => {
    const knee = joint(0, -0.4, pod(0.115, 0.34, 0.07));
    const hip = joint(side * 0.15, 0, pod(0.13, 0.3, 0.07), knee);
    hips.add(hip);
    return { hip, knee };
  });

  return { figure, hips, torso, trunk, head, arms, legs };
}

const mix = (a, b, t) => a + (b - a) * t;

// Growth runs from 0 (a baby) to 1 (grown). Babies are small with a big head, short limbs and a round body.
export function growFigure(rig, growth) {
  const chub = mix(1.25, 1, growth);
  const legs = mix(0.5, 1, growth);
  const trunk = mix(0.78, 1, growth);
  const head = mix(1.45, 1, Math.sqrt(growth)); // the head stops growing early, so it shrinks against the body
  const arms = mix(0.62, 1, growth);

  rig.trunk.scale.set(chub, trunk, chub);
  rig.head.scale.setScalar(head);
  rig.head.position.y = TORSO_HEIGHT * trunk + HEAD_RADIUS * head * 0.85;
  for (const arm of rig.arms) {
    arm.shoulder.position.set(arm.side * SHOULDER.x * chub, SHOULDER.y * trunk, 0);
    arm.shoulder.scale.set(chub, arms, chub);
  }
  for (const leg of rig.legs) leg.hip.scale.set(chub, legs, chub);

  const scale = mix(0.36, 1, growth);
  rig.figure.scale.setScalar(scale);
  // Lengths are in the figure's own units, for posing; height is in the world's, for fitting through the cave door.
  return {
    growth,
    hip: HIP_HEIGHT * legs,
    kneel: 0.4 * legs + 0.12 * chub,
    shoulder: SHOULDER.y * trunk,
    arm: ARM_LENGTH * arms,
    height: (HIP_HEIGHT * legs + TORSO_HEIGHT * trunk + HEAD_RADIUS * head * 1.85) * scale,
  };
}

const SHAPES = {
  sphere: () => new THREE.SphereGeometry(0.8, 20, 14),
  box: () => new THREE.BoxGeometry(1.2, 1.2, 1.2),
  cone: () => new THREE.ConeGeometry(0.8, 1.5, 16),
  cylinder: () => new THREE.CylinderGeometry(0.6, 0.6, 1.4, 18),
  torus: () => new THREE.TorusGeometry(0.7, 0.25, 10, 28),
  octahedron: () => new THREE.OctahedronGeometry(0.9),
  dodecahedron: () => new THREE.DodecahedronGeometry(0.85),
  tetrahedron: () => new THREE.TetrahedronGeometry(1),
  capsule: () => new THREE.CapsuleGeometry(0.45, 0.8, 6, 14),
  ring: () => new THREE.TorusGeometry(0.75, 0.1, 8, 36),
};
export const SHAPE_NAMES = Object.keys(SHAPES);
const ITEM_COLORS = [0xf7a8c4, 0xa8d8f0, 0xffd98a, 0xc4b0ee, 0xa9e0b8, 0xffb59a];

// An offered item: a floating shape over a ring on the ground, pinned by a thin line.
export function buildItem(shape, index) {
  const item = new THREE.Group();
  const color = ITEM_COLORS[index % ITEM_COLORS.length];
  const object = outlined(new THREE.Mesh((SHAPES[shape] ?? SHAPES.sphere)(), wash(color)), 0.06);
  object.position.y = 2;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 1.72, 40),
    paint(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, side: THREE.DoubleSide }), CHALK, 0xff4100),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4), paint(new THREE.MeshBasicMaterial(), CHALK, INK));
  pin.position.y = 0.6;
  item.add(object, ring, pin);
  return { item, object };
}
