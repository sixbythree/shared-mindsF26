import { CALL_SECONDS, ENGAGED_DAYS, MAX_CONNECTIONS, PUBLIC_HEAT, describe, formatDay, heatColor, pairId } from "./rules.js";
import { createFirebaseStore, firstName } from "./store-firebase.js";
import { createDemoStore } from "./store-demo.js";
import { button, el } from "./dom.js";
import { activityIcon, createActivities } from "./activities.js";

const $ = (selector) => document.querySelector(selector);

const intro = $("#intro");
const signedOut = $("#signed-out");
const signedIn = $("#signed-in");
const signedInName = $("#signed-in-name");
const authStatus = $("#auth-status");
const topbar = $("#topbar");
const appEl = $("#app");
const countEl = $("#count");
const meName = $("#me-name");
const demoBar = $("#demo-bar");
const demoDay = $("#demo-day");
const grid = $("#grid");
const requestsSection = $("#requests-section");
const requestsList = $("#requests");
const cooledSection = $("#cooled-section");
const cooledList = $("#cooled");
const search = $("#search");
const peopleList = $("#people");
const feedView = $("#feed-view");
const feed = $("#feed");
const composer = $("#composer");
const postText = $("#post-text");
const postImage = $("#post-image");
const postVideo = $("#post-video");
const imagePreview = $("#image-preview");
const postButton = $("#post-button");
const composerStatus = $("#composer-status");
const threadView = $("#thread-view");
const threadName = $("#thread-name");
const threadTemp = $("#thread-temp");
const threadNote = $("#thread-note");
const week = $("#week");
const messagesList = $("#messages");
const messageForm = $("#message-form");
const messageInput = $("#message");
const callButton = $("#call-button");
const callOverlay = $("#call");
const callLabel = $("#call-label");
const callName = $("#call-name");
const callTime = $("#call-time");
const callNote = $("#call-note");
const callAccept = $("#call-accept");
const callEnd = $("#call-end");
const letGoButton = $("#let-go-button");
const makeRoom = $("#make-room");
const makeRoomText = $("#make-room-text");
const profileView = $("#profile-view");
const activityView = $("#activity-view");
const profileAvatar = $("#profile-avatar");
const profileName = $("#profile-name");
const profileTemp = $("#profile-temp");
const profileActions = $("#profile-actions");
const profilePosts = $("#profile-posts");
const profileActivity = $("#profile-activity");
const confirmOverlay = $("#confirm");
const confirmTitle = $("#confirm-title");
const confirmText = $("#confirm-text");
const confirmYes = $("#confirm-yes");
const confirmNo = $("#confirm-no");

const firebaseApp = firebase.initializeApp(window.firebaseConfig);
const auth = firebaseApp.auth();

let currentUser = null;
let store = null;
let unsubscribers = [];
let unsubscribeMessages = null;
let pendingImage = "";
let dayTimer = 0;

const state = {
  connections: [],
  posts: [],
  people: [],
  openId: null,
  // The person whose page is open: { uid, name }.
  profile: null,
  profilePosts: [],
  // When your 100 is full: who you're making room for, while you pick someone to let go.
  makeRoomFor: null,
  // Posts whose comments are open: post id → { comments, unsubscribe }.
  openComments: new Map(),
  commentDrafts: new Map(),
  call: null,
};

const activities = createActivities({
  getStore: () => store,
  activeConnections: () => new Map(described().filter((conn) => conn.t.state === "active").map((conn) => [conn.other.uid, conn])),
  showView,
  onChange: () => render(),
});

$("#legend-activity").prepend(activityIcon("watching"));

// Sign-in

auth.onAuthStateChanged((user) => {
  currentUser = user;
  signedOut.hidden = Boolean(user);
  signedIn.hidden = !user;
  signedInName.textContent = user ? firstName(user) : "";
});

