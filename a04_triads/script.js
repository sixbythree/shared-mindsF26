const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const QUALITIES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
};
const TONE_NAMES = ["root", "third", "fifth"];
const INVERSION_NAMES = ["Root position", "First inversion", "Second inversion"];

// The piano runs C4 (MIDI 60) to C6 (MIDI 84).
const LOWEST = 60;
const HIGHEST = 84;
// Computer keys in piano order, starting at C of the current octave.
const KEY_CODES = ["KeyA", "KeyW", "KeyS", "KeyE", "KeyD", "KeyF", "KeyT", "KeyG", "KeyY", "KeyH", "KeyU", "KeyJ", "KeyK", "KeyO", "KeyL", "KeyP", "Semicolon", "Quote"];
const KEY_LABELS = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", ";", "'"];

const NOTE_MS = 650;
const CHORD_MS = 1300;
const GAP_MS = 500;
const LOCAL_SETS_KEY = "triads-sets";
const NAME_KEY = "triads-name";

const state = {
  root: 0,
  quality: "major",
  baseMidi: 60,
  stageNotes: [],
  playing: false,
  lastSet: null,
};

const frames = [...document.querySelectorAll(".frame")];
const piano = document.querySelector("#piano");
const rootSelect = document.querySelector("#root-select");
const qualitySelect = document.querySelector("#quality-select");
const playButton = document.querySelector("#play-button");
const inversionButtons = [...document.querySelectorAll(".inversions button")];
const statusMessage = document.querySelector("#status");
const nowPlaying = document.querySelector("#now-playing");
const setSection = document.querySelector("#set");
const slideFrames = document.querySelector("#slide-frames");
const slideName = document.querySelector("#slide-name");
const slideDots = [...document.querySelectorAll("#slide-dots button")];
let slideIndex = 0;
const saveForm = document.querySelector("#save-form");
const nameInput = document.querySelector("#name-input");
const wall = document.querySelector("#wall");

const keyElements = new Map();
const heldNotes = new Set();
const heldCodes = new Map();
const heldPointers = new Map();

/* ---------- Music ---------- */

function chordIntervals(quality = state.quality) {
  return QUALITIES[quality];
}

function noteName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function chordName(root, quality) {
  return `${NOTE_NAMES[root]} ${quality}`;
}

// The notes of one inversion, lowest first, each tagged with its chord tone (0 root, 1 third, 2 fifth).
function inversionNotes(inversion, root = state.root, quality = state.quality) {
  const intervals = chordIntervals(quality);
  const notes = [0, 1, 2].map((step) => {
    const tone = (inversion + step) % 3;
    const octaveUp = inversion + step >= 3 ? 12 : 0;
    return { tone, midi: LOWEST + root + intervals[tone] + octaveUp };
  });
  let shift = 0;
  while (Math.max(...notes.map((note) => note.midi)) + shift > HIGHEST) shift -= 12;
  while (Math.min(...notes.map((note) => note.midi)) + shift < LOWEST) shift += 12;
  return notes.map((note) => ({ ...note, midi: note.midi + shift }));
}

function inversionOrder(inversion) {
  return inversionNotes(inversion).map((note) => note.tone + 1).join(" · ");
}

function toneOf(midi) {
  const pitchClass = midi % 12;
  return chordIntervals().findIndex((interval) => (state.root + interval) % 12 === pitchClass);
}

// Finds a major, minor, diminished or augmented triad in three pitch classes.
function findTriad(pitchClasses) {
  for (const root of pitchClasses) {
    const intervals = pitchClasses.map((pc) => (pc - root + 12) % 12).sort((a, b) => a - b);
    for (const [quality, shape] of Object.entries(QUALITIES)) {
      if (shape.every((interval, index) => interval === intervals[index])) return { root, quality };
    }
  }
  return null;
}

// Each pitch class gets a hue from the circle of fifths, so close keys get close colors.
function colorFor(midi) {
  const hue = ((midi % 12) * 7 % 12) * 30;
  return `oklch(0.74 0.16 ${hue})`;
}

/* ---------- Sound ---------- */

let audioContext = null;
let master = null;
const voices = new Map();

