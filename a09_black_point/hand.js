// Webcam and hand tracking with ml5 handPose.
// How far your hand leans in or out is read from how big your palm looks to the camera:
// closer to the lens it looks bigger, farther away it looks smaller.

const ML5_SRC = "https://unpkg.com/ml5@1.4.0/dist/ml5.min.js";

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

// Opens the camera into the <video> element. Resolves with false if there's no camera or it's refused.
export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    // A stream that never starts shouldn't hold the app up.
    await Promise.race([
      video.play(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("The camera didn't start.")), 8000)),
    ]);
    // handPose reads the element's width and height attributes, not the stream's size.
    // Left unset they're 0 and it never finds a hand.
    video.width = video.videoWidth || 640;
    video.height = video.videoHeight || 480;
    return true;
  } catch (err) {
    console.warn("No camera:", err);
    return false;
  }
}

// Palm size: the average of four distances across the palm (wrist to the index, middle and pinky
// knuckles, and index knuckle to pinky knuckle), as a share of the video's height. Using several
// distances keeps it steady when the hand tilts.
export function palmSize(keypoints, videoHeight) {
  const k = keypoints;
  if (!k || k.length < 21) return 0;
  const d = (a, b) => Math.hypot(k[a].x - k[b].x, k[a].y - k[b].y);
  return (d(0, 5) + d(0, 9) + d(0, 17) + d(5, 17)) / 4 / videoHeight;
}

export function createHand(video) {
  const state = {
    ready: false,
    found: false, // a hand is in view right now
    size: 0, // latest palm size
    lastSeen: -Infinity, // performance.now() of the last hand
    center: null, // palm center in the mirrored image, 0–1
  };

  function gotHands(results) {
    const now = performance.now();
    // The biggest hand wins (the one nearest the camera).
    let best = null;
    let bestSize = 0;
    for (const hand of results || []) {
      if ((hand.confidence ?? 1) < 0.5) continue;
      const size = palmSize(hand.keypoints, video.height || 480);
      if (size > bestSize) {
        best = hand;
        bestSize = size;
      }
    }
    if (best) {
      state.found = true;
      state.size = bestSize;
      state.lastSeen = now;
      const k = best.keypoints;
      const cx = (k[0].x + k[5].x + k[17].x) / 3;
      const cy = (k[0].y + k[5].y + k[17].y) / 3;
      state.center = { u: 1 - cx / (video.width || 640), v: cy / (video.height || 480) };
    } else {
      state.found = false;
    }
  }

  async function start(onStatus = () => {}) {
    onStatus("Loading ml5…");
    await loadScript(ML5_SRC);
    onStatus("Loading the hand model…");
    // Without p5, ml5 returns a promise for the model.
    const handPose = await ml5.handPose({ maxHands: 2, modelType: "full", flipped: false });
    if (handPose.ready) await handPose.ready;
    handPose.detectStart(video, gotHands);
    state.ready = true;
    onStatus("");
  }

  return { state, start };
}
