// Demo mode: a simulated network of fake people (agents) living in memory, nothing saved.
// It tests 100 at scale without waiting a week: "Next day" moves the clock forward,
// fake people message you on their own, and they reply through a language model.

import { COMMENTS_COUNT_AS_TALKING, addDays, dayKey, describe, pairId } from "./rules.js";

const REPLICATE_PROXY_URL = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
const CHAT_MODEL = "openai/gpt-4o-mini";
const DAY_MS = 86_400_000;
// Demo calls run fast: every real second counts as a minute.
const CALL_SPEED = 60;

const NAMES = [
  "Maya", "Jordan", "Priya", "Mateo", "Aisha", "Leo", "Sofia", "Kwame", "Hana", "Diego",
  "Zara", "Eli", "Nia", "Omar", "Ines", "Theo", "Amara", "Kenji", "Lucia", "Malik",
  "Freya", "Ravi", "Chloe", "Tariq", "Elena", "Jonah", "Imani", "Arjun", "Bea", "Kofi",
  "Mira", "Sam", "Yara", "Felix", "Ada", "Hugo", "Lina", "Marcus", "Noor", "Oscar",
  "Rosa", "Sani", "Tess", "Uma", "Vic", "Wren", "Xavi", "Yusuf", "Zoe", "Abe",
  "Bianca", "Cyrus", "Dara", "Emeka", "Fatima", "Gus", "Hira", "Idris", "June", "Kai",
  "Lola", "Mo", "Nell", "Otis", "Pia", "Quinn", "Rumi", "Sade", "Tomas", "Ugo",
  "Vera", "Wes", "Ximena", "Yosef", "Zain", "Ana", "Bo", "Cleo", "Dev", "Esme",
  "Finn", "Gia", "Hal", "Iris", "Jules", "Kira", "Lev", "Mina", "Nico", "Opal",
  "Pablo", "Rhea", "Selim", "Tara", "Uri", "Vida", "Will", "Yuki", "Zeke", "Asha",
  "Ben", "Cara", "Dmitri", "Eve", "Femi", "Grace", "Hassan", "Isla", "Jae", "Kemi",
  "Luca", "Meera", "Nate", "Ola", "Pete", "Rania", "Simone", "Tobi", "Una", "Vik",
  "Wanda", "Yasmin", "Zion", "Alma", "Bruno", "Carmen", "Dina", "Ezra", "Flo", "Gabe",
  "Hiro", "Ife", "Jana", "Kurt", "Lea", "Max", "Nadia", "Orly", "Paz", "Rui",
];

const BIOS = [
  "a ceramicist who always has clay under their nails", "a nurse working night shifts", "a grad student studying birds",
  "a line cook who loves trying new spots", "a high school music teacher", "a bike messenger who reads on breaks",
  "a new parent running on very little sleep", "a software engineer learning to surf", "a painter who just moved cities",
  "a soccer coach for a kids' team", "a barber with strong opinions about movies", "a librarian who runs a book club",
  "a dancer rehearsing for a show", "an architect who sketches everything", "a nursing home volunteer",
  "a photographer who shoots on film", "a farmer's market regular who bakes bread", "a retired engineer who gardens",
];

const SMALL_TALK = [
  "How's your week going?", "Thinking about you, what's new?", "Did you end up watching that show?",
  "I tried the place you recommended, so good.", "Long day. Call later?", "Saw something that reminded me of you.",
  "Are we still on for this weekend?", "Haha that's so you.", "Okay I owe you a real catch-up.",
  "Just got home, finally.", "You were right about that, by the way.", "What are you up to tonight?",
];

const POST_TEXTS = [
  "First cold morning of the year. Coffee tastes better already.", "Finished the book. Still thinking about the ending.",
  "Tried a new recipe and nobody got hurt.", "Sunset from the roof tonight.", "Small win today: fixed the bike myself.",
  "Grateful for the people who check in.", "New plant, already worried about it.", "Long walk, no phone. Recommend.",
  "The kids' team won their first game!", "Studio day. Messy hands, happy head.", "Found a record store I'd never seen before.",
  "Night shift done. Sleeping until noon.",
];