function audio() {
  if (!audioContext) {
    audioContext = new AudioContext();
    const compressor = audioContext.createDynamicsCompressor();
    master = audioContext.createGain();
    master.gain.value = 0.5;
    master.connect(compressor);
    compressor.connect(audioContext.destination);
  }
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function startNote(midi) {
  stopNote(midi, 0.03);
  const context = audio();
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const now = context.currentTime;
  const envelope = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1800 + frequency * 2;
  const body = context.createOscillator();
  body.type = "triangle";
  body.frequency.value = frequency;
  const shine = context.createOscillator();
  shine.frequency.value = frequency * 2;
  const shineLevel = context.createGain();
  shineLevel.gain.value = 0.2;
  body.connect(filter);
  shine.connect(shineLevel).connect(filter);
  filter.connect(envelope).connect(master);
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(0.3, now + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.001, now + 3);
  body.start(now);
  shine.start(now);
  body.stop(now + 3.05);
  shine.stop(now + 3.05);
  voices.set(midi, { envelope, oscillators: [body, shine] });
}

function stopNote(midi, release = 0.25) {
  const voice = voices.get(midi);
  if (!voice) return;
  voices.delete(midi);
  const now = audioContext.currentTime;
  const level = Math.max(voice.envelope.gain.value, 0.0001);
  voice.envelope.gain.cancelScheduledValues(now);
  voice.envelope.gain.setValueAtTime(level, now);
  voice.envelope.gain.exponentialRampToValueAtTime(0.0001, now + release);
  voice.oscillators.forEach((oscillator) => {
    try {
      oscillator.stop(now + release + 0.02);
    } catch {
      // Already stopped.
    }
  });
}

/* ---------- Piano ---------- */

function buildPiano() {
  for (let midi = LOWEST; midi <= HIGHEST; midi += 1) {
    const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
    const key = document.createElement("div");
    key.className = `key ${isBlack ? "black" : "white"}`;
    key.dataset.midi = midi;
    key.setAttribute("aria-label", noteName(midi));
    piano.append(key);
    keyElements.set(midi, key);
  }
  piano.addEventListener("pointerdown", (event) => {
    const key = event.target.closest(".key");
    if (!key) return;
    event.preventDefault();
    const midi = Number(key.dataset.midi);
    heldPointers.set(event.pointerId, midi);
    noteOn(midi);
  });
  const release = (event) => {
    const midi = heldPointers.get(event.pointerId);
    if (midi === undefined) return;
    heldPointers.delete(event.pointerId);
    noteOff(midi);
  };
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  labelKeys();
}

function labelKeys() {
  keyElements.forEach((key, midi) => {
    const index = midi - state.baseMidi;
    key.textContent = index >= 0 && index < KEY_LABELS.length ? KEY_LABELS[index] : "";
  });
}

function markChordTones() {
  keyElements.forEach((key, midi) => key.classList.toggle("tone", toneOf(midi) !== -1));
}

function lightKey(midi, isLit) {
  keyElements.get(midi)?.classList.toggle("lit", isLit);
}

function noteOn(midi) {
  heldNotes.add(midi);
  lightKey(midi, true);
  startNote(midi);
  if (state.playing) return;
  nowPlaying.textContent = "\u00a0";
  followHands();
}

function noteOff(midi) {
  heldNotes.delete(midi);
  if (!state.playing) lightKey(midi, false);
  stopNote(midi);
}

// While you play, a held triad picks the chord, and held chord tones show their colors left to right.
function followHands() {
  const held = [...heldNotes].sort((a, b) => a - b);
  const pitchClasses = [...new Set(held.map((midi) => midi % 12))];
  if (pitchClasses.length === 3) {
    const triad = findTriad(pitchClasses);
    if (triad && (triad.root !== state.root || triad.quality !== state.quality)) {
      setChord(triad.root, triad.quality, { keepStage: true });
    }
  }
  const notes = held
    .map((midi) => ({ midi, tone: toneOf(midi) }))
    .filter((note) => note.tone !== -1)
    .slice(0, 3);
  if (notes.length) showStage(notes);
}

function onKeyDown(event) {
  if (event.target.closest("input, select, textarea") || event.metaKey || event.ctrlKey || event.altKey) return;
  if ((event.code === "ArrowLeft" || event.code === "ArrowRight") && !setSection.hidden) {
    event.preventDefault();
    showSlide(slideIndex + (event.code === "ArrowRight" ? 1 : -1));
    return;
  }
  if (event.code === "KeyZ" || event.code === "KeyX") {
    state.baseMidi = Math.min(72, Math.max(60, state.baseMidi + (event.code === "KeyX" ? 12 : -12)));
    labelKeys();
    return;
  }
  const index = KEY_CODES.indexOf(event.code);
  if (index === -1) return;
  event.preventDefault();
  if (event.repeat || heldCodes.has(event.code)) return;
  const midi = state.baseMidi + index;
  if (midi > HIGHEST) return;
  heldCodes.set(event.code, midi);
  noteOn(midi);
}

function onKeyUp(event) {
  const midi = heldCodes.get(event.code);
  if (midi === undefined) return;
  heldCodes.delete(event.code);
  noteOff(midi);
}

function releaseAll() {
  heldCodes.clear();
  heldPointers.clear();
  [...heldNotes].forEach(noteOff);
}

/* ---------- Frames ---------- */

function swatchFor(midi) {
  const swatch = document.createElement("div");
  swatch.className = "swatch";
  swatch.style.background = colorFor(midi);
  return swatch;
}

function showStage(notes) {
  state.stageNotes = notes;
  frames.forEach((frame, slot) => {
    const art = frame.querySelector(".frame-art");
    const caption = frame.querySelector("figcaption");
    const note = notes[slot];
    art.replaceChildren(note ? swatchFor(note.midi) : "");
    caption.textContent = note ? `${noteName(note.midi)} · ${TONE_NAMES[note.tone]}` : "";
  });
}

/* ---------- Controls ---------- */

function setChord(root, quality, { keepStage = false } = {}) {
  state.root = root;
  state.quality = quality;
  rootSelect.value = String(root);
  qualitySelect.value = quality;
  markChordTones();
  if (!keepStage) showStage(inversionNotes(0));
}

function setStatus(message, kind = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.kind = kind;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Plays one inversion note by note, lighting keys and filling frames, then as a chord.
async function playInversion(inversion) {
  const notes = inversionNotes(inversion);
  nowPlaying.textContent = `${INVERSION_NAMES[inversion]} · ${inversionOrder(inversion)}`;
  inversionButtons.forEach((button, index) => button.classList.toggle("active", index === inversion));
  showStage([]);
  for (let step = 0; step < notes.length; step += 1) {
    lightKey(notes[step].midi, true);
    startNote(notes[step].midi);
    showStage(notes.slice(0, step + 1));
    await sleep(NOTE_MS);
  }
  notes.forEach((note) => startNote(note.midi));
  await sleep(CHORD_MS);
  notes.forEach((note) => {
    stopNote(note.midi, 0.6);
    lightKey(note.midi, false);
  });
}

function setPlaying(isPlaying) {
  if (isPlaying) releaseAll();
  state.playing = isPlaying;
  playButton.disabled = isPlaying;
  inversionButtons.forEach((button) => {
    button.disabled = isPlaying;
    if (!isPlaying) button.classList.remove("active");
  });
}

async function playOne(inversion) {
  if (state.playing) return;
  setPlaying(true);
  await playInversion(inversion);
  setPlaying(false);
}

async function playSet() {
  if (state.playing) return;
  setPlaying(true);
  state.lastSet = { root: state.root, quality: state.quality };
  setSection.hidden = true;

  for (let inversion = 0; inversion < 3; inversion += 1) {
    await playInversion(inversion);
    await sleep(GAP_MS);
  }

  nowPlaying.textContent = "Now in silence.";
  showStage(inversionNotes(0));
  showSlide(0);
  setSection.hidden = false;
  setSection.scrollIntoView({ behavior: "smooth", block: "start" });
  setPlaying(false);
}

// The played set in silence, one inversion at a time; wraps around at either end.
function showSlide(index) {
  const set = state.lastSet;
  if (!set) return;
  slideIndex = (index + 3) % 3;
  const notes = inversionNotes(slideIndex, set.root, set.quality);
  slideFrames.replaceChildren(...notes.map((note) => {
    const mini = document.createElement("div");
    mini.className = "mini";
    mini.append(swatchFor(note.midi));
    return mini;
  }));
  slideName.textContent = `${INVERSION_NAMES[slideIndex]} · ${notes.map((note) => note.tone + 1).join(" · ")}`;
  slideDots.forEach((dot, dotIndex) => dot.setAttribute("aria-current", String(dotIndex === slideIndex)));
}

/* ---------- Saving and the wall ---------- */

let setsCollection = null;
try {
  if (window.firebase && window.firebaseConfig) {
    setsCollection = firebase.initializeApp(window.firebaseConfig).firestore().collection("triadsSets");
  }
} catch (error) {
  console.warn("Firebase unavailable", error);
}

function localSets() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SETS_KEY)) ?? [];
  } catch {
    return [];
  }
}