$("#sign-in-button").addEventListener("click", async () => {
  authStatus.textContent = "";
  try {
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch (error) {
    if (error.code !== "auth/popup-closed-by-user" && error.code !== "auth/cancelled-popup-request") {
      authStatus.textContent = `Couldn't sign in: ${error.message}`;
    }
  }
});

$("#sign-out-button").addEventListener("click", () => auth.signOut());
$("#enter-button").addEventListener("click", () => start(createFirebaseStore(firebaseApp, currentUser)));
for (const button of [$("#demo-button"), $("#demo-button-2")]) {
  button.addEventListener("click", () => start(createDemoStore({ name: currentUser ? firstName(currentUser) : "You" })));
}

$("#leave-button").addEventListener("click", async () => {
  await activities.leave();
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribeMessages?.();
  state.openComments.forEach((open) => open.unsubscribe());
  state.openComments.clear();
  clearInterval(dayTimer);
  store = null;
  state.makeRoomFor = null;
  showView("feed");
  topbar.hidden = true;
  appEl.hidden = true;
  intro.hidden = false;
});

async function start(newStore) {
  store = newStore;
  Object.assign(state, { connections: [], posts: [], people: [], openId: null, profile: null, makeRoomFor: null });
  authStatus.textContent = "";
  try {
    await store.init();
  } catch (error) {
    authStatus.textContent = `Couldn't open 100: ${error.message}`;
    return;
  }
  intro.hidden = true;
  topbar.hidden = false;
  appEl.hidden = false;
  demoBar.hidden = !store.demo;
  meName.textContent = store.me.name;
  showView("feed");
  unsubscribers = [
    store.watchConnections((connections) => {
      state.connections = connections;
      render();
    }),
    store.watchPosts((posts) => {
      state.posts = posts;
      keepCommentFocus(renderFeed);
      if (state.profile) loadProfilePosts();
    }),
    store.watchRooms((rooms) => {
      activities.setRooms(rooms);
      render();
    }),
    store.watchIncomingCalls(showIncomingCall, (id) => {
      if (state.call?.ringId === id && !state.call.controller) hideCall();
    }),
  ];
  state.people = await store.listPeople().catch(() => []);
  render();
  // The day can roll over while the page is open.
  dayTimer = setInterval(render, 60_000);
}

$("#next-day").addEventListener("click", () => store?.nextDay());

// Rendering

function initials(name) {
  return name.slice(0, 2);
}

function described() {
  const today = store.today();
  return state.connections.map((conn) => ({ ...conn, t: describe(conn, today) }));
}

function waitingOnMe(conn) {
  const senders = conn.messageDays[store.today()] ?? [];
  return senders.includes(conn.other.uid) && !senders.includes(store.me.uid);
}

function temperatureLabel(t) {
  const level = t.level[0].toUpperCase() + t.level.slice(1);
  return `${level} · ${t.degrees} of 7 days`;
}

function render() {
  if (!store) return;
  keepCommentFocus(renderAll);
}

function renderAll() {
  const all = described();
  const active = all.filter((conn) => conn.t.state === "active");
  const outgoing = all.filter((conn) => conn.t.state === "pending" && !conn.incoming);
  const used = active.length + outgoing.length;
  countEl.textContent = used;
  if (store.demo) demoDay.textContent = formatDay(store.today());
  renderGrid(active);
  renderRequests(all, used);
  renderCooled(all);
  renderPeople(all, used);
  renderFeed();
  activities.renderStrip();
  renderThreadHeader(all);
  renderProfile(all);
  renderMakeRoom(used);
}

function relationship(all, uid) {
  return all.find((conn) => conn.other.uid === uid);
}

// Views: the feed, one conversation, or one person's page.
function showView(view) {
  feedView.hidden = view !== "feed";
  threadView.hidden = view !== "thread";
  profileView.hidden = view !== "profile";
  activityView.hidden = view !== "activity";
  document.body.classList.toggle("thread-open", view !== "feed");
  if (view !== "thread") {
    unsubscribeMessages?.();
    unsubscribeMessages = null;
    state.openId = null;
  }
  if (view !== "profile") state.profile = null;
}

function renderGrid(active) {
  const sorted = [...active].sort((a, b) => b.t.degrees - a.t.degrees || a.other.name.localeCompare(b.other.name));
  const activityNow = activities.activeTypes();
  grid.replaceChildren();
  grid.classList.toggle("choosing", Boolean(state.makeRoomFor));
  for (let i = 0; i < MAX_CONNECTIONS; i += 1) {
    const conn = sorted[i];
    if (!conn) {
      grid.append(el("span", "cell empty"));
      continue;
    }
    const cell = button(initials(conn.other.name), () => (state.makeRoomFor ? confirmLetGo(conn) : openThread(conn.id)), "cell");
    cell.style.setProperty("--heat", heatColor(conn.t.degrees));
    cell.title = `${conn.other.name}: ${temperatureLabel(conn.t)}`;
    cell.setAttribute("aria-label", cell.title);
    cell.classList.toggle("waiting", waitingOnMe(conn));
    const doing = activityNow.get(conn.other.uid);
    if (doing) {
      cell.classList.add("doing");
      cell.append(activityIcon(doing));
      cell.title += ` · ${doing} now`;
      cell.setAttribute("aria-label", cell.title);
    }
    cell.classList.toggle("selected", conn.id === state.openId);
    grid.append(cell);
  }
}

function renderRequests(all, used) {
  const pending = all.filter((conn) => conn.t.state === "pending");
  requestsSection.hidden = pending.length === 0;
  requestsList.replaceChildren(...pending.map((conn) => {
    const row = el("li", "person");
    row.append(personName(conn.other));
    if (conn.incoming) {
      row.append(button("Accept", () => accept(conn, used)), button("Decline", () => store.respond(conn, false), "small secondary"));
    } else {
      row.append(el("span", "muted", "Requested"));
    }
    return row;
  }));
}

function renderCooled(all) {
  const today = store.today();
  const cooled = all.filter((conn) => conn.t.state === "ended" && today < conn.t.reconnectDay);
  cooledSection.hidden = cooled.length === 0;
  cooledList.replaceChildren(...cooled.map((conn) => {
    const row = el("li", "person");
    row.append(personName(conn.other), el("span", "muted", `Back ${formatDay(conn.t.reconnectDay)}`));
    return row;
  }));
}

function renderPeople(all, used) {
  const today = store.today();
  const byId = new Map(all.map((conn) => [conn.id, conn]));
  const query = search.value.trim().toLowerCase();
  const rows = [];
  for (const person of state.people) {
    if (query && !person.name.toLowerCase().includes(query)) continue;
    const conn = byId.get(pairId(store.me.uid, person.uid));
    const blocked = conn?.t.state === "ended" && today < conn.t.reconnectDay;
    // Only people you could connect with appear here; everyone else is in your 100, your requests,
    // or (unless you search for them) under Cooled off.
    if (conn && conn.t.state !== "ended") continue;
    if (blocked && !query) continue;
    const row = el("li", "person");
    row.append(personName(person));
    if (blocked) {
      row.append(el("span", "muted", `Back ${formatDay(conn.t.reconnectDay)}`));
    } else {
      row.append(button("Connect", () => connect(person, used), "small secondary"));
    }
    rows.push(row);
    if (rows.length >= 30) break;
  }
  if (rows.length === 0) rows.push(el("li", "muted", query ? "No one by that name." : "No one new yet."));
  if (used >= MAX_CONNECTIONS) rows.unshift(el("li", "notice", "Your 100 is full. To connect with someone new, you'll let someone go."));
  peopleList.replaceChildren(...rows);
}

function personName(person) {
  return button(person.name, () => openProfile(person), "link-button person-name");
}

// Making room: when your 100 is full, connecting or accepting means letting someone go first.

function connect(person, used) {
  if (used < MAX_CONNECTIONS) return store.requestConnection(person);
  startMakingRoom({ name: person.name, done: () => store.requestConnection(person) });
}

function accept(conn, used) {
  if (used < MAX_CONNECTIONS) return store.respond(conn, true);
  startMakingRoom({ name: conn.other.name, done: () => store.respond(conn, true) });
}

function startMakingRoom(target) {
  state.makeRoomFor = target;
  render();
  grid.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderMakeRoom(used) {
  if (state.makeRoomFor && used < MAX_CONNECTIONS) state.makeRoomFor = null;
  makeRoom.hidden = !state.makeRoomFor;
  if (state.makeRoomFor) {
    makeRoomText.textContent = `Your 100 is full. Pick someone to let go to make room for ${state.makeRoomFor.name}.`;
  }
}

$("#make-room-cancel").addEventListener("click", () => {
  state.makeRoomFor = null;
  render();
});

function confirmDialog(title, text, yesLabel) {
  confirmTitle.textContent = title;
  confirmText.textContent = text;
  confirmYes.textContent = yesLabel;
  confirmOverlay.hidden = false;
  confirmYes.focus();
  return new Promise((resolve) => {
    const finish = (answer) => {
      confirmOverlay.hidden = true;
      confirmYes.removeEventListener("click", yes);
      confirmNo.removeEventListener("click", no);
      resolve(answer);
    };
    const yes = () => finish(true);
    const no = () => finish(false);
    confirmYes.addEventListener("click", yes);
    confirmNo.addEventListener("click", no);
  });
}

async function confirmLetGo(conn) {
  const target = state.makeRoomFor;
  const reason = target ? ` to make room for ${target.name}` : "";
  const ok = await confirmDialog(
    `Let go of ${conn.other.name}?`,
    `This ends your connection${reason}. Neither of you can reconnect for 30 days.`,
    "Let go",
  );
  if (!ok) return;
  await store.letGo(conn);
  if (state.openId === conn.id) showView("feed");
  if (target) {
    state.makeRoomFor = null;
    await target.done();
  }
  render();
}

search.addEventListener("input", () => render());

// Feed: posts from your 100 (and your own).

function timeAgo(date) {
  const minutes = Math.round((store.now() - date) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function videoElement(url) {
  const youtube = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (youtube) {
    const frame = el("iframe", "post-video");
    frame.src = `https://www.youtube-nocookie.com/embed/${youtube[1]}`;
    frame.title = "Video";
    frame.allow = "encrypted-media; picture-in-picture";
    frame.allowFullscreen = true;
    return frame;
  }
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
    const video = el("video", "post-video");
    video.src = url;
    video.controls = true;
    video.preload = "metadata";
    return video;
  }
  const link = el("a", "post-link", url);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  return link;
}

function renderFeed() {
  if (!store) return;
  const heat = new Map(described().filter((conn) => conn.t.state === "active").map((conn) => [conn.other.uid, conn.t.degrees]));
  const visible = state.posts.filter((post) => post.uid === store.me.uid || heat.has(post.uid)).slice(0, 80);
  if (visible.length === 0) {
    feed.replaceChildren(el("li", "muted empty-feed", "Nothing yet. Posts from your 100 show up here."));
    return;
  }
  feed.replaceChildren(...visible.map((post) => postItem(post, heat)));
}

function postItem(post, heat) {
  const item = el("li", "post");
  const head = el("div", "post-head");
  const dot = el("i", "dot");
  const mine = post.uid === store.me.uid;
  dot.style.setProperty("--heat", mine ? "var(--text)" : heatColor(heat.get(post.uid) ?? 0));
  const author = button(mine ? "You" : post.name, () => openProfile({ uid: post.uid, name: post.name }), "link-button post-author");
  head.append(dot, author, el("span", "muted", timeAgo(post.createdAt)));
  item.append(head);
  if (post.text) item.append(el("p", "post-text", post.text));
  if (post.image) {
    const image = el("img", "post-image");
    image.src = post.image;
    image.alt = `Photo shared by ${post.name}`;
    image.loading = "lazy";
    item.append(image);
  }
  if (post.video) item.append(videoElement(post.video));
  item.append(postActions(post));
  if (state.openComments.has(post.id)) item.append(commentSection(post));
  return item;
}

// Heat and comments. Neither keeps a connection warm: only talking does.

const SVG = "http://www.w3.org/2000/svg";

function flameIcon() {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("flame");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "M8 1.2c.5 2.7 4 4.2 4 8.3a4 4 0 0 1-8 0c0-2 1-3.3 2-4.1.1 1.4.7 2.3 1.5 2.7C6.9 6.1 7.2 3.3 8 1.2Z");
  svg.append(path);
  return svg;
}

function listNames(names) {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} other${names.length === 3 ? "" : "s"}`;
}

function postActions(post) {
  const row = el("div", "post-actions");
  const mine = post.uid === store.me.uid;
  const heated = Boolean(post.heat[store.me.uid]);
  const heaters = Object.entries(post.heat).filter(([uid]) => uid !== store.me.uid).map(([, name]) => name);

  if (!mine) {
    const heat = button("", () => store.toggleHeat(post, !heated), `heat-button small secondary${heated ? " heated" : ""}`);
    heat.setAttribute("aria-pressed", String(heated));
    heat.append(flameIcon(), el("span", "", heated ? "Heated" : "Heat"));
    row.append(heat);
  }

  const count = post.commentCount;
  const open = state.openComments.has(post.id);
  const commentsButton = button(count ? `${count} comment${count === 1 ? "" : "s"}` : "Comment", () => toggleComments(post), "small secondary");
  commentsButton.setAttribute("aria-expanded", String(open));
  row.append(commentsButton);

  // Only the person who posted sees who heated it (unless PUBLIC_HEAT is on).
  const total = heaters.length + (heated ? 1 : 0);
  if (mine && heaters.length) {
    const note = el("span", "heat-note");
    note.append(flameIcon(), document.createTextNode(`Heated by ${listNames(heaters)}`));
    row.append(note);
  } else if (PUBLIC_HEAT && total) {
    const note = el("span", "heat-note");
    note.append(flameIcon(), document.createTextNode(String(total)));
    row.append(note);
  }
  return row;
}

function toggleComments(post) {
  const open = state.openComments.get(post.id);
  if (open) {
    open.unsubscribe();
    state.openComments.delete(post.id);
  } else {
    const entry = { comments: [], unsubscribe: () => {} };
    state.openComments.set(post.id, entry);
    entry.unsubscribe = store.watchComments(post, (comments) => {
      entry.comments = comments;
      render();
    });
  }
  render();
}

function commentSection(post) {
  const section = el("div", "comments");
  const list = el("ol", "comment-list");
  for (const comment of state.openComments.get(post.id).comments) {
    const item = el("li", "comment");
    const mine = comment.uid === store.me.uid;
    item.append(
      button(mine ? "You" : comment.name, () => openProfile({ uid: comment.uid, name: comment.name }), "link-button comment-author"),
      el("span", "comment-text", comment.text),
      el("span", "muted comment-time", timeAgo(comment.createdAt)),
    );
    list.append(item);
  }
  const form = el("form", "comment-form");
  const input = el("input");
  input.maxLength = 1000;
  input.placeholder = "Add a comment";
  input.autocomplete = "off";
  input.setAttribute("aria-label", `Comment on ${post.uid === store.me.uid ? "your" : `${post.name}'s`} post`);
  input.dataset.commentFor = post.id;
  input.value = state.commentDrafts.get(post.id) ?? "";
  input.addEventListener("input", () => state.commentDrafts.set(post.id, input.value));
  const send = el("button", "small", "Send");
  send.type = "submit";
  form.append(input, send);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    state.commentDrafts.delete(post.id);
    input.value = "";
    try {
      await store.addComment(post, text);
    } catch (error) {
      console.error("Couldn't comment", error);
      state.commentDrafts.set(post.id, text);
      render();
    }
  });
  section.append(list, form);
  return section;
}

// The feed redraws whenever something changes, so keep the cursor in a comment box you're typing in.
function keepCommentFocus(draw) {
  const active = document.activeElement;
  const postId = active?.dataset?.commentFor;
  const caret = postId ? active.selectionStart : 0;
  draw();
  if (!postId) return;
  const input = [...document.querySelectorAll(`[data-comment-for="${CSS.escape(postId)}"]`)].find((item) => item.offsetParent);
  if (!input) return;
  input.focus();
  input.setSelectionRange(caret, caret);
}

// Photos are shrunk in the browser and stored inside the post (Firestore documents max out near 1 MB).
async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1080 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let quality = 0.82;
  let url = canvas.toDataURL("image/jpeg", quality);
  while (url.length > 700_000 && quality > 0.4) {
    quality -= 0.1;
    url = canvas.toDataURL("image/jpeg", quality);
  }
  return url;
}

postImage.addEventListener("change", async () => {
  const file = postImage.files[0];
  pendingImage = "";
  imagePreview.hidden = true;
  if (!file) return;
  try {
    pendingImage = await compressImage(file);
    imagePreview.src = pendingImage;
    imagePreview.hidden = false;
  } catch {
    composerStatus.textContent = "That image couldn't be read.";
  }
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = postText.value.trim();
  const video = postVideo.value.trim();
  if (!text && !pendingImage && !video) return;
  if (video && !/^https:\/\//.test(video)) {
    composerStatus.textContent = "Video links need to start with https://";
    return;
  }
  postButton.disabled = true;
  composerStatus.textContent = "";
  try {
    await store.createPost({ text, image: pendingImage, video });
    composer.reset();
    pendingImage = "";
    imagePreview.hidden = true;
  } catch (error) {
    composerStatus.textContent = `Couldn't post: ${error.message}`;
  } finally {
    postButton.disabled = false;
  }
});

