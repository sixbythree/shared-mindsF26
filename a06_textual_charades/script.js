const REPLICATE_PROXY_URL = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
const GUESSER_MODEL = "openai/gpt-4o-mini";
const EMBEDDING_MODEL = "beautyyuyanli/multilingual-e5-large:a06276a89f1a902d5fc225a9ca32b6e8e6292b7f3b136518878da97c458e2bad";
const GAME_SECONDS = 90;
const MAX_CLUES = 8;
const WORDS = [
  "cat", "dog", "ocean", "piano", "volcano", "candle", "bicycle", "umbrella", "castle", "garden",
  "rocket", "library", "dragon", "pizza", "winter", "mirror", "bridge", "forest", "camera", "lighthouse",
  "desert", "clock", "rainbow", "penguin", "kitchen", "guitar", "moon", "island", "train", "honey",
  "snow", "circus", "pirate", "robot", "museum", "coffee", "spider", "wedding", "thunder", "balloon",
  "elephant", "hospital", "diamond", "ghost", "mountain", "telescope", "butterfly", "airport", "cheese", "violin",
];

const board = document.querySelector("#board");
const targetMarker = document.querySelector("#target-marker");
const targetWordEl = document.querySelector("#target-word");
const timerEl = document.querySelector("#timer");
const scoreEl = document.querySelector("#score");
const clueForm = document.querySelector("#clue-form");
const clueInput = document.querySelector("#clue");
const clueButton = document.querySelector("#clue-button");
const skipButton = document.querySelector("#skip-button");
const clueTrail = document.querySelector("#clue-trail");
const resolutionInput = document.querySelector("#resolution");
const resolutionValue = document.querySelector("#resolution-value");
const resolutionNote = document.querySelector("#resolution-note");
const statusMessage = document.querySelector("#status");
const leaderboard = document.querySelector("#leaderboard");
const roundFeed = document.querySelector("#round-feed");
const intro = document.querySelector("#intro");
const startForm = document.querySelector("#start-form");
const playingAs = document.querySelector("#playing-as");
const signedOutSection = document.querySelector("#signed-out");
const signedInSection = document.querySelector("#signed-in");
const signInButton = document.querySelector("#sign-in-button");
const signOutButton = document.querySelector("#sign-out-button");
const authStatus = document.querySelector("#auth-status");
const gameOver = document.querySelector("#game-over");
const finalScore = document.querySelector("#final-score");
const finalDetail = document.querySelector("#final-detail");
const againButton = document.querySelector("#again-button");

const app = firebase.initializeApp(window.firebaseConfig);
const database = app.firestore();
const auth = app.auth();
const playersCollection = database.collection("charadesPlayers");
const roundsCollection = database.collection("charadesRounds");
const LIVE_WINDOW_MS = 3 * 60 * 1000;
// Players sign in with Google; their leaderboard row is keyed by their account ID.
let currentUser = null;
// Players who share a first name get different colors (uid → color index).
const nameColors = new Map();
let latestRounds = [];

const game = {
  playerName: "",
  score: 0,
  bestScore: 0,
  wordsSolved: 0,
  timeLeft: GAME_SECONDS,
  timerId: null,
  active: false,
  busy: false,
  target: "",
  clues: [],
  guesses: new Map(),
  usedTargets: new Set(),
};

updateResolutionNote();
listenToLeaderboard();
listenToRoundFeed();

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  signedOutSection.hidden = Boolean(user);
  signedInSection.hidden = !user;
  authStatus.textContent = user ? `Signed in as ${user.email}` : "";
  if (!user) return;
  const saved = await playersCollection.doc(user.uid).get().catch(() => null);
  game.bestScore = saved?.data()?.bestScore ?? 0;
  playingAs.textContent = firstName(user);
});