const ROOM_LINES = [
  "Okay this part is so good.", "Wait, rewind that in your head.", "Snacks secured.", "I can't believe that just happened.",
  "This soundtrack though.", "Who's watching the next one with me?", "I'm so glad you joined.",
];

const JOIN_LINES = {
  watching: ["Oh I've been wanting to watch this!", "Joining!", "Perfect timing.", "Saved you a seat 🍿"],
  reading: ["Starting the first one now.", "Ooh good list.", "Reading along!"],
};

// What the demo "detects" you put on, per streaming app.
const DEMO_TITLES = {
  netflix: ["Stranger Things, season 5", "Squid Game, season 2", "The Crown"],
  youtube: ["A video essay on Studio Ghibli", "Tiny Desk Concert"],
  prime: ["The Boys", "Fallout"],
  disney: ["Andor", "Bluey"],
  max: ["The Last of Us", "The Pitt"],
  hulu: ["The Bear, season 3", "Shōgun"],
  appletv: ["Severance, season 2", "Slow Horses"],
  peacock: ["The Office"],
  paramount: ["Yellowstone"],
  crunchyroll: ["Frieren"],
  other: ["A movie"],
};

const TASKS = ["Problem set 4", "Reading for seminar", "Cover letter", "Studio project", "Stats homework", "Thesis outline"];

const READING_LIST = [
  { title: "Dunbar's number", url: "https://en.wikipedia.org/wiki/Dunbar%27s_number" },
  { title: "Interpersonal ties", url: "https://en.wikipedia.org/wiki/Interpersonal_ties" },
  { title: "Parasocial interaction", url: "https://en.wikipedia.org/wiki/Parasocial_interaction" },
];

// A focus timer: minutes of focus, minutes of break, and how much of the focus is left.
function focusTimer(focusMinutes, breakMinutes, secondsLeft = focusMinutes * 60) {
  return { phase: "focus", running: true, endsAt: Date.now() + secondsLeft * 1000, remaining: secondsLeft, focus: focusMinutes * 60, break: breakMinutes * 60, round: 1 };
}

const COMMENT_LINES = [
  "Love this.", "Okay this is so you.", "Need the full story next time we talk.", "Wish I was there!",
  "This made my day.", "Wait, where is this?", "So good to see this.", "Proud of you!",
];

