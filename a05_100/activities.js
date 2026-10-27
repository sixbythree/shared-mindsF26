// Activities: doing something together with your 100, not just showing each other what you did.
// Every activity is a room: what you're doing, who's there, where everyone is in it, and a chat.
//   Watching: YouTube and video links play in sync; anything else (Netflix, a film at home)
//             gets a shared clock, and everyone plays it on their own screen.
//   Reading:  a set of articles. Everyone opens their own copy (paywalls stay paywalls), and the room
//             shows who's on which article, who's finished, and notes left on each one.
//   Studying: a shared focus timer and what everyone's working on. The chat opens on breaks.
// Spending 5 minutes in a room with someone in your 100 counts as a shared day.

import { ACTIVITIES_COUNT_AS_TALKING, CALL_SECONDS } from "./rules.js";
import { button, el } from "./dom.js";

const $ = (selector) => document.querySelector(selector);
// Followers jump to the host's position when they drift further than this.
const DRIFT_SECONDS = 2;
const HEARTBEAT_MS = 30_000;
const MAX_ARTICLES = 10;

export const TYPES = {
  watching: { verb: "watching", start: "Watch", title: "What are you watching?", placeholder: "Severance, season 2" },
  reading: { verb: "reading", start: "Read", title: "What are you reading?", placeholder: "This week's long reads" },
  studying: { verb: "studying", start: "Study", title: "What's the study session?", placeholder: "Thesis week" },
};

// Where people watch. Picking one opens it in a new tab and tells your 100 you're on it.
// A website can't see what's playing in another app, so the title is filled in afterwards:
// by the host for now, and automatically once a browser extension reads it from the streaming site.
export const SERVICES = [
  { id: "netflix", name: "Netflix", url: "https://www.netflix.com", color: "#E50914" },
  { id: "youtube", name: "YouTube", url: "https://www.youtube.com", color: "#FF0000" },
  { id: "prime", name: "Prime Video", url: "https://www.primevideo.com", color: "#00A8E1" },
  { id: "disney", name: "Disney+", url: "https://www.disneyplus.com", color: "#113CCF" },
  { id: "max", name: "Max", url: "https://www.max.com", color: "#002BE7" },
  { id: "hulu", name: "Hulu", url: "https://www.hulu.com", color: "#1CE783", ink: "#1c1917" },
  { id: "appletv", name: "Apple TV+", url: "https://tv.apple.com", color: "#1c1917" },
  { id: "peacock", name: "Peacock", url: "https://www.peacocktv.com", color: "#1c1917" },
  { id: "paramount", name: "Paramount+", url: "https://www.paramountplus.com", color: "#0064FF" },
  { id: "crunchyroll", name: "Crunchyroll", url: "https://www.crunchyroll.com", color: "#F47521" },
  { id: "other", name: "Something else", url: "", color: "#78716c" },
];

export function serviceOf(room) {
  return SERVICES.find((service) => service.id === room.service) ?? null;
}

// The line that describes a room to your 100, e.g. "Severance on Apple TV+" or "Picking something on Netflix".
export function roomSummary(room) {
  const service = serviceOf(room);
  const on = service && service.id !== "other" ? ` on ${service.name}` : "";
  if (room.type === "watching" && !room.title) return `Picking something${on || " to watch"}`;
  return `${room.title}${room.type === "watching" ? on : ""}`;
}

const ICONS = {
  watching: '<circle cx="10" cy="9.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10.8" cy="8.8" r="2.6" fill="currentColor"/><path d="M5.5 4.5 4.8 2 M9 3.6V1 M13 4 14.4 1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  reading: '<path d="M2.5 3.5h5a2.5 2.5 0 0 1 2.5 2.5v8a2 2 0 0 0-2-2H2.5Z M17.5 3.5h-5A2.5 2.5 0 0 0 10 6v8a2 2 0 0 1 2-2h5.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  studying: '<circle cx="10" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 5.5V9l2.5 1.5 M8 1.5h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
};

export function activityIcon(type) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 16");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("activity-icon");
  svg.innerHTML = ICONS[type] ?? ICONS.watching;
  return svg;
}

