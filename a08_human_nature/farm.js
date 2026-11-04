// The farm: what you own and carry (coins, seeds, fruit, farm locations), and saving it.
// Guests save in the browser. Signed in with Google, the same profile is saved to Firestore
// (humanNatureFarms/{uid}) so it follows you to other devices.

import { SPECIES, CROPS } from "./plants.js";

// Coins for one fruit at the market.
export const PRICES = {
  blueberry: 1,
  strawberry: 2,
  tomato: 3,
  pepper: 4,
  eggplant: 6,
  sunflower: 9,
  pumpkin: 16,
};

// Singular and plural names for each crop's fruit.
export const FRUIT_NAMES = {
  tomato: ["tomato", "tomatoes"],
  pepper: ["pepper", "peppers"],
  eggplant: ["eggplant", "eggplants"],
  blueberry: ["blueberry", "blueberries"],
  strawberry: ["strawberry", "strawberries"],
  sunflower: ["sunflower head", "sunflower heads"],
  pumpkin: ["pumpkin", "pumpkins"],
};

// Farm locations. dry and grow multiply how fast plants dry out and grow there.
export const LOCATIONS = [
  { id: "meadow", name: "The Meadow", price: 0, dry: 1, grow: 1, about: "Rolling green hills under a wide sky. Where it all starts." },
  { id: "seaside", name: "Seaside Cliffs", price: 150, dry: 0.8, grow: 1, about: "A field on the cliffs above the sea, with a lighthouse. The sea air keeps the soil damp." },
  { id: "valley", name: "Mountain Valley", price: 400, dry: 0.85, grow: 0.9, about: "Snowy peaks and pines all around. It's cool, so plants dry out slowly but grow a little slower." },
  { id: "lake", name: "Lakeside", price: 800, dry: 0.65, grow: 1, about: "A still lake that mirrors the hills. The wettest ground there is." },
  { id: "oasis", name: "Desert Oasis", price: 1500, dry: 1.5, grow: 1.3, about: "Dunes and palms around a pool. The hot sun makes everything grow fast, and dry out fast." },
];
export const locationById = (id) => LOCATIONS.find((l) => l.id === id) || LOCATIONS[0];

export function newProfile() {
  return {
    version: 2,
    coins: 0,
    seeds: { tomato: 3, strawberry: 3, sunflower: 2, pepper: 2, eggplant: 1, blueberry: 1, pumpkin: 1 },
    fruit: Object.fromEntries(CROPS.map((c) => [c, 0])),
    owned: ["meadow"],
    current: "meadow",
    selectedSeed: "tomato",
    farms: {},
    harvests: 0,
    sold: 0,
  };
}

// Fill in anything missing (older saves, hand-edited data).
export function normalize(p) {
  const base = newProfile();
  const out = { ...base, ...(p || {}) };
  out.seeds = { ...Object.fromEntries(CROPS.map((c) => [c, 0])), ...(p?.seeds || base.seeds) };
  out.fruit = { ...base.fruit, ...(p?.fruit || {}) };
  for (const c of CROPS) {
    out.seeds[c] = Math.max(0, Math.floor(Number(out.seeds[c]) || 0));
    out.fruit[c] = Math.max(0, Math.floor(Number(out.fruit[c]) || 0));
  }
  out.coins = Math.max(0, Math.floor(Number(out.coins) || 0));
  out.owned = Array.isArray(out.owned) && out.owned.length ? out.owned.filter((id) => LOCATIONS.some((l) => l.id === id)) : ["meadow"];
  if (!out.owned.includes("meadow")) out.owned.unshift("meadow");
  if (!out.owned.includes(out.current)) out.current = "meadow";
  if (!CROPS.includes(out.selectedSeed)) out.selectedSeed = "tomato";
  out.farms = out.farms && typeof out.farms === "object" ? out.farms : {};
  return out;
}

// Only what's needed to rebuild a plant, rounded, so saves stay small.
const PLANT_KEYS = ["id", "species", "x", "z", "growth", "water", "fruit", "barren", "spent", "harvests", "dryTime", "thirstTime", "dead", "seed", "flip", "spreadTimer", "announced"];
export function packPlants(plants) {
  return plants
    .filter((p) => !p.cut && SPECIES[p.species])
    .map((p) => {
      const o = {};
      for (const k of PLANT_KEYS) {
        const v = p[k];
        if (v === undefined || v === false || v === 0) continue;
        o[k] = typeof v === "number" ? Math.round(v * 1000) / 1000 : v;
      }
      return o;
    });
}

export function unpackPlants(list) {
  return (Array.isArray(list) ? list : [])
    .filter((p) => p && SPECIES[p.species])
    .map((p) => ({
      growth: 0, water: 0.5, fruit: 0, barren: false, spent: false, harvests: 0, dryTime: 0, thirstTime: 0,
      dead: false, lean: 0, seed: Math.random() * 1000, flip: 1, spreadTimer: 25, announced: false,
      ...p,
    }));
}

// ---------- browser storage ----------

const LOCAL_KEY = "human-nature-profile-v2";
const OLD_KEY = "human-nature-field-v1";

export function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return normalize(JSON.parse(raw));
    // The first version saved just one field. Bring it into the meadow.
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
    if (old && Array.isArray(old.plants) && old.plants.length) {
      const p = newProfile();
      p.farms.meadow = { plants: packPlants(old.plants), camX: old.camX ?? 1.5 };
      return p;
    }
  } catch { /* unreadable: start fresh */ }
  return null;
}

export function saveLocal(profile) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(profile)); } catch { /* full or blocked */ }
}

// ---------- cloud (Firebase) ----------

let fb = null;
export function cloud() {
  if (fb) return fb;
  if (!window.firebase || !window.firebaseConfig) return null;
  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.firebaseConfig);
  fb = { auth: app.auth(), farms: app.firestore().collection("humanNatureFarms") };
  return fb;
}

export async function loadCloud(uid) {
  const c = cloud();
  if (!c) return null;
  const snap = await c.farms.doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data();
  try { return normalize(JSON.parse(data.data)); } catch { return null; }
}

export async function saveCloud(user, profile) {
  const c = cloud();
  if (!c || !user) return;
  await c.farms.doc(user.uid).set({
    data: JSON.stringify(profile),
    name: (user.displayName || "").split(" ")[0].slice(0, 40),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}