// A small seeded random generator, so the demo starts the same way every time.
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDemoStore({ name }) {
  const random = seededRandom(100);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const me = { uid: "you", name, photo: "" };
  let dayOffset = 0;
  const now = () => new Date(Date.now() + dayOffset * DAY_MS);
  const today = () => dayKey(now());

  const people = NAMES.map((personName, index) => ({ uid: `person${index}`, name: personName, photo: "", bio: BIOS[index % BIOS.length], chattiness: 0.5 }));
  const peopleById = new Map(people.map((person) => [person.uid, person]));
  const connections = new Map();
  const messages = new Map();
  const posts = [];
  const comments = new Map();
  const rooms = new Map();
  const roomChats = new Map();
  const roomNotes = new Map();
  const listeners = { connections: new Set(), posts: new Set(), messages: new Map(), comments: new Map(), rooms: new Set(), roomChats: new Map(), roomNotes: new Map() };

  function newConnection(person, fields) {
    return {
      id: pairId(me.uid, person.uid),
      members: [me.uid, person.uid].sort(),
      status: "active",
      requestedBy: me.uid,
      startedDay: today(),
      endedDay: "",
      messageDays: {},
      callDays: {},
      togetherDays: {},
      ...fields,
    };
  }

  function markTalked(conn, uid, day = today()) {
    const senders = conn.messageDays[day] ?? [];
    if (!senders.includes(uid)) conn.messageDays[day] = [...senders, uid];
  }

  // Seed: 64 connections with different habits, a few requests, two that recently disappeared.
  function seed() {
    const day = today();
    const habits = [
      ...Array(16).fill(["daily", 0.85]),
      ...Array(20).fill(["steady", 0.5]),
      ...Array(16).fill(["drifting", 0.2]),
      ...Array(6).fill(["fading", 0]),
      ...Array(6).fill(["new", 0.5]),
    ];
    habits.forEach(([habit, chance], index) => {
      const person = people[index];
      person.chattiness = habit === "fading" ? 0.05 : Math.max(chance, 0.15);
      const startedDay = habit === "new" ? addDays(day, -Math.floor(random() * 3)) : addDays(day, -(20 + Math.floor(random() * 180)));
      const conn = newConnection(person, { startedDay });
      // Fading connections last talked 5 or 6 days ago and are about to disappear.
      const fadeDay = 5 + Math.floor(random() * 2);
      for (let back = 1; back <= 14; back += 1) {
        const past = addDays(day, -back);
        if (past < startedDay) continue;
        const roll = random();
        if (habit === "fading") {
          if (back === fadeDay) { markTalked(conn, me.uid, past); markTalked(conn, person.uid, past); }
        } else if (roll < chance) {
          markTalked(conn, me.uid, past);
          markTalked(conn, person.uid, past);
        } else if (roll < chance + 0.25) {
          markTalked(conn, person.uid, past);
        }
      }
      // Keep drifting connections alive at the start: one shared day this week.
      if (habit === "drifting") {
        const past = addDays(day, -(1 + Math.floor(random() * 5)));
        markTalked(conn, me.uid, past);
        markTalked(conn, person.uid, past);
      }
      if (habit !== "fading" && random() < chance * 0.5) markTalked(conn, person.uid, day);
      connections.set(conn.id, conn);
    });

    for (const index of [64, 65]) {
      const conn = newConnection(people[index], { startedDay: addDays(day, -90) });
      markTalked(conn, me.uid, addDays(day, -12));
      markTalked(conn, people[index].uid, addDays(day, -12));
      connections.set(conn.id, conn);
    }
    for (const index of [66, 67, 68]) {
      const conn = newConnection(people[index], { status: "pending", requestedBy: people[index].uid, startedDay: "" });
      connections.set(conn.id, conn);
    }
    const outgoing = newConnection(people[69], { status: "pending", startedDay: "" });
    connections.set(outgoing.id, outgoing);

    // A few people in your 100 are already doing something together.
    openRoom(people[2], { type: "watching", title: "Severance, season 2", service: "appletv" }, [people[7], people[11]]);
    openRoom(people[5], { type: "watching", title: "Big Buck Bunny", service: "youtube", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" }, [people[3]]);
    const reading = openRoom(people[8], { type: "reading", title: "Why can we only keep ~150 friends?", items: READING_LIST }, [people[1], people[14]]);
    reading.viewers[1].at = 1;
    reading.viewers[1].done = [0];
    roomNotes.set(reading.id, [
      { id: "note-1", uid: people[8].uid, name: people[8].name, item: 0, quote: "", text: "This is basically the whole idea of 100.", createdAt: now() },
      { id: "note-2", uid: people[1].uid, name: people[1].name, item: 0, quote: "", text: "Wild that it's about the size of a village.", createdAt: now() },
    ]);
    const studying = openRoom(people[12], { type: "studying", title: "Thesis week", timer: focusTimer(25, 5, 11 * 60) }, [people[4], people[13]]);
    ["Lit review section", "Problem set 4", "Portfolio site"].forEach((task, index) => { studying.viewers[index].task = task; });

    for (let i = 0; i < 36; i += 1) addPost(people[Math.floor(random() * 58)], i, now() - random() * 3 * DAY_MS);
  }

  function addPost(person, index, time) {
    posts.push({
      id: `post${index}-${time}`,
      uid: person.uid,
      name: person.name,
      text: pick(POST_TEXTS),
      image: random() < 0.35 ? `https://picsum.photos/seed/hundred${index}${Math.round(time)}/640/480` : "",
      video: "",
      heat: {},
      commentCount: 0,
      createdAt: new Date(time),
    });
    posts.sort((a, b) => b.createdAt - a.createdAt);
  }

  function view(conn) {
    const otherUid = conn.members.find((uid) => uid !== me.uid);
    return {
      ...conn,
      messageDays: { ...conn.messageDays },
      callDays: { ...conn.callDays },
      togetherDays: { ...conn.togetherDays },
      incoming: conn.status === "pending" && conn.requestedBy !== me.uid,
      other: peopleById.get(otherUid),
    };
  }

  function emitConnections() {
    const list = [...connections.values()].map(view);
    listeners.connections.forEach((callback) => callback(list));
  }

  function emitPosts() {
    listeners.posts.forEach((callback) => callback([...posts]));
  }

  function openRoom(host, { type, title, service = "", url = "", items = [], timer = null }, viewers) {
    const room = {
      id: `room-${host.uid}`,
      type,
      host: host.uid,
      hostName: host.name,
      title,
      service,
      url,
      items,
      timer,
      live: true,
      playback: { playing: true, position: 300 + Math.floor(random() * 600), updatedAt: Date.now() },
      viewers: [host, ...viewers].map((person) => ({ uid: person.uid, name: person.name, at: 0, done: [], task: "" })),
    };
    rooms.set(room.id, room);
    roomChats.set(room.id, viewers.filter(() => type !== "studying").map((person, index) => ({ id: `${room.id}-${index}`, uid: person.uid, name: person.name, text: pick(ROOM_LINES), createdAt: now() })));
    return room;
  }

  function emitRooms() {
    const list = [...rooms.values()].map((room) => ({
      ...room,
      viewers: room.viewers.map((viewer) => ({ ...viewer, done: [...viewer.done] })),
      playback: { ...room.playback },
      timer: room.timer && { ...room.timer },
    }));
    listeners.rooms.forEach((callback) => callback(list));
  }

  function addRoomChat(room, person, text) {
    const list = [...(roomChats.get(room.id) ?? []), { id: `${Date.now()}-${Math.random()}`, uid: person.uid, name: person.name, text, createdAt: now() }];
    roomChats.set(room.id, list);
    listeners.roomChats.get(room.id)?.forEach((callback) => callback([...list]));
  }

  function addCommentAs(post, person, text) {
    const list = [...(comments.get(post.id) ?? []), { id: `${Date.now()}-${Math.random()}`, uid: person.uid, name: person.name, text, createdAt: now() }];
    comments.set(post.id, list);
    post.commentCount = list.length;
    listeners.comments.get(post.id)?.forEach((callback) => callback([...list]));
  }

  // Message threads are made up the first time they're opened, from the days each person talked.
  function threadFor(conn) {
    if (!messages.has(conn.id)) {
      const thread = [];
      Object.keys(conn.messageDays).sort().slice(-7).forEach((day) => {
        conn.messageDays[day].forEach((uid, order) => {
          const time = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)), 15 + order * 2, Math.floor(random() * 60)));
          thread.push({ id: `${day}-${uid}`, from: uid, text: uid === me.uid ? pick(["Good! You?", "Haha yes", "Miss you, let's catch up soon", "On my way home now"]) : pick(SMALL_TALK), createdAt: time });
        });
      });
      messages.set(conn.id, thread);
    }
    return messages.get(conn.id);
  }

  function emitMessages(conn) {
    const thread = [...threadFor(conn)];
    listeners.messages.get(conn.id)?.forEach((callback) => callback(thread));
  }

  function addMessage(conn, from, text) {
    threadFor(conn).push({ id: `${Date.now()}-${Math.random()}`, from, text, createdAt: now() });
    markTalked(conn, from);
    emitMessages(conn);
    emitConnections();
  }

  function replyText(person, conn) {
    const recent = threadFor(conn).slice(-6).map((message) => `${message.from === me.uid ? me.name : person.name}: ${message.text}`).join("\n");
    return askModel(person, [
      `You are ${person.name}, ${person.bio}. You're texting ${me.name}, one of the 100 people you keep close on a social app built for real friendships.`,
      `Recent messages:\n${recent}`,
      `Reply as ${person.name} with one short, warm, casual text message (under 25 words). Respond with only the message.`,
    ].join("\n\n"), SMALL_TALK);
  }

  function commentReplyText(person, post, comment) {
    return askModel(person, [
      `You are ${person.name}, ${person.bio}. You posted "${post.text || "a photo"}" on a social app where everyone keeps only 100 close connections.`,
      `${me.name} commented: "${comment}"`,
      `Reply as ${person.name} with one short, warm comment (under 20 words). Respond with only the comment.`,
    ].join("\n\n"), COMMENT_LINES);
  }

  async function askModel(person, prompt, fallback) {
    try {
      const response = await fetch(REPLICATE_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: CHAT_MODEL, input: { prompt, temperature: 0.9 } }),
      });
      const prediction = await response.json();
      const text = Array.isArray(prediction.output) ? prediction.output.join("") : String(prediction.output ?? "");
      return text.trim().replace(new RegExp(`^${person.name}:\\s*`), "").replace(/^"|"$/g, "") || pick(fallback);
    } catch {
      return pick(fallback);
    }
  }

  seed();

  // Fake readers move through their reading lists, and timers in rooms they host keep cycling.
  setInterval(() => {
    for (const room of rooms.values()) {
      if (room.type === "reading" && random() < 0.3) {
        const readers = room.viewers.filter((viewer) => viewer.uid !== me.uid && !viewer.done.includes(room.items.length - 1));
        if (readers.length) {
          const reader = pick(readers);
          reader.done = [...new Set([...reader.done, reader.at])];
          reader.at = Math.min(reader.at + 1, room.items.length - 1);
          emitRooms();
        }
      }
      if (room.type === "studying" && room.host !== me.uid && room.timer.running && Date.now() >= room.timer.endsAt) {
        const next = room.timer.phase === "focus" ? "break" : "focus";
        room.timer = { ...room.timer, phase: next, endsAt: Date.now() + room.timer[next] * 1000, round: room.timer.round + (next === "focus" ? 1 : 0) };
        emitRooms();
      }
    }
  }, 15_000);

  return {
    demo: true,
    me,
    today,
    now,

    async init() {},

    watchConnections(callback) {
      listeners.connections.add(callback);
      callback([...connections.values()].map(view));
      return () => listeners.connections.delete(callback);
    },

    watchMessages(conn, callback) {
      if (!listeners.messages.has(conn.id)) listeners.messages.set(conn.id, new Set());
      listeners.messages.get(conn.id).add(callback);
      callback([...threadFor(connections.get(conn.id))]);
      return () => listeners.messages.get(conn.id).delete(callback);
    },

    // Fake people answer every message, which is what makes the day count for both of you.
    async sendMessage(view, text) {
      const conn = connections.get(view.id);
      addMessage(conn, me.uid, text);
      const person = peopleById.get(view.other.uid);
      const [reply] = await Promise.all([replyText(person, conn), new Promise((resolve) => setTimeout(resolve, 1200))]);
      if (describe(conn, today()).state === "active") addMessage(conn, person.uid, reply);
    },

    watchPosts(callback) {
      listeners.posts.add(callback);
      callback([...posts]);
      return () => listeners.posts.delete(callback);
    },

    // Some of your hottest connections heat your post over the next few seconds, and a couple comment.
    async createPost({ text, image, video }) {
      const post = { id: `mine-${Date.now()}`, uid: me.uid, name: me.name, text, image, video, heat: {}, commentCount: 0, createdAt: now() };
      posts.unshift(post);
      emitPosts();
      const friends = [...connections.values()]
        .filter((conn) => describe(conn, today()).state === "active")
        .map((conn) => peopleById.get(conn.members.find((uid) => uid !== me.uid)))
        .sort(() => random() - 0.5)
        .slice(0, 3 + Math.floor(random() * 5));
      friends.forEach((person, index) => {
        setTimeout(() => {
          post.heat = { ...post.heat, [person.uid]: person.name };
          if (index < 2) addCommentAs(post, person, pick(COMMENT_LINES));
          emitPosts();
        }, 1500 + index * 1200);
      });
    },

    async toggleHeat(view, on) {
      const post = posts.find((item) => item.id === view.id);
      const heat = { ...post.heat };
      if (on) heat[me.uid] = me.name;
      else delete heat[me.uid];
      post.heat = heat;
      emitPosts();
    },

    watchComments(view, callback) {
      if (!listeners.comments.has(view.id)) listeners.comments.set(view.id, new Set());
      listeners.comments.get(view.id).add(callback);
      callback([...(comments.get(view.id) ?? [])]);
      return () => listeners.comments.get(view.id).delete(callback);
    },

    async addComment(view, text) {
      const post = posts.find((item) => item.id === view.id);
      addCommentAs(post, me, text);
      if (COMMENTS_COUNT_AS_TALKING && post.uid !== me.uid) {
        const conn = connections.get(pairId(me.uid, post.uid));
        if (conn) {
          markTalked(conn, me.uid);
          emitConnections();
        }
      }
      emitPosts();
      if (post.uid === me.uid) return;
      const person = peopleById.get(post.uid);
      const [reply] = await Promise.all([commentReplyText(person, post, text), new Promise((resolve) => setTimeout(resolve, 1500))]);
      addCommentAs(post, person, reply);
      emitPosts();
    },

    async listPeople() {
      return people;
    },

    async requestConnection(other) {
      const conn = newConnection(peopleById.get(other.uid), { status: "pending", startedDay: "" });
      connections.set(conn.id, conn);
      messages.delete(conn.id);
      emitConnections();
      // Most fake people accept after a moment.
      setTimeout(() => {
        if (random() < 0.85 && connections.get(conn.id) === conn) {
          conn.status = "active";
          conn.startedDay = today();
          emitConnections();
        }
      }, 2500);
    },

    async respond(view, accept) {
      const conn = connections.get(view.id);
      if (accept) {
        conn.status = "active";
        conn.startedDay = today();
      } else {
        connections.delete(conn.id);
      }
      emitConnections();
    },

    async letGo(view) {
      const conn = connections.get(view.id);
      conn.status = "ended";
      conn.endedDay = today();
      emitConnections();
    },

    async postsBy(uid) {
      return posts.filter((post) => post.uid === uid);
    },

    startCall(view, handlers) {
      const conn = connections.get(view.id);
      let seconds = 0;
      let timer = 0;
      let done = false;
      const answer = setTimeout(() => {
        handlers.onState("live");
        timer = setInterval(() => {
          seconds += CALL_SPEED;
          handlers.onTick(seconds);
        }, 1000);
      }, 1500);
      return {
        hangUp() {
          if (done) return;
          done = true;
          clearTimeout(answer);
          clearInterval(timer);
          if (seconds > 0) {
            conn.callDays[today()] = (conn.callDays[today()] ?? 0) + seconds;
            emitConnections();
          }
          handlers.onState(seconds > 0 ? "ended" : "missed", seconds);
        },
      };
    },

    watchIncomingCalls() {
      return () => {};
    },

    // Activities. Demo time runs fast here too: a second together counts as a minute.
    timeSpeed: 60,

    watchRooms(callback) {
      listeners.rooms.add(callback);
      emitRooms();
      return () => listeners.rooms.delete(callback);
    },

    // A few of your hottest connections join your room over the next few seconds.
    async startRoom(fields) {
      const room = openRoom(me, fields, []);
      room.playback = { playing: false, position: 0, updatedAt: Date.now() };
      emitRooms();
      // Pretend the browser extension saw what you put on.
      if (room.type === "watching" && !room.title) {
        setTimeout(() => {
          if (!rooms.has(room.id) || room.title) return;
          room.title = pick(DEMO_TITLES[room.service] ?? DEMO_TITLES.other);
          emitRooms();
        }, 4000);
      }
      const friends = [...connections.values()]
        .map((conn) => ({ conn, t: describe(conn, today()) }))
        .filter(({ t }) => t.state === "active")
        .sort((a, b) => b.t.degrees - a.t.degrees)
        .slice(0, 8)
        .sort(() => random() - 0.5)
        .slice(0, 1 + Math.floor(random() * 3))
        .map(({ conn }) => peopleById.get(conn.members.find((uid) => uid !== me.uid)));
      friends.forEach((person, index) => {
        setTimeout(() => {
          if (!rooms.has(room.id)) return;
          room.viewers.push({ uid: person.uid, name: person.name, at: 0, done: [], task: room.type === "studying" ? pick(TASKS) : "" });
          emitRooms();
          if (room.type !== "studying") addRoomChat(room, person, pick(JOIN_LINES[room.type]));
        }, 2500 + index * 3000);
      });
      return room.id;
    },

    async endRoom(view) {
      rooms.delete(view.id);
      emitRooms();
    },

    async joinRoom(view) {
      const room = rooms.get(view.id);
      if (!room.viewers.some((viewer) => viewer.uid === me.uid)) room.viewers.push({ uid: me.uid, name: me.name, at: 0, done: [], task: "" });
      emitRooms();
    },

    async leaveRoom(view) {
      const room = rooms.get(view.id);
      if (!room) return;
      room.viewers = room.viewers.filter((viewer) => viewer.uid !== me.uid);
      emitRooms();
    },

    async heartbeat() {},

    // The host's shared state: the playback position or the focus timer.
    async updateRoom(view, fields) {
      Object.assign(rooms.get(view.id), fields);
      emitRooms();
    },

    // Your own place in the room: which article you're on, what you've finished, what you're working on.
    async updateMe(view, fields) {
      const viewer = rooms.get(view.id)?.viewers.find((item) => item.uid === me.uid);
      if (!viewer) return;
      Object.assign(viewer, fields);
      emitRooms();
    },

    watchRoomChat(view, callback) {
      if (!listeners.roomChats.has(view.id)) listeners.roomChats.set(view.id, new Set());
      listeners.roomChats.get(view.id).add(callback);
      callback([...(roomChats.get(view.id) ?? [])]);
      return () => listeners.roomChats.get(view.id).delete(callback);
    },

    async sendRoomChat(view, text) {
      const room = rooms.get(view.id);
      addRoomChat(room, me, text);
      const others = room.viewers.filter((person) => person.uid !== me.uid);
      if (others.length === 0) return;
      const person = peopleById.get(pick(others).uid);
      const doing = { watching: "watching", reading: "reading", studying: "studying (on a break)" }[room.type];
      const reply = await askModel(person, [
        `You are ${person.name}, ${person.bio}. You're ${doing} "${room.title}" together with friends from your 100, in a live chat.`,
        `${me.name} wrote: "${text}"`,
        `Reply as ${person.name} with one short, casual chat message (under 15 words). Respond with only the message.`,
      ].join("\n\n"), ROOM_LINES);
      if (rooms.has(room.id)) addRoomChat(room, person, reply);
    },

    watchRoomNotes(view, callback) {
      if (!listeners.roomNotes.has(view.id)) listeners.roomNotes.set(view.id, new Set());
      listeners.roomNotes.get(view.id).add(callback);
      callback([...(roomNotes.get(view.id) ?? [])]);
      return () => listeners.roomNotes.get(view.id).delete(callback);
    },

    async addRoomNote(view, { item, quote, text }) {
      const list = [...(roomNotes.get(view.id) ?? []), { id: `${Date.now()}-${Math.random()}`, uid: me.uid, name: me.name, item, quote, text, createdAt: now() }];
      roomNotes.set(view.id, list);
      listeners.roomNotes.get(view.id)?.forEach((callback) => callback([...list]));
    },

    // Fake people are always there, so both sides are marked at once.
    async markTogether(otherUid) {
      const conn = connections.get(pairId(me.uid, otherUid));
      if (!conn) return;
      conn.togetherDays[today()] = [me.uid, otherUid];
      emitConnections();
    },

    // Move the clock forward a day. Fake people message you based on how chatty they are;
    // the day only counts if you answer.
    nextDay() {
      dayOffset += 1;
      for (const conn of connections.values()) {
        if (describe(conn, today()).state !== "active") continue;
        const person = peopleById.get(conn.members.find((uid) => uid !== me.uid));
        if (random() < person.chattiness) {
          threadFor(conn).push({ id: `${today()}-${person.uid}`, from: person.uid, text: pick(SMALL_TALK), createdAt: now() });
          markTalked(conn, person.uid);
        }
      }
      for (let i = 0; i < 4; i += 1) addPost(people[Math.floor(random() * 58)], posts.length + i, now() - random() * DAY_MS / 2);
      emitConnections();
      emitPosts();
    },
  };
}