// Threads

function openConnection() {
  return described().find((conn) => conn.id === state.openId);
}

function openThread(id) {
  unsubscribeMessages?.();
  showView("thread");
  state.openId = id;
  const conn = openConnection();
  messagesList.replaceChildren();
  unsubscribeMessages = store.watchMessages(conn, renderMessages);
  render();
  messageInput.focus();
}

function closeThread() {
  showView("feed");
  render();
}

$("#thread-back").addEventListener("click", closeThread);
threadName.addEventListener("click", () => {
  const conn = openConnection();
  if (conn) openProfile(conn.other);
});
letGoButton.addEventListener("click", () => {
  const conn = openConnection();
  if (conn) confirmLetGo(conn);
});
meName.addEventListener("click", () => openProfile(store.me));

// Profiles: one person's posts. Posts are shared with someone's 100, so you see them once you're connected.

function canSeePosts(all, uid) {
  return uid === store.me.uid || relationship(all, uid)?.t.state === "active";
}

async function loadProfilePosts() {
  const profile = state.profile;
  if (!profile || !canSeePosts(described(), profile.uid)) return;
  const posts = await store.postsBy(profile.uid).catch(() => []);
  if (state.profile !== profile) return;
  state.profilePosts = posts;
  render();
}

function openProfile(person) {
  showView("profile");
  state.profile = { uid: person.uid, name: person.name };
  state.profilePosts = [];
  profilePosts.replaceChildren();
  render();
  loadProfilePosts();
  document.querySelector(".main").scrollTop = 0;
  window.scrollTo(0, 0);
}

