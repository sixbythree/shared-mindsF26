// Body and hand gestures from the webcam with ml5 (bodyPose for arms, handPose for fingers).
//
// Gestures:
//   O       both arms up over your head, hands together, elbows out   -> sun (held)
//   rain    show the back of an open hand to the camera              -> rain (held)
//   sow     shake an OK sign (thumb and index touching, other fingers out) -> seeds fall (held)
//   chop    one flat hand swings down fast                            -> cut the selected plant
//   fist    close a hand and move it                                  -> drag the view
//   pinch   the same OK sign, held still for a moment                 -> select a plant / close
//
// Camera positions are mirrored and normalized: u is 0 at the left, v is 0 at the top.
// state.hands carries the same points mapped onto the screen, for the ghost hands.

const ML5_SRC = "https://unpkg.com/ml5@1.4.0/dist/ml5.min.js";

export const TUNING = {
  minConfidence: 0.3,
  oHold: 0.35,          // seconds the O must be held before the sun comes out
  oRelease: 0.35,       // seconds without the O before the sun goes
  swingWindow: 0.45,    // seconds a chop can take
  chopDistance: 0.9,    // shoulder widths a wrist must drop (body tracking)
  otherArmStill: 1.0,   // the other wrist moves less than this, in shoulder widths
  handChopDrop: 2.2,    // hand sizes the hand must drop (hand tracking, for when you're close)
  handChopWindow: 0.35, // seconds that drop can take
  handChopMin: 0.15,    // …and at least this share of the camera's height (edge-on hands look small)
  swingCooldown: 1.1,
  // Hands. A finger is curled when its tip is closer to the wrist than its middle joint
  // (tip/pip distance ratio below curledBelow), and straight above straightAbove.
  // Measured on real handPose output: open hands 1.22–1.37, a fist 0.66–0.80.
  curledBelow: 0.95,
  straightAbove: 1.1,
  pinchOn: 0.42,        // thumb tip to index tip, in hand sizes (wrist to middle knuckle)
  pinchOff: 0.62,
  // The OK sign does two things: held still it's a pinch, shaken it sows seeds.
  pinchHold: 0.3,       // seconds the OK sign is held still before it counts as a pinch
  pinchStill: 0.6,      // …moving less than this, in hand sizes
  shakeWindow: 0.7,     // seconds looked at for a shake
  shakeStep: 0.15,      // hand sizes the hand must travel before turning back
  shakeTurns: 2,        // turns back and forth needed in that time
  sowRelease: 0.4,      // seconds after the shaking stops that sowing ends
  sowEvery: 0.2,        // seconds between seeds while sowing
  // Back of the hand: how flat-on the hand must be (0 is edge-on, 1 is fully flat) and
  // how long it has to be shown before the rain starts or stops.
  backFlatness: 0.25,
  backHold: 0.3,
  backRelease: 0.35,
  handTimeout: 0.45,    // seconds a hand stays after it was last seen
  dragSmoothing: 0.55,  // 0..1, how much of each new fist position is used (lower is smoother)
  dragDeadZone: 0.0015, // fist movements smaller than this (share of the screen) are ignored
  // Gestures never overlap: after one ends (or a quick one fires), nothing new starts for this long.
  afterHeld: 0.45,      // after sun, rain, sowing or a fist drag
  afterQuick: 0.6,      // after a pinch or chop
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
    backShown: false,
    cursor: { x: 0.5, y: 0.5, visible: false, pinch: false, fist: false },
    label: "",
    bodySeen: false,
    handsSeen: 0,
    hands: [],        // [{ pts: [{x,y}] (21, screen 0..1), pinch, fist, open, back, alpha }]
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
  let sowHand = null;
  let lastSow = 0;
  // One gesture at a time. `active` is the held gesture running now ("sun", "rain", "sow"
  // or "drag"); while it runs, no other gesture can start. When any gesture ends or fires,
  // nothing new can start until `quietUntil`, so letting go of one doesn't trigger another.
  let active = null;
  let dragHand = null;
  let quietUntil = 0;
  const free = (t) => active === null && t >= quietUntil && oTime === 0;
  function endActive(t, quiet) {
    active = null;
    dragHand = null;
    sowHand = null;
    quietUntil = Math.max(quietUntil, t + quiet);
  }
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

  // A fast one-armed swing down (chop). A chop can come from body tracking or hand tracking. It fires when nothing else is
  // running, and it also cuts off rain that has started, since raising a flat hand to chop
  // often shows its back for a moment first.
  function chopAllowed(t) {
    if (t - lastSwing < TUNING.swingCooldown || state.sun || oTime > 0 || t - sunEndedAt < 0.8) return false;
    if (active !== null && active !== "rain") return false;
    if (active === null && t < quietUntil) return false;
    return !tracked.some((tr) => t - tr.t < 0.3 && (tr.fist || tr.pinchFired));
  }

  function tryChop(t, x) {
    if (!chopAllowed(t)) return false;
    if (active === "rain") endActive(t, 0);
    lastSwing = t;
    quietUntil = t + TUNING.afterQuick;
    emit("chop", { x });
    clearHist();
    for (const tr of tracked) tr.hist = [];
    return true;
  }

  function checkSwings(t) {
    if (t - lastSwing < TUNING.swingCooldown || t - sunEndedAt < 0.8) return;
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
      const { last, high } = a;
      const drop = (last.v - high.v) / sw;
      if (drop > TUNING.chopDistance && high.t < last.t && high.v < shoulderV + 0.1 * sw && last.v > shoulderV + 0.15 * sw) {
        if (tryChop(t, clamp01(toScreen(last).x))) return;
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
    return { pts, size, ratio, curled, straight, pinchD, thumbMeetsTip, middleStraight: ratio[1] > TUNING.straightAbove, palm, pinchAt, facing: facing(hand, pts) };
  }

  // Palm or back toward the camera. In the camera's own (unmirrored) image, a right hand with
  // its palm toward the camera has its index knuckle on the inner side of the pinky knuckle,
  // which makes this cross product negative; the back of the hand flips it, and a left hand
  // is the mirror image. Checked on real handPose output from photos of palms.
  // Which hand it is comes from the body model when a body wrist is close by (more reliable),
  // otherwise from handPose's own guess, which labels your right hand "Left" in an unmirrored image.
  // Returns 1 for the palm, -1 for the back, 0 when the hand is edge-on.
  function facing(hand, pts) {
    const kp = (n) => hand.keypoints.find((k) => k.name === n);
    const w = kp("wrist");
    const i = kp("index_finger_mcp");
    const k = kp("pinky_finger_mcp");
    const ax = i.x - w.x, ay = i.y - w.y, bx = k.x - w.x, by = k.y - w.y;
    const flat = (ax * by - ay * bx) / Math.max(1e-6, Math.hypot(ax, ay) * Math.hypot(bx, by));
    if (Math.abs(flat) < TUNING.backFlatness) return 0;
    let isRight = hand.handedness ? hand.handedness === "Left" : null;
    if (body && now() - bodyAt < 0.6) {
      const wr = mirror(w);
      const L = bodyPoint("left_wrist");
      const R = bodyPoint("right_wrist");
      const dL = L ? dist(L, wr) : Infinity;
      const dR = R ? dist(R, wr) : Infinity;
      if (Math.min(dL, dR) < 0.15) isRight = dR < dL;
    }
    if (isRight === null) return 0;
    const palm = isRight ? flat < 0 : flat > 0;
    return palm ? 1 : -1;
  }

  // Count turns back and forth in a run of positions (one axis), ignoring wobbles smaller than step.
  function turns(values, step) {
    let dir = 0;
    let ext = values[0];
    let n = 0;
    for (const x of values) {
      if (dir >= 0 && x <= ext - step) { if (dir === 1) n++; dir = -1; ext = x; }
      else if (dir <= 0 && x >= ext + step) { if (dir === -1) n++; dir = 1; ext = x; }
      else if ((dir === 1 && x > ext) || (dir === -1 && x < ext)) ext = x;
    }
    return n;
  }

  // Runs once per new handPose result.
  function gotHands(results) {
    const t = now();
    const seen = (results || []).filter((h) => h.keypoints && h.keypoints.length >= 21).map(readHand);
    const next = [];
    for (const info of seen) {
      // Match to the closest tracked hand from the last result.
      let best = null;
      // A fast hand can jump far between samples; with one hand in view, allow more.
      let bestD = seen.length === 1 ? 0.45 : 0.25;
      for (const tr of tracked) {
        if (next.includes(tr)) continue;
        const d = dist(tr.info.palm, info.palm);
        if (d < bestD) { bestD = d; best = tr; }
      }
      const tr = best || { pinch: false, fist: false, back: false, backSince: null, notBackSince: null, smooth: null, alpha: 0, lastPalm: null };

      // Back of an open hand toward the camera, held for a moment, brings rain.
      const pinchShape = info.pinchD < TUNING.pinchOn && info.thumbMeetsTip;
      const showingBack = info.facing === -1 && info.straight >= 3 && !pinchShape;
      if (showingBack) {
        tr.notBackSince = null;
        tr.backSince ??= t;
        if (!tr.back && t - tr.backSince > TUNING.backHold) tr.back = true;
      } else {
        tr.backSince = null;
        tr.notBackSince ??= t;
        if (tr.back && t - tr.notBackSince > TUNING.backRelease) tr.back = false;
      }

      // The OK sign: thumb meets the index tip while the middle finger stays out.
      if (!tr.pinch && !tr.fist && info.pinchD < TUNING.pinchOn && info.thumbMeetsTip && info.middleStraight) {
        tr.pinch = true;
        tr.okSince = t;
        tr.okStart = info.palm;
        tr.okHist = [];
        tr.shook = false;
      } else if (tr.pinch && info.pinchD > TUNING.pinchOff) {
        tr.pinch = false;
        tr.pinchFired = false;
        tr.shook = false;
        tr.lastShakeAt = null;
      }
      if (tr.pinch) {
        // Shaken: sow. Look for the hand turning back and forth.
        tr.okHist.push({ t, u: info.palm.u * aspect, v: info.palm.v });
        tr.okHist = tr.okHist.filter((h) => t - h.t <= TUNING.shakeWindow);
        const step = TUNING.shakeStep * info.size;
        const n = Math.max(turns(tr.okHist.map((h) => h.u), step), turns(tr.okHist.map((h) => h.v), step));
        if (n >= TUNING.shakeTurns) {
          tr.shook = true;
          tr.lastShakeAt = t;
        }
        // Held still: a pinch. Once it has shaken, the same OK sign won't also pinch.
        const moved = dist(tr.okStart, info.palm) / info.size;
        if (moved > TUNING.pinchStill) { tr.okSince = t; tr.okStart = info.palm; }
        if (!tr.shook && !tr.pinchFired && t - tr.okSince >= TUNING.pinchHold && free(t)) {
          tr.pinchFired = true;
          quietUntil = t + TUNING.afterQuick;
          const sp = screenHand(info);
          emit("pinch", { x: clamp01((sp[4].x + sp[8].x) / 2), y: clamp01((sp[4].y + sp[8].y) / 2) });
        }
      }

      // Fist: at least three fingers curled. Moving it drags the view.
      const wasFist = tr.fist;
      if (!tr.fist && info.curled >= 3) tr.fist = true;
      else if (tr.fist && info.straight >= 3) tr.fist = false;
      // Fist drag: follow a smoothed palm and ignore tiny jitter.
      if (active === "drag" && tr === dragHand && tr.fist && wasFist && tr.lastPalm) {
        const a = TUNING.dragSmoothing;
        const sm = { u: tr.lastPalm.u + (info.palm.u - tr.lastPalm.u) * a, v: tr.lastPalm.v + (info.palm.v - tr.lastPalm.v) * a };
        const p0 = toScreen(tr.lastPalm);
        const p1 = toScreen(sm);
        if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > TUNING.dragDeadZone) {
          onEvent("drag", { dx: p1.x - p0.x, dy: p1.y - p0.y });
          tr.lastPalm = sm;
        }
      } else {
        tr.lastPalm = tr.fist ? info.palm : null;
      }

      // Chop from hand tracking: the hand drops fast and mostly straight down.
      tr.hist = (tr.hist || []).filter((h) => t - h.t <= TUNING.handChopWindow);
      tr.hist.push({ t, u: info.pts[0].u, v: info.pts[0].v });
      if (!tr.fist && tr.hist.length >= 2) {
        let high = tr.hist[0];
        for (const h of tr.hist) if (h.v < high.v) high = h;
        const last = tr.hist[tr.hist.length - 1];
        const dv = last.v - high.v;
        const du = Math.abs(last.u - high.u) * aspect;
        if (high.t < last.t && dv > Math.max(TUNING.handChopMin, TUNING.handChopDrop * info.size) && du < dv * 0.9) {
          tryChop(t, clamp01(toScreen(last).x));
        }
      }

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
    // The O wins over everything: forming it stops rain or a drag.
    if (bodyFresh && checkO()) {
      if (active === "rain" || active === "drag" || active === "sow") endActive(t, 0);
      oTime += dt;
      oMissing = 0;
      if (!state.sun && oTime > TUNING.oHold && active === null && t >= quietUntil) {
        state.sun = true;
        active = "sun";
        emit("sun", { on: true });
      }
    } else {
      oTime = 0;
      if (state.sun) {
        oMissing += dt;
        if (oMissing > TUNING.oRelease) {
          state.sun = false;
          sunEndedAt = t;
          endActive(t, TUNING.afterHeld);
          onEvent("sun", { on: false });
        }
      }
    }
    state.oProgress = state.sun ? 1 : Math.min(1, oTime / TUNING.oHold);

    // Hands: smooth the points toward the latest sample and fade lost hands.
    tracked = tracked.filter((tr) => t - tr.t < TUNING.handTimeout);
    let anyBack = false;
    const k = Math.min(1, dt * 16);
    state.hands = tracked.map((tr) => {
      const target = screenHand(tr.info);
      if (!tr.smooth) tr.smooth = target.map((p) => ({ ...p }));
      tr.smooth.forEach((p, i) => { p.x += (target[i].x - p.x) * k; p.y += (target[i].y - p.y) * k; });
      const fresh = t - tr.t < 0.2;
      tr.alpha += ((fresh ? 1 : 0) - tr.alpha) * Math.min(1, dt * 8);
      if (fresh) {
        anyBack ||= tr.back;
      }
      return { pts: tr.smooth, pinch: tr.pinch, fist: tr.fist, open: tr.info.straight >= 3, back: tr.back, facing: tr.info.facing, alpha: tr.alpha };
    });
    state.handsSeen = tracked.filter((tr) => t - tr.t < 0.2).length;

    // Rain and fist drag: start only when free, and end when the hand lets go.
    const fresh = (tr) => t - tr.t < 0.25;
    if (active === "rain" && !tracked.some((tr) => fresh(tr) && tr.back)) endActive(t, TUNING.afterHeld);
    if (active === "drag" && !(dragHand && fresh(dragHand) && dragHand.fist && tracked.includes(dragHand))) endActive(t, TUNING.afterHeld);
    const shaking = (tr) => fresh(tr) && tr.pinch && tr.lastShakeAt !== null && tr.lastShakeAt !== undefined && t - tr.lastShakeAt < TUNING.sowRelease;
    if (active === "sow" && !(sowHand && tracked.includes(sowHand) && shaking(sowHand))) endActive(t, TUNING.afterHeld);
    if (free(t)) {
      const fistHand = tracked.find((tr) => fresh(tr) && tr.fist);
      const shaker = tracked.find(shaking);
      if (fistHand) {
        active = "drag";
        dragHand = fistHand;
        dragHand.lastPalm = null;
      } else if (shaker) {
        active = "sow";
        sowHand = shaker;
        lastSow = 0;
      } else if (anyBack) {
        active = "rain";
      }
    }
    // Sowing: seeds fall from between your fingers, a few a second.
    if (active === "sow" && t - lastSow >= TUNING.sowEvery) {
      lastSow = t;
      const sp = screenHand(sowHand.info);
      onEvent("sow", { x: clamp01((sp[4].x + sp[8].x) / 2), y: clamp01((sp[4].y + sp[8].y) / 2) });
    }
    // What each ghost hand shows is only the gesture that's actually running.
    for (let i = 0; i < state.hands.length; i++) {
      const tr = tracked[i];
      const h = state.hands[i];
      h.fist = active === "drag" && tr === dragHand;
      h.back = active === "rain" && tr.back;
      h.pinch = !!tr.pinchFired && active !== "sow";
      h.sow = active === "sow" && tr === sowHand;
    }
    state.active = active;
    state.backShown = active === "rain";
    state.rain += ((active === "rain" ? 1 : 0) - state.rain) * Math.min(1, dt * 2.5);

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
      state.cursor.pinch = !!first.pinchFired;
      state.cursor.fist = active === "drag" && first === dragHand;
    } else {
      state.cursor.visible = false;
    }

    if (state.sun) state.label = "O: the sun is out";
    else if (active === "rain") state.label = "Back of the hand: rain";
    else if (active === "sow") state.label = "Shaking: sowing seeds";
    else if (active === "drag") state.label = "Fist: dragging";
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