async function saveSet(event) {
  event.preventDefault();
  const makerName = nameInput.value.trim();
  if (!makerName || !state.lastSet) return;
  localStorage.setItem(NAME_KEY, makerName);
  const set = state.lastSet;
  const record = {
    makerName,
    root: set.root,
    quality: set.quality,
  };

  // Keep a copy in this browser first, then share it.
  localStorage.setItem(LOCAL_SETS_KEY, JSON.stringify([{ ...record, createdAt: Date.now() }, ...localSets()].slice(0, 24)));
  const button = saveForm.querySelector("button");
  button.disabled = true;
  try {
    if (!setsCollection) throw new Error("offline");
    await setsCollection.add({ ...record, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    setStatus("Saved to the wall.");
  } catch (error) {
    console.warn(error);
    setStatus("Saved in this browser, but it couldn't reach the shared wall.", "error");
    renderWall(localSets());
  } finally {
    button.disabled = false;
  }
  setSection.hidden = true;
  wall.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderWall(sets) {
  if (!sets.length) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = "No sets yet. Play one and save it.";
    wall.replaceChildren(empty);
    return;
  }
  wall.replaceChildren(...sets.map((record) => {
    const set = record;
    const item = document.createElement("li");
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    const head = document.createElement("div");
    head.className = "card-head";
    const title = document.createElement("strong");
    title.textContent = chordName(set.root, set.quality);
    const maker = document.createElement("span");
    maker.textContent = set.makerName;
    head.append(title, maker);
    card.append(head);
    [0, 1, 2].forEach((inversion) => {
      const row = document.createElement("div");
      row.className = "card-row";
      inversionNotes(inversion, set.root, set.quality).forEach((note) => {
        const mini = document.createElement("div");
        mini.className = "mini";
        mini.append(swatchFor(note.midi));
        row.append(mini);
      });
      card.append(row);
    });
    card.addEventListener("click", () => loadSet(set));
    item.append(card);
    return item;
  }));
}

function loadSet(set) {
  if (state.playing) return;
  setChord(set.root, set.quality);
  setStatus(`Loaded ${set.makerName}'s ${chordName(set.root, set.quality)}. Press Play the set.`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function listenToWall() {
  if (!setsCollection) {
    renderWall(localSets());
    return;
  }
  setsCollection.orderBy("createdAt", "desc").limit(24).onSnapshot(
    (snapshot) => renderWall(snapshot.docs.map((doc) => doc.data())),
    (error) => {
      console.warn(error);
      renderWall(localSets());
    },
  );
}

/* ---------- Start ---------- */

rootSelect.append(...NOTE_NAMES.map((name, index) => new Option(name, String(index))));
nameInput.value = localStorage.getItem(NAME_KEY) ?? "";

buildPiano();
setChord(0, "major");

rootSelect.addEventListener("change", () => setChord(Number(rootSelect.value), state.quality));
qualitySelect.addEventListener("change", () => setChord(state.root, qualitySelect.value));
playButton.addEventListener("click", playSet);
inversionButtons.forEach((button) => button.addEventListener("click", () => playOne(Number(button.dataset.inversion))));
saveForm.addEventListener("submit", saveSet);
document.querySelector("#slide-prev").addEventListener("click", () => showSlide(slideIndex - 1));
document.querySelector("#slide-next").addEventListener("click", () => showSlide(slideIndex + 1));
slideDots.forEach((dot) => dot.addEventListener("click", () => showSlide(Number(dot.dataset.slide))));
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("blur", releaseAll);

listenToWall();