$("#profile-back").addEventListener("click", () => {
  showView("feed");
  render();
});

function renderProfile(all) {
  const profile = state.profile;
  if (!profile) return;
  const mine = profile.uid === store.me.uid;
  const conn = relationship(all, profile.uid);
  const active = conn?.t.state === "active";
  const used = all.filter((item) => item.t.state === "active" || (item.t.state === "pending" && !item.incoming)).length;

  profileName.textContent = mine && profile.name !== "You" ? `${profile.name} (you)` : profile.name;
  profileAvatar.textContent = initials(profile.name);
  profileAvatar.style.setProperty("--heat", active ? heatColor(conn.t.degrees) : mine ? "var(--text)" : "var(--faint)");
  profileView.style.setProperty("--heat", active ? heatColor(conn.t.degrees) : "var(--muted)");

  const actions = [];
  if (mine) {
    profileTemp.textContent = `${used} of 100 connections`;
  } else if (active) {
    profileTemp.textContent = temperatureLabel(conn.t);
    actions.push(button("Message", () => openThread(conn.id)));
  } else if (conn?.t.state === "pending") {
    profileTemp.textContent = conn.incoming ? `${profile.name} wants to connect` : "Request sent";
    if (conn.incoming) actions.push(button("Accept", () => accept(conn, used)));
  } else if (conn?.t.state === "ended" && store.today() < conn.t.reconnectDay) {
    profileTemp.textContent = `Cooled off · back ${formatDay(conn.t.reconnectDay)}`;
  } else {
    profileTemp.textContent = "Not connected";
    actions.push(button("Connect", () => connect({ uid: profile.uid, name: profile.name, photo: "" }, used)));
  }
  profileActions.replaceChildren(...actions);

  // What they're doing right now, with a way in.
  const doing = activities.activityOf(profile.uid);
  profileActivity.hidden = !doing;
  if (doing) {
    const line = el("p", "profile-activity-line");
    line.append(activityIcon(doing.room.type), el("span", "", `${mine ? "You're" : `${profile.name} is`} ${doing.verb} `), el("strong", "", doing.summary));
    const label = doing.inIt || (mine && doing.hosting) ? "Open" : "Join";
    profileActivity.replaceChildren(line, button(label, doing.join, "small"));
  }

  if (!canSeePosts(all, profile.uid)) {
    profilePosts.replaceChildren(el("li", "muted empty-feed", `${profile.name} shares posts with their 100. Connect to see them.`));
    return;
  }
  const heat = new Map(all.filter((item) => item.t.state === "active").map((item) => [item.other.uid, item.t.degrees]));
  profilePosts.replaceChildren(...(state.profilePosts.length
    ? state.profilePosts.map((post) => postItem(post, heat))
    : [el("li", "muted empty-feed", mine ? "You haven't posted yet." : `${profile.name} hasn't posted yet.`)]));
}

