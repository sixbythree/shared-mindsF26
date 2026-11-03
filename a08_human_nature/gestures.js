// Body and hand gestures from the webcam with ml5 (bodyPose for arms, handPose for fingers).
//
// Gestures:
//   O       both arms up over your head, hands together, elbows out   -> sun (held)
//   drizzle open hand(s), fingers fluttering                          -> rain (held)
//   throw   one arm swings up fast                                    -> seeds
//   chop    one flat hand swings down fast                            -> cut a plant
//   fist    close a hand and move it                                  -> drag the view
//   pinch   thumb and index finger together                           -> what plant is this?
//
// All positions are mirrored and normalized: u is 0 at the left of the screen, v is 0 at the top.

const ML5_SRC = "https://unpkg.com/ml5@1.4.0/dist/ml5.min.js";

export const TUNING = {
  minConfidence: 0.3,
  oHold: 0.35,          // seconds the O must be held before the sun comes out
  oRelease: 0.35,       // seconds without the O before the sun goes
  swingWindow: 0.4,     // seconds a throw or chop can take
  chopDistance: 1.3,    // shoulder widths a wrist must drop
  throwDistance: 1.1,   // shoulder widths a wrist must rise
  otherArmStill: 0.7,   // the other wrist moves less than this, in shoulder widths
  swingCooldown: 1.1,
  throwWait: 0.25,      // seconds a throw waits in case it was the lift before a chop
  pinchOn: 0.32,        // thumb to index, in hand sizes
  pinchOff: 0.55,
  fistOn: 1.3,          // average fingertip to wrist, in hand sizes
  fistOff: 1.5,
  openHand: 1.55,
  drizzleOn: 0.09,      // finger flutter energy
  drizzleOff: 0.06,
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.ml5) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Couldn't load ml5."));
    document.head.appendChild(s);
  });
}

// u and v are normalized by width and height, so horizontal distances are scaled by the aspect ratio.
let aspect = 4 / 3;
const dist = (a, b) => Math.hypot((a.u - b.u) * aspect, a.v - b.v);

