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
// Camera positions are mirrored and normalized: u is 0 at the left, v is 0 at the top.
// state.hands and state.arms carry the same points mapped onto the screen, for the ghost hands.

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
  // Hands. A finger is curled when its tip is closer to the wrist than its middle joint
  // (tip/pip distance ratio below curledBelow), and straight above straightAbove.
  // Measured on real handPose output: open hands 1.22–1.37, a fist 0.66–0.80.
  curledBelow: 0.95,
  straightAbove: 1.1,
  pinchOn: 0.42,        // thumb tip to index tip, in hand sizes (wrist to middle knuckle)
  pinchOff: 0.62,
  drizzleOn: 1.8,       // fingertip flutter, hand sizes per second
  drizzleOff: 1.1,
  handTimeout: 0.45,    // seconds a hand stays after it was last seen
  ghostHandSize: 0.1,   // largest drawn hand, wrist to middle knuckle, as a share of the screen
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

const FINGERS = ["index_finger", "middle_finger", "ring_finger", "pinky_finger"];

export function createGestures({ video, onEvent, onStatus, view }) {
  const state = {
    ready: false,
    sun: false,
    rain: 0,          // 0..1
    flutter: 0,
    cursor: { x: 0.5, y: 0.5, visible: false, pinch: false, fist: false },
    label: "",
    bodySeen: false,
    handsSeen: 0,
    hands: [],        // [{ pts: [{x,y}] (21, screen 0..1), pinch, fist, open, drizzle, alpha, size }]
    arms: null,       // { nose, ls, rs, le, re, lw, rw } in screen 0..1, or null
    oProgress: 0,
  };

  let vw = 640;
  let vh = 480;
  let body = null;
  let bodyAt = 0;
  const wristHist = { left: [], right: [] };
  let oTime = 0;
  let oMissing = 0;
  let sunEndedAt = -10;
  let lastSwing = -10;
  let pendingThrow = null;
  let drizzleOn = false;
  let flash = { text: "", until: 0 };
  // Tracked hands, matched between frames by where they are.
  let tracked = [];

  const now = () => performance.now() / 1000;
  const mirror = (kp) => ({ u: 1 - kp.x / vw, v: kp.y / vh });

  // Camera to screen with one scale for both axes (no stretching): the middle of the
  // camera frame fills the screen, so you don't have to reach the edges.
  function toScreen(p) {
    const { w, h } = view();
    const s = Math.max(w / (0.72 * vw), h / (0.8 * vh));
    return {
      x: (w / 2 + (p.u * vw - vw / 2) * s) / w,
      y: (h / 2 + (p.v * vh - vh / 2) * s) / h,
    };
  }
  const clamp01 = (n) => Math.max(0, Math.min(1, n));

  // A hand's 21 points on screen. Hands close to the camera would cover the field, so the
  // drawn hand is shrunk around the palm to at most a set size; it still moves with you.
  function screenHand(info) {
    const { w, h } = view();
    const pts = info.pts.map(toScreen);
    const palmIdx = [0, 5, 9, 17];
    const cx = palmIdx.reduce((a, i) => a + pts[i].x, 0) / 4;
    const cy = palmIdx.reduce((a, i) => a + pts[i].y, 0) / 4;
    const sizePx = Math.hypot((pts[0].x - pts[9].x) * w, (pts[0].y - pts[9].y) * h);
    const cap = Math.min(w, h) * TUNING.ghostHandSize;
    const k = sizePx > cap ? cap / sizePx : 1;
    return pts.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
  }

  function bodyPoint(name) {
    if (!body) return null;
    const kp = body.keypoints.find((k) => k.name === name);
    if (!kp || (kp.confidence ?? 0) < TUNING.minConfidence) return null;
    return mirror(kp);
  }

  function emit(type, data = {}) {
    flash = { text: type, until: now() + 0.9 };
    onEvent(type, data);
  }

  // ---------- body ----------

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
        emit("chop", { x: clamp01(toScreen(last).x) });
        clearHist();
        return;
      }
      if (!pendingThrow && rise > TUNING.throwDistance && low.t < last.t && low.v > shoulderV && last.v < shoulderV - 0.1 * sw) {
        pendingThrow = { at: t, x: clamp01(toScreen(last).x), from: clamp01(toScreen(low).x) };
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

  // ---------- hands ----------

  function readHand(hand) {
    const pts = hand.keypoints.map(mirror);
    const by = {};
    hand.keypoints.forEach((k, i) => { by[k.name] = pts[i]; });
    const wrist = by.wrist;
    const size = Math.max(0.005, dist(wrist, by.middle_finger_mcp));
    const ratio = FINGERS.map((f) => dist(by[`${f}_tip`], wrist) / Math.max(1e-4, dist(by[`${f}_pip`], wrist)));
    const curled = ratio.filter((r) => r < TUNING.curledBelow).length;
    const straight = ratio.filter((r) => r > TUNING.straightAbove).length;
    const pinchD = dist(by.thumb_tip, by.index_finger_tip) / size;
    // In a flat hand the thumb rests against the side of the index finger, near its middle
    // joints. In a pinch it meets the fingertip, so the tip has to be the closest part.
    const thumbMeetsTip = pinchD < dist(by.thumb_tip, by.index_finger_dip) / size && pinchD < 0.8 * (dist(by.thumb_tip, by.index_finger_pip) / size);
    const palm = {
      u: (wrist.u + by.index_finger_mcp.u + by.middle_finger_mcp.u + by.pinky_finger_mcp.u) / 4,
      v: (wrist.v + by.index_finger_mcp.v + by.middle_finger_mcp.v + by.pinky_finger_mcp.v) / 4,
    };
    const pinchAt = { u: (by.thumb_tip.u + by.index_finger_tip.u) / 2, v: (by.thumb_tip.v + by.index_finger_tip.v) / 2 };
    // Fingertips relative to the wrist, in hand sizes, for flutter.
    const rel = FINGERS.map((f) => ({ u: ((by[`${f}_tip`].u - wrist.u) * aspect) / size, v: (by[`${f}_tip`].v - wrist.v) / size }));
    return { pts, size, ratio, curled, straight, pinchD, thumbMeetsTip, middleStraight: ratio[1] > TUNING.straightAbove, palm, pinchAt, rel };
  }

  // Runs once per new handPose result, so speeds are measured between real samples.
  function gotHands(results) {
    const t = now();
    const seen = (results || []).filter((h) => h.keypoints && h.keypoints.length >= 21).map(readHand);
    const next = [];
    for (const info of seen) {
      // Match to the closest tracked hand from the last result.
      let best = null;
      let bestD = 0.25;
      for (const tr of tracked) {
        if (next.includes(tr)) continue;
        const d = dist(tr.info.palm, info.palm);
        if (d < bestD) { bestD = d; best = tr; }
      }
      const tr = best || { pinch: false, fist: false, flutter: 0, smooth: null, alpha: 0, lastPalm: null };
      const dt = best ? Math.max(1 / 60, t - tr.t) : 0;

      if (best && dt < 0.4) {
        let d = 0;
        for (let k = 0; k < 4; k++) d += Math.hypot(info.rel[k].u - tr.info.rel[k].u, info.rel[k].v - tr.info.rel[k].v);
        const speed = info.straight >= 3 && tr.info.straight >= 3 ? d / 4 / dt : 0;
        tr.flutter += (speed - tr.flutter) * Math.min(1, dt * 5);
      } else {
        tr.flutter = 0;
      }

      // Pinch: thumb and index together while the middle finger stays out.
      if (!tr.pinch && !tr.fist && info.pinchD < TUNING.pinchOn && info.thumbMeetsTip && info.middleStraight) {
        tr.pinch = true;
        const sp = screenHand(info);
        emit("pinch", { x: clamp01((sp[4].x + sp[8].x) / 2), y: clamp01((sp[4].y + sp[8].y) / 2) });
      } else if (tr.pinch && info.pinchD > TUNING.pinchOff) {
        tr.pinch = false;
      }

      // Fist: at least three fingers curled. Moving it drags the view.
      const wasFist = tr.fist;
      if (!tr.fist && info.curled >= 3) tr.fist = true;
      else if (tr.fist && info.straight >= 3) tr.fist = false;
      if (tr.fist && wasFist && tr.lastPalm) {
        const a = toScreen(tr.lastPalm);
        const b = toScreen(info.palm);
        onEvent("drag", { dx: b.x - a.x, dy: b.y - a.y });
      }
      tr.lastPalm = tr.fist ? info.palm : null;

      tr.info = info;
      tr.t = t;
      tr.lost = false;
      next.push(tr);
    }
    // Keep unmatched hands for a moment so they fade instead of blinking out.
    for (const tr of tracked) if (!next.includes(tr) && t - tr.t < TUNING.handTimeout) { tr.lost = true; next.push(tr); }
    tracked = next;
  }

  // ---------- every animation frame ----------

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
    state.oProgress = state.sun ? 1 : Math.min(1, oTime / TUNING.oHold);

    // Arms for the ghost.
    if (bodyFresh) {
      const pick = (n) => { const p = bodyPoint(n); return p ? toScreen(p) : null; };
      state.arms = { nose: pick("nose"), ls: pick("left_shoulder"), rs: pick("right_shoulder"), le: pick("left_elbow"), re: pick("right_elbow"), lw: pick("left_wrist"), rw: pick("right_wrist") };
    } else {
      state.arms = null;
    }

    // Hands: smooth the points toward the latest sample and fade lost hands.
    tracked = tracked.filter((tr) => t - tr.t < TUNING.handTimeout);
    let maxFlutter = 0;
    let anyFist = false;
    let anyPinch = false;
    const k = Math.min(1, dt * 16);
    state.hands = tracked.map((tr) => {
      const target = screenHand(tr.info);
      if (!tr.smooth) tr.smooth = target.map((p) => ({ ...p }));
      tr.smooth.forEach((p, i) => { p.x += (target[i].x - p.x) * k; p.y += (target[i].y - p.y) * k; });
      const fresh = t - tr.t < 0.2;
      tr.alpha += ((fresh ? 1 : 0) - tr.alpha) * Math.min(1, dt * 8);
      if (fresh) {
        maxFlutter = Math.max(maxFlutter, tr.flutter);
        anyFist ||= tr.fist;
        anyPinch ||= tr.pinch;
      }
      const sizePx = Math.hypot(tr.smooth[0].x - tr.smooth[9].x, (tr.smooth[0].y - tr.smooth[9].y) * (view().h / view().w));
      return { pts: tr.smooth, pinch: tr.pinch, fist: tr.fist, open: tr.info.straight >= 3, drizzle: drizzleOn && tr.flutter > TUNING.drizzleOff, alpha: tr.alpha, size: sizePx, flutter: tr.flutter };
    });
    state.handsSeen = tracked.filter((tr) => t - tr.t < 0.2).length;

    state.flutter += (maxFlutter - state.flutter) * Math.min(1, dt * 6);
    if (!drizzleOn && state.flutter > TUNING.drizzleOn) drizzleOn = true;
    else if (drizzleOn && state.flutter < TUNING.drizzleOff) drizzleOn = false;
    state.rain += ((drizzleOn ? 1 : 0) - state.rain) * Math.min(1, dt * 2.5);

    // The cursor sits between the thumb and index finger of the first hand.
    const first = tracked.find((tr) => t - tr.t < 0.3);
    if (first) {
      const sp = screenHand(first.info);
      const p = first.fist
        ? { x: (sp[0].x + sp[5].x + sp[9].x + sp[17].x) / 4, y: (sp[0].y + sp[5].y + sp[9].y + sp[17].y) / 4 }
        : { x: (sp[4].x + sp[8].x) / 2, y: (sp[4].y + sp[8].y) / 2 };
      const kc = Math.min(1, dt * 14);
      state.cursor.x += (clamp01(p.x) - state.cursor.x) * kc;
      state.cursor.y += (clamp01(p.y) - state.cursor.y) * kc;
      state.cursor.visible = true;
      state.cursor.pinch = first.pinch;
      state.cursor.fist = first.fist;
    } else {
      state.cursor.visible = false;
    }

    if (state.sun) state.label = "O: the sun is out";
    else if (drizzleOn) state.label = "Drizzle: rain";
    else if (anyFist) state.label = "Fist: dragging";
    else if (anyPinch) state.label = "Pinch";
    else if (t < flash.until) state.label = flash.text[0].toUpperCase() + flash.text.slice(1);
    else if (oTime > 0) state.label = "Hold the O…";
    else if (bodyFresh || state.handsSeen) state.label = `Watching${state.handsSeen ? ` · ${state.handsSeen} hand${state.handsSeen > 1 ? "s" : ""}` : ""}`;
    else state.label = "Step into view";
  }

  async function start() {
    onStatus("Asking for the camera…");
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
    video.srcObject = stream;
    await video.play();
    vw = video.videoWidth || 640;
    vh = video.videoHeight || 480;
    aspect = vw / vh;
    // handPose reads the element's width and height attributes, not the stream's size.
    // Left unset they're 0 and it never finds a hand. (CSS still keeps the element tiny.)
    video.width = vw;
    video.height = vh;
    onStatus("Loading ml5…");
    await loadScript(ML5_SRC);
    // Without p5, ml5 returns a promise for each model.
    onStatus("Loading the body model…");
    const bodyPose = await ml5.bodyPose("MoveNet", { modelType: "SINGLEPOSE_LIGHTNING", enableSmoothing: true });
    if (bodyPose.ready) await bodyPose.ready;
    onStatus("Loading the hand model…");
    const handPose = await ml5.handPose({ maxHands: 2, modelType: "full", flipped: false });
    if (handPose.ready) await handPose.ready;
    bodyPose.detectStart(video, gotBody);
    handPose.detectStart(video, gotHands);
    state.ready = true;
    onStatus("");
  }

  return { state, start, update };
}

// Bones of the hand, by keypoint index (wrist 0, thumb 1–4, index 5–8, middle 9–12, ring 13–16, pinky 17–20).
export const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [17, 18], [18, 19], [19, 20],
];
export const PALM = [0, 1, 5, 9, 13, 17];