function youtubeId(url) {
  return url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/)?.[1] ?? "";
}

function isVideoFile(url) {
  return /^https:\/\/.+\.(mp4|webm|mov)(\?|$)/i.test(url);
}

// Watching rooms either play in sync or share a clock; other activities have their own screens.
function stageKind(room) {
  if (room.type !== "watching") return room.type;
  if (youtubeId(room.url ?? "")) return "youtube";
  if (isVideoFile(room.url ?? "")) return "video";
  return "together";
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

function parseClock(text) {
  const parts = text.trim().split(":").map(Number);
  if (parts.length === 0 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

// Where the host is now: their last position plus however long it's been playing since.
function expectedTime(playback) {
  return playback.position + (playback.playing ? (Date.now() - playback.updatedAt) / 1000 : 0);
}

function timerLeft(timer) {
  return timer.running ? Math.max(0, (timer.endsAt - Date.now()) / 1000) : timer.remaining;
}

// A reading list is one link per line, optionally "Title | link". Without a title, one is made from the link.
function parseReadingList(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, MAX_ARTICLES).map((line) => {
    const [first, second] = line.includes("|") ? line.split("|").map((part) => part.trim()) : ["", line];
    const url = second;
    if (!/^https:\/\//.test(url)) return null;
    if (first) return { title: first.slice(0, 120), url };
    const { hostname, pathname } = new URL(url);
    const slug = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "").replace(/\.\w+$/, "").replace(/[-_]+/g, " ").trim();
    const title = slug ? slug[0].toUpperCase() + slug.slice(1) : hostname.replace(/^www\./, "");
    return { title: title.slice(0, 120), url };
  });
}

// Players for watching

let youtubeReady = null;

function loadYouTube() {
  youtubeReady ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.append(script);
  });
  return youtubeReady;
}

async function youtubePlayer(stage, videoId) {
  await loadYouTube();
  const holder = el("div");
  stage.append(holder);
  let ready = false;
  const player = new YT.Player(holder, {
    videoId,
    width: "100%",
    height: "100%",
    playerVars: { playsinline: 1, rel: 0 },
    events: { onReady: () => { ready = true; } },
  });
  return {
    ready: () => ready,
    time: () => player.getCurrentTime?.() ?? 0,
    // Buffering counts as playing, so a follower doesn't fight the host while loading.
    playing: () => [YT.PlayerState.PLAYING, YT.PlayerState.BUFFERING].includes(player.getPlayerState?.()),
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    seek: (seconds) => player.seekTo(seconds, true),
    destroy: () => player.destroy?.(),
  };
}

function filePlayer(stage, url) {
  const video = el("video", "watch-video");
  video.src = url;
  video.controls = true;
  video.playsInline = true;
  stage.append(video);
  return {
    ready: () => video.readyState >= 1,
    time: () => video.currentTime,
    playing: () => !video.paused,
    play: () => video.play().catch(() => {}),
    pause: () => video.pause(),
    seek: (seconds) => { video.currentTime = seconds; },
    destroy: () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    },
  };
}