function renderThreadHeader(all) {
  if (!state.openId) return;
  const conn = all.find((item) => item.id === state.openId);
  if (!conn) {
    closeThread();
    return;
  }
  threadName.textContent = conn.other.name;
  const ended = conn.t.state === "ended";
  letGoButton.hidden = ended;
  messageInput.disabled = ended;
  messageForm.querySelector("button").disabled = ended;
  callButton.disabled = ended || Boolean(state.call);

  if (ended) {
    threadTemp.textContent = "Cooled off";
    threadView.style.setProperty("--heat", "var(--faint)");
    week.replaceChildren();
    threadNote.textContent = `${conn.t.letGo ? "This connection was let go." : "This connection disappeared."} You can reconnect ${formatDay(conn.t.reconnectDay)}.`;
    return;
  }

  threadView.style.setProperty("--heat", heatColor(conn.t.degrees));
  threadTemp.textContent = temperatureLabel(conn.t);
  week.replaceChildren(...conn.t.week.map((day) => {
    const item = el("li", `day${day.warm ? " warm" : ""}${day.today ? " today" : ""}`);
    item.append(el("i"), el("span", "", day.today ? "Today" : formatDay(day.day, { weekday: "narrow" })));
    item.title = `${formatDay(day.day)}: ${day.before ? "before you connected (counts as warm)" : day.warm ? "you both talked" : "no shared day"}`;
    return item;
  }));

  const senders = conn.messageDays[store.today()] ?? [];
  const meToday = senders.includes(store.me.uid);
  const themToday = senders.includes(conn.other.uid);
  let note;
  if (conn.t.talkedToday) note = "Today counts. You both talked.";
  else if (meToday) note = `You've talked today. Waiting on ${conn.other.name} to make it count.`;
  else if (themToday) note = `${conn.other.name} reached out today. Answer to make it count.`;
  else note = `Talk on ${ENGAGED_DAYS} of every 7 days to stay warm.`;
  if (!conn.t.talkedToday && conn.t.daysLeft <= 2) {
    note += ` If you two don't talk, this connection disappears ${conn.t.daysLeft === 1 ? "tomorrow" : formatDay(conn.t.endsOn)}.`;
  }
  threadNote.textContent = note;
}