signInButton.addEventListener("click", async () => {
  authStatus.textContent = "";
  try {
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch (error) {
    if (error.code !== "auth/popup-closed-by-user" && error.code !== "auth/cancelled-popup-request") {
      authStatus.textContent = `Couldn't sign in: ${error.message}`;
    }
  }
});

signOutButton.addEventListener("click", () => auth.signOut());

startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentUser) return;
  game.playerName = firstName(currentUser);
  intro.hidden = true;
  startGame();
});

againButton.addEventListener("click", () => {
  gameOver.hidden = true;
  startGame();
});

resolutionInput.addEventListener("input", updateResolutionNote);

skipButton.addEventListener("click", async () => {
  if (!game.active || game.busy) return;
  await recordRound(false, 0);
  setStatus(`Skipped. The word was “${game.target}”.`);
  nextRound();
});

clueForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!game.active || game.busy) return;

  const clue = clueInput.value.trim().toLowerCase();
  const problem = validateClue(clue);
  if (problem) {
    setStatus(problem, "error");
    return;
  }

  game.clues.push(clue);
  addClueToTrail(clue);
  clueInput.value = "";
  setBusy(true);
  setStatus("The machine is guessing…");

  try {
    const resolution = Number(resolutionInput.value);
    const [englishClue, guesses] = await Promise.all([translateToEnglish(clue), getGuesses(game.clues, resolution)]);
    if (revealsTarget(englishClue)) {
      game.clues.pop();
      clueTrail.lastElementChild?.remove();
      setStatus(`“${clue}” means “${englishClue}”: no translating “${game.target}”!`, "error");
      return;
    }
    const freshGuesses = guesses.filter((word) => !game.guesses.has(word));
    if (freshGuesses.length === 0) {
      setStatus("No new guesses. Try a different angle.");
      return;
    }

    setStatus("Measuring how close each guess is…");
    const embeddings = await getEmbeddings([game.target, ...freshGuesses]);
    const [targetEmbedding, ...guessEmbeddings] = embeddings;
    freshGuesses.forEach((word, index) => {
      game.guesses.set(word, { similarity: cosineSimilarity(targetEmbedding, guessEmbeddings[index]), clueIndex: game.clues.length - 1 });
    });
    layoutGuesses(resolution);

    const hit = freshGuesses.find((word) => sameWord(word, game.target));
    if (hit) {
      await solveRound(hit);
      return;
    }

    const closest = freshGuesses.reduce((best, word) => (game.guesses.get(word).similarity > game.guesses.get(best).similarity ? word : best));
    setStatus(`Closest guess: “${closest}”. ${game.clues.length >= MAX_CLUES ? "Out of clues: skip to a new word." : "Give another clue."}`);
  } catch (error) {
    game.clues.pop();
    clueTrail.lastElementChild?.remove();
    setStatus(error instanceof Error ? error.message : "Something went wrong. Try again.", "error");
  } finally {
    setBusy(false);
  }
});

function startGame() {
  game.score = 0;
  game.wordsSolved = 0;
  game.timeLeft = GAME_SECONDS;
  game.active = true;
  game.usedTargets.clear();
  scoreEl.textContent = "0";
  renderTimer();
  savePlayer(true);
  nextRound();
  setBusy(false);
  clearInterval(game.timerId);
  game.timerId = setInterval(tick, 1000);
}

function tick() {
  // The clock pauses while the models think so slow responses don't cost the player time.
  if (game.busy) return;
  game.timeLeft -= 1;
  renderTimer();
  if (game.timeLeft <= 0) endGame();
}

async function endGame() {
  clearInterval(game.timerId);
  game.active = false;
  setBusy(false);
  if (game.clues.length > 0) await recordRound(false, 0);
  game.bestScore = Math.max(game.bestScore, game.score);
  savePlayer(false);
  finalScore.textContent = `${game.score} ${game.score === 1 ? "point" : "points"}`;
  finalDetail.textContent = `You got the machine to say ${game.wordsSolved} ${game.wordsSolved === 1 ? "word" : "words"}. The last word was “${game.target}”.`;
  gameOver.hidden = false;
}