export function createGestures({ video, preview, onEvent, onStatus }) {
  const state = {
    ready: false,
    sun: false,
    rain: 0,          // 0..1
    cursor: { x: 0.5, y: 0.5, visible: false, pinch: false, fist: false },
    label: "",
    bodySeen: false,
    handsSeen: 0,
  };

  let vw = 640;
  let vh = 480;
  let body = null;
  let bodyAt = 0;
  let hands = [];
  let handsAt = 0;
  const wristHist = { left: [], right: [] };
  let oTime = 0;
  let oMissing = 0;
  let sunEndedAt = -10;
  let lastSwing = -10;
  let pendingThrow = null;
  let flutter = 0;
  let drizzleOn = false;
  const prevRel = [];
  const handFlags = [];
  let dragU = null;
  let dragV = null;
  let flash = { text: "", until: 0 };

  const now = () => performance.now() / 1000;
  const mirror = (kp) => ({ u: 1 - kp.x / vw, v: kp.y / vh, c: kp.confidence ?? kp.score ?? 1 });

  function bodyPoint(name) {
    if (!body) return null;
    const kp = body.keypoints.find((k) => k.name === name);
    if (!kp || (kp.confidence ?? 0) < TUNING.minConfidence) return null;
    return mirror(kp);
  }

  function emit(type, data = {}) {
    flash = { text: type, until: now() + 0.8 };
    onEvent(type, data);
  }

  function gotBody(results) {
    body = results && results[0] ? results[0] : null;
    bodyAt = now();
    if (!body) return;
    const t = bodyAt;
    for (const side of ["left", "right"]) {
      const w = bodyPoint(`${side}_wrist`);
      const h = wristHist[side];
      if (w) h.push({ t, u: w.u, v: w.v });
      while (h.length && t - h[0].t > 0.6) h.shift();
    }
    checkSwings(t);
  }

  function gotHands(results) {
    hands = results || [];
    handsAt = now();
  }

  // A fast one-armed swing up (throw) or down (chop).
  // A chop often starts with a quick lift, which looks like a throw, so a throw waits
  // a moment before it counts and a chop in that moment replaces it.
  function checkSwings(t) {
    if (pendingThrow && t - pendingThrow.at > TUNING.throwWait) {
      lastSwing = t;
      emit("throw", pendingThrow);
      pendingThrow = null;
    }
    if (t - lastSwing < TUNING.swingCooldown || state.sun || t - sunEndedAt < 0.8) return;
    const ls = bodyPoint("left_shoulder");
    const rs = bodyPoint("right_shoulder");
    if (!ls || !rs) return;
    const sw = Math.max(0.05, dist(ls, rs));
    const shoulderV = (ls.v + rs.v) / 2;

    const travel = (h) => {
      const last = h[h.length - 1];
      const win = h.filter((s) => last && last.t - s.t <= TUNING.swingWindow);
      if (win.length < 3) return null;
      let high = win[0];
      let low = win[0];
      for (const s of win) {
        if (s.v < high.v) high = s;
        if (s.v > low.v) low = s;
      }
      return { last, high, low, range: (low.v - high.v) / sw };
    };

    const L = travel(wristHist.left);
    const R = travel(wristHist.right);
    for (const [a, b] of [[L, R], [R, L]]) {
      if (!a) continue;
      if (b && b.range > TUNING.otherArmStill) continue;
      const { last, high, low } = a;
      const drop = (last.v - high.v) / sw;
      const rise = (low.v - last.v) / sw;
      if (drop > TUNING.chopDistance && high.t < last.t && high.v < shoulderV && last.v > shoulderV + 0.3 * sw) {
        pendingThrow = null;
        lastSwing = t;
        emit("chop", { x: last.u });
        clearHist();
        return;
      }
      if (!pendingThrow && rise > TUNING.throwDistance && low.t < last.t && low.v > shoulderV && last.v < shoulderV - 0.1 * sw) {
        pendingThrow = { at: t, x: last.u, from: low.u };
        return;
      }
    }
  }

  function clearHist() {
    wristHist.left.length = 0;
    wristHist.right.length = 0;
  }

  function checkO() {
    const nose = bodyPoint("nose");
    const lw = bodyPoint("left_wrist");
    const rw = bodyPoint("right_wrist");
    const le = bodyPoint("left_elbow");
    const re = bodyPoint("right_elbow");
    const ls = bodyPoint("left_shoulder");
    const rs = bodyPoint("right_shoulder");
    if (!lw || !rw || !le || !re || !ls || !rs) return false;
    const sw = Math.max(0.05, dist(ls, rs));
    const shoulderV = (ls.v + rs.v) / 2;
    const top = nose ? nose.v : shoulderV - sw * 0.6;
    const handsUp = lw.v < top && rw.v < top;
    const handsTogether = dist(lw, rw) < sw * 0.9;
    const elbowsUp = le.v < shoulderV && re.v < shoulderV;
    const elbowsOut = Math.abs(le.u - re.u) * aspect > sw * 1.05;
    return handsUp && handsTogether && elbowsUp && elbowsOut;
  }

  function handInfo(hand) {
    const get = (name) => mirror(hand[name] ? { x: hand[name].x, y: hand[name].y } : hand.keypoints.find((k) => k.name === name));
    const wrist = get("wrist");
    const mid = get("middle_finger_mcp");
    const size = Math.max(0.01, dist(wrist, mid));
    const tips = ["index_finger_tip", "middle_finger_tip", "ring_finger_tip", "pinky_finger_tip"].map(get);
    const thumb = get("thumb_tip");
    const index = tips[0];
    const reach = tips.reduce((s, p) => s + dist(p, wrist), 0) / tips.length / size;
    const pinchD = dist(thumb, index) / size;
    const middleOut = dist(tips[1], wrist) / size;
    const palm = {
      u: (wrist.u + mid.u + get("index_finger_mcp").u + get("pinky_finger_mcp").u) / 4,
      v: (wrist.v + mid.v + get("index_finger_mcp").v + get("pinky_finger_mcp").v) / 4,
    };
    const rel = tips.map((p) => ({ u: ((p.u - wrist.u) * aspect) / size, v: (p.v - wrist.v) / size }));
    return { wrist, size, tips, thumb, index, reach, pinchD, middleOut, palm, rel };
  }

  // Called every animation frame from the main loop.
  function update(dt) {
    const t = now();
    const bodyFresh = body && t - bodyAt < 0.6;
    state.bodySeen = !!bodyFresh;

    // Sun: hold an O over your head.
    if (bodyFresh && checkO()) {
      oTime += dt;
      oMissing = 0;
      if (!state.sun && oTime > TUNING.oHold) {
        state.sun = true;
        pendingThrow = null;
        emit("sun", { on: true });
      }
    } else {
      oTime = 0;
      if (state.sun) {
        oMissing += dt;
        if (oMissing > TUNING.oRelease) {
          state.sun = false;
          sunEndedAt = t;
          onEvent("sun", { on: false });
        }
      }
    }

    // Hands: pinch, fist drag, drizzle.
    const handsFresh = t - handsAt < 0.5 ? hands : [];
    state.handsSeen = handsFresh.length;
    let maxFlutter = 0;
    let cursorHand = null;
    let anyFist = false;
    handsFresh.forEach((hand, i) => {
      let info;
      try { info = handInfo(hand); } catch { return; }
      const flags = handFlags[i] || (handFlags[i] = { pinch: false, fist: false });

      // Pinch with the other fingers out.
      if (!flags.pinch && info.pinchD < TUNING.pinchOn && info.middleOut > 1.4) {
        flags.pinch = true;
        emit("pinch", { x: (info.thumb.u + info.index.u) / 2, y: (info.thumb.v + info.index.v) / 2 });
      } else if (flags.pinch && info.pinchD > TUNING.pinchOff) {
        flags.pinch = false;
      }

      if (!flags.fist && info.reach < TUNING.fistOn) flags.fist = true;
      else if (flags.fist && info.reach > TUNING.fistOff) flags.fist = false;

      if (flags.fist) {
        anyFist = true;
        if (dragU !== null && i === 0) onEvent("drag", { dx: info.palm.u - dragU, dy: info.palm.v - dragV });
        if (i === 0) { dragU = info.palm.u; dragV = info.palm.v; }
      }

      // Flutter: how much the fingertips move relative to the wrist, frame to frame.
      // Only open hands count, and only against the last open frame.
      const open = info.reach > TUNING.openHand;
      const prev = prevRel[i];
      if (prev && open) {
        let d = 0;
        for (let k = 0; k < 4; k++) d += Math.hypot(info.rel[k].u - prev[k].u, info.rel[k].v - prev[k].v);
        maxFlutter = Math.max(maxFlutter, d / 4);
      }
      prevRel[i] = open ? info.rel : null;

      if (!cursorHand) cursorHand = { info, flags };
    });
    for (let i = handsFresh.length; i < prevRel.length; i++) prevRel[i] = null;
    if (!anyFist) { dragU = null; dragV = null; }

    flutter += (maxFlutter - flutter) * Math.min(1, dt * 6);
    if (!drizzleOn && flutter > TUNING.drizzleOn) drizzleOn = true;
    else if (drizzleOn && flutter < TUNING.drizzleOff) drizzleOn = false;
    state.rain += ((drizzleOn ? 1 : 0) - state.rain) * Math.min(1, dt * 2.5);
    state.flutter = flutter;

    if (cursorHand) {
      const { info, flags } = cursorHand;
      const target = flags.fist ? info.palm : { u: (info.thumb.u + info.index.u) / 2, v: (info.thumb.v + info.index.v) / 2 };
      const k = Math.min(1, dt * 14);
      state.cursor.x += (toScreen(target.u) - state.cursor.x) * k;
      state.cursor.y += (toScreenV(target.v) - state.cursor.y) * k;
      state.cursor.visible = true;
      state.cursor.pinch = flags.pinch;
      state.cursor.fist = flags.fist;
    } else {
      state.cursor.visible = false;
    }

    if (state.sun) state.label = "O: the sun is out";
    else if (drizzleOn) state.label = "Drizzle: rain";
    else if (anyFist) state.label = "Fist: dragging";
    else if (t < flash.until) state.label = flash.text;
    else if (oTime > 0) state.label = "Hold the O…";
    else state.label = bodyFresh || handsFresh.length ? "Watching" : "Step into view";

    drawPreview(handsFresh);
  }

  function drawPreview(handsFresh) {
    if (!preview) return;
    const ctx = preview.getContext("2d");
    const w = preview.width;
    const h = preview.height;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    if (video.readyState >= 2) ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    ctx.fillStyle = "rgba(20,30,20,0.25)";
    ctx.fillRect(0, 0, w, h);

    const P = (p) => [p.u * w, p.v * h];
    if (body && state.bodySeen) {
      const pairs = [["left_shoulder", "right_shoulder"], ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"], ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"], ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"], ["left_hip", "right_hip"]];
      ctx.strokeStyle = state.sun ? "#ffd24a" : "#bff0a8";
      ctx.lineWidth = 2;
      for (const [a, b] of pairs) {
        const A = bodyPoint(a);
        const B = bodyPoint(b);
        if (!A || !B) continue;
        ctx.beginPath();
        ctx.moveTo(...P(A));
        ctx.lineTo(...P(B));
        ctx.stroke();
      }
      const nose = bodyPoint("nose");
      if (nose) {
        ctx.beginPath();
        ctx.arc(...P(nose), 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#ffffff";
    for (const hand of handsFresh) {
      for (const kp of hand.keypoints) {
        const m = mirror(kp);
        ctx.fillRect(m.u * w - 1.5, m.v * h - 1.5, 3, 3);
      }
    }
  }

  async function start() {
    onStatus("Asking for the camera…");
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
    video.srcObject = stream;
    await video.play();
    vw = video.videoWidth || 640;
    vh = video.videoHeight || 480;
    aspect = vw / vh;
    onStatus("Loading ml5…");
    await loadScript(ML5_SRC);
    onStatus("Loading the body model…");
    // Without p5, ml5 returns a promise for each model.
    const bodyPose = await ml5.bodyPose("MoveNet", { modelType: "SINGLEPOSE_LIGHTNING", enableSmoothing: true });
    if (bodyPose.ready) await bodyPose.ready;
    onStatus("Loading the hand model…");
    const handPose = await ml5.handPose({ maxHands: 2, modelType: "lite", flipped: false });
    if (handPose.ready) await handPose.ready;
    bodyPose.detectStart(video, gotBody);
    handPose.detectStart(video, gotHands);
    state.ready = true;
    onStatus("");
  }

  return { state, start, update };
}

// The camera sees less than the whole screen, so the middle of the frame maps to all of it.
function toScreen(u) {
  return Math.max(0, Math.min(1, (u - 0.15) / 0.7));
}
function toScreenV(v) {
  return Math.max(0, Math.min(1, (v - 0.1) / 0.75));
}
export { toScreen };