export function createActivities({ getStore, activeConnections, showView, onChange }) {
  const strip = $("#activities-now");
  const view = $("#activity-view");
  const titleEl = $("#activity-title");
  const hostEl = $("#activity-host");
  const leaveButton = $("#activity-leave");
  const stage = $("#activity-stage");
  const peopleEl = $("#activity-people");
  const noteEl = $("#activity-note");
  const chatList = $("#activity-chat");
  const chatForm = $("#activity-chat-form");
  const chatInput = $("#activity-chat-input");
  const chatButton = chatForm.querySelector("button");
  const startDialog = $("#activity-start");
  const startForm = $("#activity-start-form");
  const startHeading = $("#activity-start-heading");
  const startTitle = $("#activity-start-title");
  const startTitleLabel = $("#activity-start-title-label");
  const startUrlGroup = $("#activity-start-url-group");
  const serviceGrid = $("#activity-start-services");
  const startUrl = $("#activity-start-url");
  const startList = $("#activity-start-list");
  const startFocus = $("#activity-start-focus");
  const startBreak = $("#activity-start-break");
  const startStatus = $("#activity-start-status");

  let rooms = [];
  let currentId = null;
  // True while waiting for a room you just started to arrive.
  let entering = false;
  let kind = null;
  let player = null;
  let clock = null;
  let focus = null;
  let notes = [];
  let unsubscribers = [];
  let timers = [];
  // The host's last published playback or timer, so a change is only sent once.
  let published = null;
  // Seconds spent in a room with each person today (in the store's time), and who's already counted.
  const together = new Map();
  const counted = new Set();

  const store = () => getStore();
  const isMe = (uid) => uid === store().me.uid;
  const currentRoom = () => rooms.find((room) => room.id === currentId);
  const myPlace = (room) => room.viewers.find((viewer) => isMe(viewer.uid)) ?? { at: 0, done: [], task: "" };

  // Everyone in the room, host first.
  function participants(room) {
    const host = room.viewers.find((viewer) => viewer.uid === room.host) ?? { uid: room.host, name: room.hostName, at: 0, done: [], task: "" };
    return [{ ...host, host: true }, ...room.viewers.filter((viewer) => viewer.uid !== room.host)];
  }

  // Rooms you can see: your own, the ones you're in, and the ones hosted by people in your 100.
  function visibleRooms() {
    const connected = activeConnections();
    return rooms.filter((room) => isMe(room.host) || connected.has(room.host) || room.viewers.some((viewer) => isMe(viewer.uid)));
  }

  // Who's doing what right now (uid → activity type), for the badges on the grid.
  function activeTypes() {
    const types = new Map();
    for (const room of visibleRooms()) {
      for (const person of participants(room)) types.set(person.uid, room.type);
    }
    return types;
  }

  function setRooms(list) {
    rooms = list;
    // The room you were in ended: back to the feed.
    if (currentId && !entering && !currentRoom()) {
      teardown();
      showView("feed");
      onChange();
    }
    renderStrip();
    renderRoom();
  }

  // The "Happening now" strip at the top of the feed.

  function renderStrip() {
    if (!getStore()) return;
    const list = visibleRooms();
    const hosting = list.some((room) => isMe(room.host));
    const head = el("div", "activities-head");
    head.append(el("h2", "eyebrow", "Happening now"));
    if (!hosting) {
      const starts = el("div", "activity-starts");
      for (const [type, info] of Object.entries(TYPES)) {
        const start = button("", () => openStartDialog(type), "small secondary");
        start.append(activityIcon(type), el("span", "", info.start));
        starts.append(start);
      }
      head.append(starts);
    }
    const cards = list.map((room) => {
      const card = el("div", `activity-card${room.id === currentId ? " current" : ""}`);
      const who = el("p", "activity-card-who");
      const verb = TYPES[room.type]?.verb ?? "doing";
      who.append(activityIcon(room.type), el("span", "", isMe(room.host) ? `You're ${verb}` : `${room.hostName} is ${verb}`));
      const count = participants(room).length;
      const detail = {
        youtube: "in sync",
        video: "in sync",
        together: room.title ? "shared clock" : "choosing",
        reading: `${room.items.length} article${room.items.length === 1 ? "" : "s"}`,
        studying: room.timer ? (room.timer.phase === "focus" ? "focusing" : "on a break") : "",
      }[stageKind(room)];
      card.append(
        who,
        el("strong", "activity-card-title", roomSummary(room)),
        el("span", "muted activity-card-count", `${count} here · ${detail}`),
        button(room.id === currentId || isMe(room.host) ? "Open" : "Join", () => enter(room.id), "small"),
      );
      return card;
    });
    if (cards.length === 0) cards.push(el("p", "muted activity-empty", "Nobody in your 100 is doing anything together right now. Start something."));
    const row = el("div", "activity-cards");
    row.append(...cards);
    strip.replaceChildren(head, row);
  }

  // Starting a room

  function openStartDialog(type) {
    startForm.reset();
    startForm.elements["activity-type"].value = type;
    startStatus.textContent = "";
    startForm.elements["activity-service"].value = "netflix";
    showStartFields();
    startDialog.hidden = false;
    startTitle.focus();
  }

  function showStartFields() {
    const type = startForm.elements["activity-type"].value;
    const service = startForm.elements["activity-service"].value;
    startHeading.textContent = TYPES[type].title;
    startTitle.placeholder = TYPES[type].placeholder;
    // Watching starts from the app; the title is optional and can come later.
    startTitleLabel.textContent = type === "watching" ? "What are you putting on? (optional)" : "Title";
    for (const group of startForm.querySelectorAll("[data-for]")) group.hidden = group.dataset.for !== type;
    startUrlGroup.hidden = type !== "watching" || !["youtube", "other"].includes(service);
  }

  startForm.addEventListener("change", (event) => {
    if (event.target.name === "activity-type" || event.target.name === "activity-service") showStartFields();
  });

  $("#activity-start-cancel").addEventListener("click", () => {
    startDialog.hidden = true;
  });

  startForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const type = startForm.elements["activity-type"].value;
    const title = startTitle.value.trim();
    if (!title && type !== "watching") {
      startStatus.textContent = "Give it a title.";
      return;
    }
    const fields = { type, title };
    let tab = null;
    if (type === "watching") {
      const service = SERVICES.find((item) => item.id === startForm.elements["activity-service"].value) ?? SERVICES.at(-1);
      fields.service = service.id;
      fields.url = startUrlGroup.hidden ? "" : startUrl.value.trim();
      if (fields.url && !/^https:\/\//.test(fields.url)) {
        startStatus.textContent = "Links need to start with https://";
        return;
      }
      if (!title && service.id === "other") {
        startStatus.textContent = "Say what you're watching.";
        return;
      }
      // Open the app right away (before anything async), so the browser allows the new tab.
      if (service.url && !fields.url) tab = window.open(service.url, "_blank");
    }
    if (type === "reading") {
      const items = parseReadingList(startList.value);
      if (items.length === 0 || items.includes(null)) {
        startStatus.textContent = "Add at least one link, one per line, each starting with https://";
        return;
      }
      fields.items = items;
    }
    if (type === "studying") {
      const focusMinutes = Math.min(120, Math.max(1, Number(startFocus.value) || 25));
      const breakMinutes = Math.min(60, Math.max(1, Number(startBreak.value) || 5));
      fields.timer = { phase: "focus", running: false, endsAt: 0, remaining: focusMinutes * 60, focus: focusMinutes * 60, break: breakMinutes * 60, round: 1 };
    }
    try {
      const id = await store().startRoom(fields);
      startDialog.hidden = true;
      enter(id);
    } catch (error) {
      tab?.close();
      startStatus.textContent = `Couldn't start: ${error.message}`;
    }
  });

  // Entering and leaving a room

  async function enter(id) {
    if (currentId === id) {
      showView("activity");
      renderRoom();
      return;
    }
    if (currentId) await leave();
    const room = rooms.find((item) => item.id === id) ?? { id };
    currentId = id;
    showView("activity");
    if (room.host && !room.viewers.some((viewer) => isMe(viewer.uid))) await store().joinRoom(room).catch((error) => console.error(error));
    published = null;
    notes = [];
    stage.replaceChildren();
    chatList.replaceChildren();
    unsubscribers = [store().watchRoomChat(room, renderChat)];
    timers = [
      setInterval(tick, 1000),
      setInterval(() => {
        const current = currentRoom();
        if (current) store().heartbeat(current).catch(() => {});
      }, HEARTBEAT_MS),
    ];
    // A room you just started arrives through the rooms listener a moment later.
    entering = true;
    await new Promise((resolve) => {
      const wait = () => (currentRoom() || currentId !== id ? resolve() : setTimeout(wait, 100));
      wait();
    });
    entering = false;
    const current = currentRoom();
    if (currentId === id && current) {
      if (current.type === "reading") unsubscribers.push(store().watchRoomNotes(current, (list) => { notes = list; renderRoom(); }));
      await buildStage(current);
    }
    renderStrip();
    renderRoom();
  }

  function teardown() {
    timers.forEach(clearInterval);
    timers = [];
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    unsubscribers = [];
    player?.destroy();
    player = null;
    clock = null;
    focus = null;
    kind = null;
    currentId = null;
    stage.replaceChildren();
    stage.classList.remove("on-break");
    setChatOpen(true);
  }

  async function leave() {
    const room = currentRoom();
    teardown();
    if (!room) return;
    if (isMe(room.host)) await store().endRoom(room).catch(() => {});
    else await store().leaveRoom(room).catch(() => {});
  }

  leaveButton.addEventListener("click", async () => {
    await leave();
    showView("feed");
    onChange();
  });

  async function buildStage(room) {
    kind = stageKind(room);
    stage.dataset.kind = kind;
    if (kind === "youtube") player = await youtubePlayer(stage, youtubeId(room.url));
    else if (kind === "video") player = filePlayer(stage, room.url);
    else if (kind === "together") buildClock(room);
    else if (kind === "studying") buildFocus(room);
    // Reading redraws from the room on every update (see renderReading).
  }

  // Watching without a player: a shared clock the host runs.
  function buildClock(room) {
    const service = serviceOf(room);
    // Until a title is known, the host is asked what they put on.
    const pick = el("form", "pick-form");
    if (isMe(room.host)) {
      const input = el("input");
      input.maxLength = 80;
      input.placeholder = `What did you put on${service && service.id !== "other" ? ` ${service.name}` : ""}?`;
      input.setAttribute("aria-label", "What did you put on?");
      pick.append(input, el("button", "small", "Share"));
      pick.addEventListener("submit", (event) => {
        event.preventDefault();
        const title = input.value.trim();
        if (title) store().updateRoom(currentRoom(), { title }).catch((error) => console.error(error));
      });
    } else {
      pick.append(el("p", "clock-state", `${room.hostName} is choosing something…`));
    }
    stage.append(pick);
    const face = el("div", "clock-face");
    const time = el("p", "clock-time", "0:00");
    const state = el("p", "clock-state");
    face.append(time, state);
    const controls = el("div", "clock-controls");
    let toggle = null;
    if (isMe(room.host)) {
      toggle = button("Play", () => {
        const playback = currentRoom().playback;
        publishPlayback({ playing: !playback.playing, position: expectedTime(playback), updatedAt: Date.now() });
      }, "small");
      const setForm = el("form", "clock-set");
      const setInput = el("input");
      setInput.placeholder = "Jump to 12:30";
      setInput.setAttribute("aria-label", "Jump to a time");
      setForm.append(setInput, el("button", "small secondary", "Set"));
      setForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const seconds = parseClock(setInput.value);
        if (seconds === null) return;
        publishPlayback({ playing: currentRoom().playback.playing, position: seconds, updatedAt: Date.now() });
        setInput.value = "";
      });
      controls.append(button("−10s", () => nudge(-10), "small secondary"), toggle, button("+10s", () => nudge(10), "small secondary"), setForm);
    }
    if (service?.url) {
      const open = el("a", "open-service", `Open ${service.name} ↗`);
      open.href = service.url;
      open.target = "_blank";
      open.rel = "noopener";
      controls.append(open);
    }
    clock = { time, state, toggle, pick };
    stage.append(face, controls);
  }

  function nudge(seconds) {
    const playback = currentRoom().playback;
    publishPlayback({ playing: playback.playing, position: Math.max(0, expectedTime(playback) + seconds), updatedAt: Date.now() });
  }

  function publishPlayback(playback) {
    const room = currentRoom();
    if (!room) return;
    published = playback;
    store().updateRoom(room, { playback }).catch((error) => console.error(error));
  }

  // Studying: a shared focus timer the host runs, and what everyone's working on.
  function buildFocus(room) {
    const face = el("div", "clock-face");
    const phase = el("p", "eyebrow clock-phase");
    const time = el("p", "clock-time", "0:00");
    const state = el("p", "clock-state");
    face.append(phase, time, state);
    const controls = el("div", "clock-controls");
    let toggle = null;
    if (isMe(room.host)) {
      toggle = button("Start", () => {
        const timer = currentRoom().timer;
        const left = timerLeft(timer);
        publishTimer(timer.running
          ? { ...timer, running: false, remaining: left }
          : { ...timer, running: true, endsAt: Date.now() + left * 1000 });
      }, "small");
      controls.append(toggle, button("Skip", () => publishTimer(nextPhase(currentRoom().timer)), "small secondary"));
    }
    const taskForm = el("form", "task-form");
    const taskInput = el("input");
    taskInput.maxLength = 80;
    taskInput.placeholder = "What are you working on?";
    taskInput.setAttribute("aria-label", "What are you working on?");
    taskInput.value = myPlace(room).task;
    taskForm.append(taskInput, el("button", "small", "Set"));
    taskForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const current = currentRoom();
      if (current) store().updateMe(current, { task: taskInput.value.trim() }).catch((error) => console.error(error));
      taskInput.blur();
    });
    focus = { phase, time, state, toggle };
    stage.append(face, controls, taskForm);
  }

  function nextPhase(timer) {
    const next = timer.phase === "focus" ? "break" : "focus";
    return { ...timer, phase: next, running: true, endsAt: Date.now() + timer[next] * 1000, remaining: timer[next], round: timer.round + (next === "focus" ? 1 : 0) };
  }

  function publishTimer(timer) {
    const room = currentRoom();
    if (!room) return;
    published = timer;
    store().updateRoom(room, { timer }).catch((error) => console.error(error));
  }

  // Every second: the host shares play, pause, seeks and timer changes; everyone else follows; time together adds up.
  function tick() {
    const room = currentRoom();
    if (!room) return;
    const hosting = isMe(room.host);

    if (player?.ready() && room.playback) {
      const expected = expectedTime(room.playback);
      if (hosting) {
        const reference = published ?? room.playback;
        const playing = player.playing();
        if (playing !== reference.playing || Math.abs(player.time() - expectedTime(reference)) > DRIFT_SECONDS) {
          publishPlayback({ playing, position: player.time(), updatedAt: Date.now() });
        }
      } else {
        if (Math.abs(player.time() - expected) > DRIFT_SECONDS) player.seek(expected);
        if (room.playback.playing && !player.playing()) player.play();
        if (!room.playback.playing && player.playing()) player.pause();
      }
    }

    if (clock) {
      clock.time.textContent = formatClock(expectedTime(room.playback));
      clock.state.textContent = room.playback.playing
        ? hosting ? "Playing. Everyone follows your time." : `Playing. Start yours${serviceOf(room)?.url ? ` on ${serviceOf(room).name}` : ""} at this time to watch with ${room.hostName}.`
        : "Paused";
      if (clock.toggle) clock.toggle.textContent = room.playback.playing ? "Pause" : "Play";
    }

    if (focus && room.timer) {
      const timer = published && hosting ? published : room.timer;
      if (hosting && timer.running && Date.now() >= timer.endsAt) publishTimer(nextPhase(timer));
      const onBreak = timer.phase === "break";
      focus.phase.textContent = onBreak ? `Break · round ${timer.round}` : `Focus · round ${timer.round}`;
      focus.time.textContent = formatClock(timerLeft(timer));
      focus.state.textContent = !timer.running
        ? hosting ? "Paused. Start when everyone's ready." : `Waiting for ${room.hostName} to start.`
        : onBreak ? "Break. The chat is open." : "Heads down. The chat opens on the break.";
      if (focus.toggle) focus.toggle.textContent = timer.running ? "Pause" : "Start";
      stage.classList.toggle("on-break", onBreak);
      setChatOpen(onBreak || !timer.running);
    }

    countTogether(room);
  }

  function setChatOpen(open) {
    chatInput.disabled = !open;
    chatButton.disabled = !open;
    chatInput.placeholder = open ? "Say something" : "The chat opens on the break";
  }

  function countTogether(room) {
    if (!ACTIVITIES_COUNT_AS_TALKING) return;
    const day = store().today();
    const connected = activeConnections();
    let changed = false;
    for (const person of participants(room)) {
      const conn = connected.get(person.uid);
      const key = `${day}:${person.uid}`;
      if (isMe(person.uid) || !conn || counted.has(key)) continue;
      if ((conn.togetherDays?.[day] ?? []).includes(store().me.uid)) {
        counted.add(key);
        changed = true;
        continue;
      }
      const seconds = (together.get(key) ?? 0) + store().timeSpeed;
      together.set(key, seconds);
      if (seconds >= CALL_SECONDS) {
        counted.add(key);
        changed = true;
        store().markTogether(person.uid).catch((error) => console.error(error));
      }
    }
    if (changed) renderRoom();
  }

  // The room screen

  function renderRoom() {
    const room = currentRoom();
    if (!room || view.hidden) return;
    const hosting = isMe(room.host);
    const verb = TYPES[room.type]?.verb ?? "doing";
    titleEl.textContent = roomSummary(room);
    if (clock) clock.pick.hidden = Boolean(room.title);
    hostEl.replaceChildren(activityIcon(room.type), document.createTextNode(hosting ? `You're hosting · ${verb}` : `${room.hostName} is hosting · ${verb}`));
    leaveButton.textContent = hosting ? "End" : "Leave";

    peopleEl.replaceChildren(...participants(room).map((person) => {
      const chip = el("li", "activity-person");
      chip.append(el("strong", "", isMe(person.uid) ? "You" : person.name));
      if (person.host) chip.append(el("span", "muted", " · host"));
      if (room.type === "studying" && person.task) chip.append(el("span", "muted", ` · ${person.task}`));
      if (room.type === "reading") {
        const finished = person.done.length >= room.items.length;
        chip.append(el("span", "muted", finished ? " · finished" : ` · on ${person.at + 1} of ${room.items.length}`));
      }
      return chip;
    }));

    if (room.type === "reading" && kind === "reading") renderReading(room);

    const day = store().today();
    const countedNames = participants(room).filter((person) => counted.has(`${day}:${person.uid}`)).map((person) => person.name);
    let note = {
      youtube: hosting ? "You're in control. Play, pause and skip for everyone." : `Following ${room.hostName}. Press play if it doesn't start.`,
      video: hosting ? "You're in control. Play, pause and skip for everyone." : `Following ${room.hostName}. Press play if it doesn't start.`,
      together: "This plays on everyone's own screen. Follow the shared clock.",
      reading: "Open each article in your own browser, then mark where you are. Notes are shared with the room.",
      studying: "Set what you're working on so everyone can see it.",
    }[kind] ?? "";
    if (ACTIVITIES_COUNT_AS_TALKING) {
      note += countedNames.length
        ? ` Today counts with ${countedNames.join(", ")}.`
        : " Spending 5 minutes here with someone in your 100 counts as a shared day.";
    }
    noteEl.textContent = note;
  }

  // Reading: the articles, who's on each one, and the notes left on it.
  function renderReading(room) {
    const me = myPlace(room);
    const people = participants(room);
    const list = el("ol", "articles");
    room.items.forEach((item, index) => {
      const here = me.at === index;
      const row = el("li", `article${here ? " here" : ""}${me.done.includes(index) ? " done" : ""}`);
      const head = el("div", "article-head");
      const link = el("a", "article-title", item.title);
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.append(document.createTextNode(" ↗"));
      link.addEventListener("click", () => {
        if (!here) store().updateMe(room, { at: index }).catch(() => {});
      });
      head.append(el("span", "article-number", String(index + 1)), link);
      const readers = people.filter((person) => person.at === index && !person.done.includes(index)).map((person) => (isMe(person.uid) ? "You" : person.name));
      const finished = people.filter((person) => person.done.includes(index)).map((person) => (isMe(person.uid) ? "You" : person.name));
      const status = el("p", "article-status muted");
      status.textContent = [readers.length ? `Reading: ${readers.join(", ")}` : "", finished.length ? `Finished: ${finished.join(", ")}` : ""].filter(Boolean).join(" · ") || "Nobody's here yet";
      const actions = el("div", "article-actions");
      if (!here) actions.append(button("I'm here", () => store().updateMe(room, { at: index }), "small secondary"));
      const isDone = me.done.includes(index);
      actions.append(button(isDone ? "Finished ✓" : "Mark finished", () => {
        const done = isDone ? me.done.filter((value) => value !== index) : [...me.done, index];
        const next = !isDone && index + 1 < room.items.length ? index + 1 : me.at;
        store().updateMe(room, { done, at: next });
      }, `small${isDone ? "" : " secondary"}`));
      row.append(head, status, actions);

      const articleNotes = notes.filter((note) => note.item === index);
      if (here || articleNotes.length) {
        const noteList = el("ul", "article-notes");
        for (const note of articleNotes) {
          const item = el("li", "article-note");
          if (note.quote) item.append(el("blockquote", "", note.quote));
          const line = el("p");
          line.append(el("strong", "", isMe(note.uid) ? "You" : note.name), document.createTextNode(` ${note.text}`));
          item.append(line);
          noteList.append(item);
        }
        row.append(noteList);
      }
      if (here) row.append(noteForm(room, index));
      list.append(row);
    });

    // Keep a half-written note while the list redraws.
    const active = document.activeElement;
    const field = active?.dataset?.noteField;
    const caret = field ? active.selectionStart : 0;
    stage.replaceChildren(list);
    if (field) {
      const input = stage.querySelector(`[data-note-field="${field}"]`);
      input?.focus();
      input?.setSelectionRange(caret, caret);
    }
  }

  const noteDrafts = { quote: "", text: "" };

  function noteForm(room, index) {
    const form = el("form", "note-form");
    const quote = el("textarea");
    quote.rows = 2;
    quote.maxLength = 500;
    quote.placeholder = "Paste a passage (optional)";
    quote.setAttribute("aria-label", "Passage");
    quote.dataset.noteField = "quote";
    quote.value = noteDrafts.quote;
    quote.addEventListener("input", () => { noteDrafts.quote = quote.value; });
    const row = el("div", "note-row");
    const text = el("input");
    text.maxLength = 500;
    text.placeholder = "Leave a note on this one";
    text.setAttribute("aria-label", "Note");
    text.dataset.noteField = "text";
    text.value = noteDrafts.text;
    text.addEventListener("input", () => { noteDrafts.text = text.value; });
    row.append(text, el("button", "small", "Add"));
    form.append(quote, row);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!noteDrafts.text.trim()) return;
      const note = { item: index, quote: noteDrafts.quote.trim(), text: noteDrafts.text.trim() };
      noteDrafts.quote = "";
      noteDrafts.text = "";
      await store().addRoomNote(room, note).catch((error) => console.error(error));
      renderRoom();
    });
    return form;
  }

  function renderChat(messages) {
    chatList.replaceChildren(...messages.map((message) => {
      const item = el("li", `message${isMe(message.uid) ? " mine" : ""}`);
      const bubble = el("p");
      if (!isMe(message.uid)) bubble.append(el("strong", "chat-name", message.name));
      bubble.append(document.createTextNode(message.text));
      item.append(bubble);
      return item;
    }));
    chatList.scrollTop = chatList.scrollHeight;
  }

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const room = currentRoom();
    const text = chatInput.value.trim();
    if (!room || !text || chatInput.disabled) return;
    chatInput.value = "";
    await store().sendRoomChat(room, text).catch((error) => console.error(error));
  });

  window.addEventListener("beforeunload", () => {
    const room = currentRoom();
    if (room && !isMe(room.host)) store().leaveRoom(room);
  });

  // What someone is doing right now, for their profile page.
  function activityOf(uid) {
    const room = visibleRooms().find((item) => participants(item).some((person) => person.uid === uid));
    if (!room) return null;
    return { room, verb: TYPES[room.type]?.verb ?? "doing", summary: roomSummary(room), hosting: room.host === uid, inIt: room.id === currentId, join: () => enter(room.id) };
  }

  // The streaming apps in the start dialog.
  serviceGrid.replaceChildren(...SERVICES.map((service) => {
    const label = el("label", "service");
    const input = el("input");
    input.type = "radio";
    input.name = "activity-service";
    input.value = service.id;
    const tile = el("span", "service-tile", service.name);
    tile.style.setProperty("--brand", service.color);
    tile.style.setProperty("--brand-ink", service.ink ?? "#ffffff");
    label.append(input, tile);
    return label;
  }));

  return { setRooms, renderStrip, activeTypes, activityOf, leave, isOpen: () => Boolean(currentId) };
}