function nextRound() {
  if (game.usedTargets.size >= WORDS.length) game.usedTargets.clear();
  const remaining = WORDS.filter((word) => !game.usedTargets.has(word));
  game.target = remaining[Math.floor(Math.random() * remaining.length)];
  game.usedTargets.add(game.target);
  game.clues = [];
  game.guesses.clear();
  clueTrail.replaceChildren();
  board.querySelectorAll(".guess").forEach((element) => element.remove());
  targetWordEl.textContent = game.target;
  targetMarker.textContent = game.target;
  targetMarker.classList.remove("solved");
  clueInput.focus();
}

async function solveRound(word) {
  const points = Math.max(1, 6 - game.clues.length);
  game.score += points;
  game.wordsSolved += 1;
  scoreEl.textContent = String(game.score);
  targetMarker.classList.add("solved");
  setStatus(`Got it! The machine said “${word}” after ${game.clues.length} ${game.clues.length === 1 ? "clue" : "clues"}. +${points}`, "success");
  await Promise.all([recordRound(true, points), savePlayer(true)]);
  await wait(1400);
  if (game.active) nextRound();
}

function validateClue(clue) {
  if (!clue) return "Type a clue first.";
  if (game.clues.length >= MAX_CLUES) return "That's all the clues for this word. Skip to try another.";
  if (revealsTarget(clue)) return `No saying “${game.target}” or part of it!`;
  if (game.clues.includes(clue)) return "You already gave that clue.";
  return "";
}

function revealsTarget(text) {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.some((word) => sameWord(word, game.target) || word.includes(game.target) || (word.length > 3 && game.target.includes(word)));
}

