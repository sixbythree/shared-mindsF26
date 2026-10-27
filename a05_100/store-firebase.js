// Real mode: people sign in with Google, and everything lives in Firestore.
// Voice calls are browser-to-browser (WebRTC), with Firestore carrying the connection setup.

import { COMMENTS_COUNT_AS_TALKING, dayKey, pairId } from "./rules.js";

const ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const RING_SECONDS = 45;
const ENDED_STATUSES = ["ended", "declined", "missed", "failed"];
// Someone counts as in an activity while their tab checked in within this window.
const PRESENCE_MS = 75_000;

export function firstName(user) {
  return (user.displayName || user.email || "Someone").split(" ")[0];
}

export function createFirebaseStore(app, user) {
  const db = app.firestore();
  const { FieldValue } = firebase.firestore;
  const me = { uid: user.uid, name: firstName(user), photo: user.photoURL ?? "" };
  const usersCollection = db.collection("hundredUsers");
  const connectionsCollection = db.collection("hundredConnections");
  const postsCollection = db.collection("hundredPosts");
  const callsCollection = db.collection("hundredCalls");
  const activitiesCollection = db.collection("hundredActivities");

  function toConnection(id, data) {
    const otherUid = data.members.find((uid) => uid !== me.uid);
    return {
      id,
      members: data.members,
      status: data.status,
      requestedBy: data.requestedBy,
      incoming: data.status === "pending" && data.requestedBy !== me.uid,
      startedDay: data.startedDay || dayKey(),
      endedDay: data.endedDay ?? "",
      messageDays: data.messageDays ?? {},
      callDays: data.callDays ?? {},
      togetherDays: data.togetherDays ?? {},
      other: { uid: otherUid, name: "Someone", photo: "", ...data.profiles?.[otherUid] },
    };
  }

  function toRoom(doc) {
    const data = doc.data();
    const now = Date.now();
    return {
      id: doc.id,
      type: data.type,
      host: data.host,
      hostName: data.hostName,
      title: data.title,
      service: data.service ?? "",
      url: data.url,
      items: data.items ?? [],
      timer: data.timer,
      playback: data.playback,
      live: data.status === "live" && now - (data.hostSeenAt ?? 0) < PRESENCE_MS,
      viewers: Object.entries(data.viewers ?? {})
        .filter(([, viewer]) => now - viewer.seenAt < PRESENCE_MS)
        .map(([uid, viewer]) => ({ uid, name: viewer.name, at: viewer.at ?? 0, done: viewer.done ?? [], task: viewer.task ?? "" })),
    };
  }

  function toPost(doc) {
    const data = doc.data();
    return { id: doc.id, ...data, heat: data.heat ?? {}, commentCount: data.commentCount ?? 0, createdAt: data.createdAt?.toDate() ?? new Date() };
  }

  // Calls

  function makeCall(ref, conn, handlers, isCaller) {
    const call = { ref, pc: null, stream: null, audio: null, unsubs: [], pending: [], connectedAt: 0, timer: 0, done: false, day: dayKey() };

    call.seconds = () => (call.connectedAt ? Math.round((Date.now() - call.connectedAt) / 1000) : 0);

    // Whoever hangs up records the call's length on the connection, so it's only counted once.
    call.end = async (status, byMe) => {
      if (call.done) return;
      call.done = true;
      const seconds = call.seconds();
      clearInterval(call.timer);
      call.unsubs.forEach((unsubscribe) => unsubscribe());
      call.pc?.close();
      call.stream?.getTracks().forEach((track) => track.stop());
      handlers.onState(status, seconds);
      if (!byMe) return;
      await ref.update({ status, seconds }).catch(() => {});
      if (seconds > 0) {
        await connectionsCollection.doc(conn.id)
          .update({ [`callDays.${call.day}`]: FieldValue.increment(seconds) })
          .catch((error) => console.error("Couldn't record the call", error));
      }
    };

    call.open = async (sendSide) => {
      call.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      call.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      call.stream.getTracks().forEach((track) => call.pc.addTrack(track, call.stream));
      call.audio = new Audio();
      call.audio.autoplay = true;
      call.pc.ontrack = (event) => {
        call.audio.srcObject = event.streams[0];
        call.audio.play().catch(() => {});
      };
      call.pc.onicecandidate = (event) => {
        if (event.candidate) ref.collection(sendSide).add(event.candidate.toJSON());
      };
      call.pc.onconnectionstatechange = () => {
        const state = call.pc?.connectionState;
        if (state === "connected" && !call.connectedAt) {
          call.connectedAt = Date.now();
          handlers.onState("live");
          call.timer = setInterval(() => handlers.onTick(call.seconds()), 1000);
        }
        if (state === "failed") call.end("failed", true);
      };
    };

    // Candidates can arrive before the other side's description; hold them until it's set.
    call.setRemote = async (description) => {
      await call.pc.setRemoteDescription(new RTCSessionDescription(description));
      call.pending.splice(0).forEach((candidate) => call.pc.addIceCandidate(candidate).catch(() => {}));
    };

    call.listen = (receiveSide) => {
      call.unsubs.push(ref.onSnapshot((snapshot) => {
        const data = snapshot.data();
        if (!data || call.done) return;
        if (isCaller && data.answer && !call.pc.currentRemoteDescription) call.setRemote(data.answer);
        if (ENDED_STATUSES.includes(data.status)) call.end(data.status, false);
      }));
      call.unsubs.push(ref.collection(receiveSide).onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== "added" || !call.pc) return;
          const candidate = new RTCIceCandidate(change.doc.data());
          if (call.pc.remoteDescription) call.pc.addIceCandidate(candidate).catch(() => {});
          else call.pending.push(candidate);
        });
      }));
    };

    return call;
  }

  return {
    demo: false,
    me,
    // Real time: watching together counts after 5 real minutes.
    timeSpeed: 1,

    today: () => dayKey(),
    now: () => new Date(),

    init() {
      return usersCollection.doc(me.uid).set({ name: me.name, photo: me.photo, updatedAt: FieldValue.serverTimestamp() });
    },

    watchConnections(callback) {
      return connectionsCollection.where("members", "array-contains", me.uid).onSnapshot(
        (snapshot) => callback(snapshot.docs.map((doc) => toConnection(doc.id, doc.data()))),
        (error) => console.error("Couldn't load connections", error),
      );
    },

    watchMessages(conn, callback) {
      return connectionsCollection.doc(conn.id).collection("messages").orderBy("createdAt").limitToLast(200).onSnapshot(
        (snapshot) => callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate() ?? new Date() }))),
        (error) => console.error("Couldn't load messages", error),
      );
    },

    // A message also marks today as a day this person talked; the day counts once both have.
    sendMessage(conn, text) {
      const ref = connectionsCollection.doc(conn.id);
      const batch = db.batch();
      batch.set(ref.collection("messages").doc(), { from: me.uid, text, createdAt: FieldValue.serverTimestamp() });
      batch.update(ref, { [`messageDays.${dayKey()}`]: FieldValue.arrayUnion(me.uid) });
      return batch.commit();
    },

    watchPosts(callback) {
      return postsCollection.orderBy("createdAt", "desc").limit(150).onSnapshot(
        (snapshot) => callback(snapshot.docs.map(toPost)),
        (error) => console.error("Couldn't load posts", error),
      );
    },

    createPost({ text, image, video }) {
      return postsCollection.add({ uid: me.uid, name: me.name, text, image, video, heat: {}, commentCount: 0, createdAt: FieldValue.serverTimestamp() });
    },

    // Heat is stored on the post as { uid: name }.
    toggleHeat(post, on) {
      return postsCollection.doc(post.id).update({ [`heat.${me.uid}`]: on ? me.name : FieldValue.delete() });
    },

    watchComments(post, callback) {
      return postsCollection.doc(post.id).collection("comments").orderBy("createdAt").limit(200).onSnapshot(
        (snapshot) => callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate() ?? new Date() }))),
        (error) => console.error("Couldn't load comments", error),
      );
    },

    addComment(post, text) {
      const ref = postsCollection.doc(post.id);
      const batch = db.batch();
      batch.set(ref.collection("comments").doc(), { uid: me.uid, name: me.name, text, createdAt: FieldValue.serverTimestamp() });
      batch.update(ref, { commentCount: FieldValue.increment(1) });
      if (COMMENTS_COUNT_AS_TALKING && post.uid !== me.uid) {
        batch.update(connectionsCollection.doc(pairId(me.uid, post.uid)), { [`messageDays.${dayKey()}`]: FieldValue.arrayUnion(me.uid) });
      }
      return batch.commit();
    },

    async listPeople() {
      const snapshot = await usersCollection.limit(500).get();
      return snapshot.docs
        .filter((doc) => doc.id !== me.uid)
        .map((doc) => ({ uid: doc.id, name: doc.data().name, photo: doc.data().photo ?? "" }));
    },

    // Requesting again after a connection disappeared starts it over with a fresh history.
    requestConnection(other) {
      return connectionsCollection.doc(pairId(me.uid, other.uid)).set({
        members: [me.uid, other.uid].sort(),
        profiles: {
          [me.uid]: { name: me.name, photo: me.photo },
          [other.uid]: { name: other.name, photo: other.photo },
        },
        status: "pending",
        requestedBy: me.uid,
        startedDay: "",
        messageDays: {},
        callDays: {},
        togetherDays: {},
      });
    },

    respond(conn, accept) {
      const ref = connectionsCollection.doc(conn.id);
      return accept ? ref.update({ status: "active", startedDay: dayKey() }) : ref.delete();
    },

    letGo(conn) {
      return connectionsCollection.doc(conn.id).update({ status: "ended", endedDay: dayKey() });
    },

    async postsBy(uid) {
      const snapshot = await postsCollection.where("uid", "==", uid).limit(200).get();
      return snapshot.docs.map(toPost).sort((a, b) => b.createdAt - a.createdAt);
    },

    // Activities: one live room per host, with the host's shared state (playback or timer),
    // each person's own place in it, a chat, and notes for reading.

    watchRooms(callback) {
      return activitiesCollection.where("status", "==", "live").onSnapshot(
        (snapshot) => callback(snapshot.docs.map(toRoom).filter((room) => room.live)),
        (error) => console.error("Couldn't load activities", error),
      );
    },

    async startRoom({ type, title, service = "", url = "", items = [], timer = null }) {
      const ref = activitiesCollection.doc();
      await ref.set({
        type,
        host: me.uid,
        hostName: me.name,
        title,
        service,
        url,
        items,
        timer,
        status: "live",
        viewers: { [me.uid]: { name: me.name, seenAt: Date.now(), at: 0, done: [], task: "" } },
        playback: { playing: false, position: 0, updatedAt: Date.now() },
        hostSeenAt: Date.now(),
        startedAt: FieldValue.serverTimestamp(),
      });
      return ref.id;
    },

    endRoom(room) {
      return activitiesCollection.doc(room.id).update({ status: "ended" });
    },

    joinRoom(room) {
      return activitiesCollection.doc(room.id).update({ [`viewers.${me.uid}`]: { name: me.name, seenAt: Date.now(), at: 0, done: [], task: "" } });
    },

    leaveRoom(room) {
      return activitiesCollection.doc(room.id).update({ [`viewers.${me.uid}`]: FieldValue.delete() });
    },

    // Tabs check in every 30 seconds, so a closed tab drops out of the room on its own.
    async heartbeat(room) {
      const ref = activitiesCollection.doc(room.id);
      await ref.update({ [`viewers.${me.uid}.seenAt`]: Date.now() });
      if (room.host === me.uid) await ref.update({ hostSeenAt: Date.now() });
    },

    updateRoom(room, fields) {
      return activitiesCollection.doc(room.id).update(fields);
    },

    updateMe(room, fields) {
      const update = {};
      for (const [key, value] of Object.entries(fields)) update[`viewers.${me.uid}.${key}`] = value;
      return activitiesCollection.doc(room.id).update(update);
    },

    watchRoomChat(room, callback) {
      return activitiesCollection.doc(room.id).collection("chat").orderBy("createdAt").limitToLast(200).onSnapshot(
        (snapshot) => callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate() ?? new Date() }))),
        (error) => console.error("Couldn't load the room chat", error),
      );
    },

    sendRoomChat(room, text) {
      return activitiesCollection.doc(room.id).collection("chat").add({ uid: me.uid, name: me.name, text, createdAt: FieldValue.serverTimestamp() });
    },

    watchRoomNotes(room, callback) {
      return activitiesCollection.doc(room.id).collection("notes").orderBy("createdAt").limitToLast(300).onSnapshot(
        (snapshot) => callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate() ?? new Date() }))),
        (error) => console.error("Couldn't load notes", error),
      );
    },

    addRoomNote(room, { item, quote, text }) {
      return activitiesCollection.doc(room.id).collection("notes").add({ uid: me.uid, name: me.name, item, quote, text, createdAt: FieldValue.serverTimestamp() });
    },

    // Each person marks their own side; the day counts once both have.
    markTogether(otherUid) {
      return connectionsCollection.doc(pairId(me.uid, otherUid)).update({ [`togetherDays.${dayKey()}`]: FieldValue.arrayUnion(me.uid) });
    },

    startCall(conn, handlers) {
      const call = makeCall(callsCollection.doc(), conn, handlers, true);
      (async () => {
        try {
          await call.open("callerCandidates");
          const offer = await call.pc.createOffer();
          await call.pc.setLocalDescription(offer);
          await call.ref.set({
            connId: conn.id,
            from: me.uid,
            to: conn.other.uid,
            fromName: me.name,
            status: "ringing",
            offer: { type: offer.type, sdp: offer.sdp },
            createdAt: FieldValue.serverTimestamp(),
          });
          call.listen("calleeCandidates");
          handlers.onState("ringing");
          setTimeout(() => {
            if (!call.pc?.currentRemoteDescription) call.end("missed", true);
          }, RING_SECONDS * 1000);
        } catch (error) {
          console.error(error);
          call.end("failed", true);
        }
      })();
      return { hangUp: () => call.end(call.connectedAt ? "ended" : "missed", true) };
    },

    watchIncomingCalls(onRing, onStop) {
      return callsCollection.where("to", "==", me.uid).where("status", "==", "ringing").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "removed") {
            onStop(change.doc.id);
            return;
          }
          if (change.type !== "added") return;
          const data = change.doc.data();
          // Skip rings left behind by a tab that closed mid-call.
          const age = Date.now() - (data.createdAt?.toMillis() ?? Date.now());
          if (age > RING_SECONDS * 1000) return;
          const ref = change.doc.ref;
          onRing({
            id: ref.id,
            connId: data.connId,
            fromName: data.fromName,
            decline: () => ref.update({ status: "declined" }),
            accept: (handlers) => {
              const call = makeCall(ref, { id: data.connId }, handlers, false);
              (async () => {
                try {
                  await call.open("calleeCandidates");
                  await call.setRemote(data.offer);
                  const answer = await call.pc.createAnswer();
                  await call.pc.setLocalDescription(answer);
                  await ref.update({ answer: { type: answer.type, sdp: answer.sdp }, status: "live" });
                  call.listen("callerCandidates");
                } catch (error) {
                  console.error(error);
                  call.end("failed", true);
                }
              })();
              return { hangUp: () => call.end("ended", true) };
            },
          });
        });
      }, (error) => console.error("Couldn't listen for calls", error));
    },
  };
}