function renderMessages(messages) {
  const nearBottom = messagesList.scrollHeight - messagesList.scrollTop - messagesList.clientHeight < 80;
  messagesList.replaceChildren(...messages.map((message) => {
    const item = el("li", `message${message.from === store.me.uid ? " mine" : ""}`);
    item.append(el("p", "", message.text), el("span", "muted", timeAgo(message.createdAt)));
    return item;
  }));
  if (nearBottom || messages.at(-1)?.from === store.me.uid) messagesList.scrollTop = messagesList.scrollHeight;
}

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const conn = openConnection();
  const text = messageInput.value.trim();
  if (!conn || !text) return;
  messageInput.value = "";
  try {
    await store.sendMessage(conn, text);
  } catch (error) {
    threadNote.textContent = `Couldn't send: ${error.message}`;
  }
});

// Calls

function formatSeconds(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const CALL_ENDINGS = {
  ended: "Call ended",
  declined: "Declined",
  missed: "No answer",
  failed: "Couldn't connect. Check your microphone and network.",
};

function callHandlers(name) {
  return {
    onState(callState, seconds = 0) {
      if (callState === "ringing") {
        callLabel.textContent = "Calling";
        callNote.textContent = "Ringing…";
      } else if (callState === "live") {
        callLabel.textContent = "On a call";
        callNote.textContent = `Counts toward today after ${formatSeconds(CALL_SECONDS)}.`;
      } else {
        callLabel.textContent = CALL_ENDINGS[callState] ?? "Call ended";
        callTime.textContent = formatSeconds(seconds);
        callNote.textContent = seconds >= CALL_SECONDS ? `That call counts toward today with ${name}.` : seconds > 0 ? "Shorter than 5 minutes, so it doesn't count toward today." : "";
        callEnd.textContent = "Close";
        if (state.call) state.call.finished = true;
      }
    },
    onTick(seconds) {
      callTime.textContent = formatSeconds(seconds);
      if (seconds >= CALL_SECONDS) callNote.textContent = "This call counts toward today.";
    },
  };
}

function showCall(name, label) {
  callName.textContent = name;
  callLabel.textContent = label;
  callTime.textContent = "0:00";
  callNote.textContent = store.demo ? "Demo calls run fast: each second counts as a minute." : "";
  callEnd.textContent = "Hang up";
  callAccept.hidden = true;
  callOverlay.hidden = false;
}

function hideCall() {
  callOverlay.hidden = true;
  state.call = null;
  render();
}

callButton.addEventListener("click", () => {
  const conn = openConnection();
  if (!conn || state.call) return;
  showCall(conn.other.name, "Calling");
  state.call = { finished: false };
  state.call.controller = store.startCall(conn, callHandlers(conn.other.name));
  render();
});

function showIncomingCall(ring) {
  if (state.call) {
    ring.decline();
    return;
  }
  showCall(ring.fromName, "Incoming call");
  callNote.textContent = "";
  callEnd.textContent = "Decline";
  callAccept.hidden = false;
  state.call = { ringId: ring.id, ring, finished: false, controller: null };
}

callAccept.addEventListener("click", () => {
  const call = state.call;
  if (!call?.ring) return;
  callAccept.hidden = true;
  callEnd.textContent = "Hang up";
  callLabel.textContent = "Connecting";
  call.controller = call.ring.accept(callHandlers(call.ring.fromName));
});

callEnd.addEventListener("click", () => {
  const call = state.call;
  if (!call || call.finished) {
    hideCall();
    return;
  }
  if (call.controller) {
    call.controller.hangUp();
  } else {
    call.ring?.decline();
    hideCall();
  }
});