// The embedding model is multilingual, so a translated clue ("chatte" for cat) can't be told apart
// from a related word by similarity alone; translating first lets the same rule catch it.
async function translateToEnglish(clue) {
  const prompt = [
    "Translate this text into plain English, word for word.",
    "Words may come from any language (French, Spanish, Japanese, etc.) even when they look like English.",
    "If it is already English, return it unchanged. Expand transliterations from other scripts into English (neko -> cat).",
    `Text: "${clue}". Respond with only the English text, lowercase.`,
  ].join(" ");
  const prediction = await runModel({ model: GUESSER_MODEL, input: { prompt, temperature: 0 } });
  const text = Array.isArray(prediction.output) ? prediction.output.join("") : String(prediction.output ?? "");
  return text.trim().toLowerCase().replace(/^["']|["'.]$/g, "");
}

async function getGuesses(clues, resolution) {
  const count = guessCount(resolution);
  const prompt = [
    "You are the guesser in a game of charades played with words.",
    "The other player is describing a single secret word without saying it.",
    `Their clues so far, in order: ${clues.map((clue) => `"${clue}"`).join(", ")}.`,
    `Give ${count} different single-word guesses for the secret word, most likely first.`,
    "Respond with only a JSON array of lowercase words.",
  ].join(" ");
  const prediction = await runModel({ model: GUESSER_MODEL, input: { prompt, temperature: guessTemperature(resolution) } });
  const text = Array.isArray(prediction.output) ? prediction.output.join("") : String(prediction.output ?? "");
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("The guesser's answer couldn't be read. Try again.");

  const clueWords = new Set(clues.flatMap((clue) => clue.split(/[^a-z]+/)));
  const words = JSON.parse(match[0])
    .map((word) => String(word).toLowerCase().trim())
    .filter((word) => /^[a-z][a-z-]*$/.test(word) && !clueWords.has(word));
  return [...new Set(words)].slice(0, count);
}

async function getEmbeddings(texts) {
  const prediction = await runModel({ version: EMBEDDING_MODEL, input: { texts: JSON.stringify(texts) } });
  if (!Array.isArray(prediction.output) || prediction.output.length !== texts.length) {
    throw new Error("The embedding model returned an unexpected result. Try again.");
  }
  return prediction.output;
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

function layoutGuesses(resolution) {
  // The secret word itself is shown by the center marker, so it never gets its own label.
  const guesses = [...game.guesses].filter(([word]) => !sameWord(word, game.target));
  if (guesses.length === 0) return;
  const similarities = guesses.map(([, guess]) => guess.similarity);
  const min = Math.min(...similarities);
  const max = Math.max(...similarities);
  const spread = 0.45 + resolution * 0.055;
  const maxRadius = Math.min(board.clientWidth, board.clientHeight) * 0.46;
  const placed = [labelBox(0, 0, targetMarker)];

  for (const [word, guess] of guesses) {
    const closeness = max === min ? 0.5 : (guess.similarity - min) / (max - min);
    let element = board.querySelector(`.guess[data-word="${CSS.escape(word)}"]`);
    if (!element) {
      element = document.createElement("span");
      element.className = "guess";
      element.dataset.word = word;
      element.textContent = word;
      element.dataset.clue = String(guess.clueIndex % 4);
      element.style.fontSize = `${0.8 + closeness * 0.7}rem`;
      guess.jitter = (Math.random() - 0.5) * 0.12 * resolution / 10;
      board.append(element);
    }
    const radius = maxRadius * (0.24 + (1 - closeness + guess.jitter) * 0.76 * spread);
    guess.angle ??= findOpenAngle(radius, element, placed);
    const box = labelBox(guess.angle, radius, element);
    placed.push(box);
    element.style.transform = `translate(calc(-50% + ${box.x}px), calc(-50% + ${box.y}px))`;
    element.style.fontSize = `${0.8 + closeness * 0.7}rem`;
    element.title = `similarity ${guess.similarity.toFixed(3)}`;
  }
}

function labelBox(angle, radius, element) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.82,
    width: element.offsetWidth + 16,
    height: element.offsetHeight + 8,
  };
}

// Tries random directions and keeps the one whose label overlaps the fewest existing labels.
function findOpenAngle(radius, element, placed) {
  let bestAngle = 0;
  let bestOverlap = Infinity;
  for (let attempt = 0; attempt < 36 && bestOverlap > 0; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const box = labelBox(angle, radius, element);
    const overlap = placed.reduce((total, other) => total + overlapArea(box, other), 0);
    if (overlap < bestOverlap) {
      bestAngle = angle;
      bestOverlap = overlap;
    }
  }
  return bestAngle;
}

function overlapArea(a, b) {
  const width = Math.min(a.x + a.width / 2, b.x + b.width / 2) - Math.max(a.x - a.width / 2, b.x - b.width / 2);
  const height = Math.min(a.y + a.height / 2, b.y + b.height / 2) - Math.max(a.y - a.height / 2, b.y - b.height / 2);
  return Math.max(0, width) * Math.max(0, height);
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function sameWord(a, b) {
  const normalize = (word) => word.toLowerCase().replace(/[^a-z]/g, "").replace(/(es|s)$/, "");
  return normalize(a) === normalize(b);
}

function guessCount(resolution) {
  return 3 + resolution * 2;
}

function guessTemperature(resolution) {
  return Math.round((0.2 + resolution * 0.12) * 100) / 100;
}

function updateResolutionNote() {
  const resolution = Number(resolutionInput.value);
  resolutionValue.textContent = String(resolution);
  resolutionNote.textContent = `${guessCount(resolution)} guesses · temperature ${guessTemperature(resolution)}`;
}

function addClueToTrail(clue) {
  const item = document.createElement("li");
  item.textContent = clue;
  item.dataset.clue = String((game.clues.length - 1) % 4);
  clueTrail.append(item);
}

function setBusy(isBusy) {
  game.busy = isBusy;
  const disabled = isBusy || !game.active;
  clueInput.disabled = disabled;
  clueButton.disabled = disabled;
  skipButton.disabled = disabled;
  board.classList.toggle("thinking", isBusy);
  if (!disabled) clueInput.focus();
}

function setStatus(message, kind = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.kind = kind;
}

function renderTimer() {
  timerEl.textContent = `:${String(Math.max(0, game.timeLeft)).padStart(2, "0")}`;
  timerEl.classList.toggle("low", game.timeLeft <= 10);
}

function savePlayer(playing) {
  return playersCollection.doc(currentUser.uid).set({
    name: game.playerName,
    score: game.score,
    bestScore: Math.max(game.bestScore, game.score),
    playing,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).catch((error) => console.warn("Couldn't save player", error));
}

function recordRound(solved, points) {
  return roundsCollection.add({
    uid: currentUser.uid,
    playerName: game.playerName,
    target: game.target,
    clues: game.clues.slice(0, MAX_CLUES),
    solved,
    points,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).catch((error) => console.warn("Couldn't record round", error));
}

function listenToLeaderboard() {
  playersCollection.orderBy("bestScore", "desc").limit(12).onSnapshot((snapshot) => {
    if (snapshot.empty) {
      leaderboard.replaceChildren(mutedItem("No players yet."));
      return;
    }
    assignNameColors(snapshot.docs);
    renderRoundFeed();
    leaderboard.replaceChildren(...snapshot.docs.map((doc) => {
      const player = doc.data();
      const item = document.createElement("li");
      const name = nameLabel(player.name, doc.id);
      const live = player.playing && Date.now() - (player.updatedAt?.toMillis() ?? 0) < LIVE_WINDOW_MS;
      if (live) name.classList.add("live");
      if (doc.id === currentUser?.uid) name.classList.add("you");
      const score = document.createElement("span");
      score.className = "muted";
      score.textContent = live ? `${player.score} now · best ${player.bestScore}` : `best ${player.bestScore}`;
      item.append(name, score);
      return item;
    }));
  }, (error) => leaderboard.replaceChildren(mutedItem(`Couldn't load players: ${error.message}`)));
}

function listenToRoundFeed() {
  roundsCollection.orderBy("createdAt", "desc").limit(10).onSnapshot((snapshot) => {
    latestRounds = snapshot.docs.map((doc) => doc.data());
    renderRoundFeed();
  }, (error) => roundFeed.replaceChildren(mutedItem(`Couldn't load rounds: ${error.message}`)));
}

function renderRoundFeed() {
  if (latestRounds.length === 0) {
    roundFeed.replaceChildren(mutedItem("No rounds yet."));
    return;
  }
  roundFeed.replaceChildren(...latestRounds.map((round) => {
    const item = document.createElement("li");
    const headline = document.createElement("strong");
    headline.append(
      nameLabel(round.playerName, round.uid),
      round.solved ? ` got “${round.target}” (+${round.points})` : ` missed “${round.target}”`,
    );
    const clues = document.createElement("span");
    clues.className = "muted";
    clues.textContent = round.clues.length ? round.clues.join(" → ") : "no clues";
    item.append(headline, clues);
    if (round.solved) item.classList.add("solved");
    return item;
  }));
}

function assignNameColors(playerDocs) {
  const byName = new Map();
  for (const doc of playerDocs) {
    const key = doc.data().name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), doc.id]);
  }
  nameColors.clear();
  for (const uids of byName.values()) {
    if (uids.length < 2) continue;
    [...uids].sort().forEach((uid, index) => nameColors.set(uid, index % 4));
  }
}

function nameLabel(name, uid) {
  const label = document.createElement("span");
  label.textContent = name;
  if (nameColors.has(uid)) {
    label.classList.add("shared-name");
    label.dataset.clue = String(nameColors.get(uid));
  }
  return label;
}

// Must match firestore.rules, which checks the name against the Google account's first name.
function firstName(user) {
  return (user.displayName ?? "").split(" ")[0] || "Player";
}

function mutedItem(text) {
  const item = document.createElement("li");
  item.className = "muted";
  item.textContent = text;
  return item;
}



function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
