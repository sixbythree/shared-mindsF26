# Session Handoff — Shared Minds (NYU ITP, Fall 2026)

_Last updated: 2026-11-13_

## What this repo is
Weekly assignments for the Shared Minds class, published as a static site on GitHub Pages (`index.html` at the root links to each project). Shared backend: Firebase project `shared-mindsf26` (Firestore, rules in `firestore.rules`) and the ITP/IMA Replicate proxy (`https://itp-ima-replicate-proxy.web.app/api/create_n_get`).

## Projects
| # | Folder | Status |
|---|--------|--------|
| 01 | `bouncing_ball/` | Done |
| 02 | `nano_banana_2/` | Done: prompt → image, shared draggable Firestore gallery |
| 03 | `a04_triads/` | Built 2026-10-29: Triads (see below). Live: https://sixbythree.github.io/shared-mindsF26/a04_triads/ |
| 04 | `a05_100/` | Draft 2026-10-26: 100, a social app capped at 100 connections (see below) |
| 05 | `a06_textual_charades/` | Built 2026-10-21: Textual Charades (see below). Live: https://sixbythree.github.io/shared-mindsF26/a06_textual_charades/ |
| 06 | `a07_spatial/` | Built 2026-10-28: Decisions (see below). Live: https://sixbythree.github.io/shared-mindsF26/a07_spatial/ |
| 07 | `a08_human_nature/` | Built 2026-11-03: Human Nature (see below). Live: https://sixbythree.github.io/shared-mindsF26/a08_human_nature/ |
| 08 | `a09_black_point/` | Built 2026-11-13: Black Point (see below). Live: https://sixbythree.github.io/shared-mindsF26/a09_black_point/ |

## A09 Black Point (current focus)
- Interface Metaphor assignment. No-build page: `index.html`, `style.css`, `script.js` (flow, tone curves, drawing, results), `hand.js` (camera + ml5 1.4.0 handPose, palm size), `statements.js` (the ten statements).
- Lean = palm size (average of wrist→index/middle/pinky knuckles and index→pinky knuckle, over video height) against a calibrated resting hand (median over 1.5s). `LEAN` in `script.js`: all the way in at 1.6× the resting size, all the way out at 0.62×, 8% dead zone, 0.12s smoothing; no hand for 0.4s drifts back to neutral. Same `<video>` width/height fix as A08.
- Curves (`curveFor`, `lutFor`): leaning in moves the black point up and the white point down (`MAX_CRUSH` 0.42). Leaning out solarizes: points (0,0) → (p,1) → (1,0) with p = 1 + lean, so the brightest tones flip first and full lean is a negative. The straight slide to the inverse was dropped because it went flat gray halfway.
- Each statement lasts 6s (+0.9s gap); the answer is the mean lean over the last 3s, and that frame is saved (480×480). Results: the average of the ten LUTs is the filter (live view), the ten frames through their own curves averaged (Your ten, averaged), Color slider (saturation 0–100%), Save image (PNG), ten cards and a reading (counts, hardest in/out, yes vs. no strength).
- Without a camera, the arrow keys lean and a drawn figure stands in. Test params: `?answers=0.6,-0.4,…` (scripted leans, keys path, ticks on a timer for headless), `?seconds=`, `?camera=off`, `?view=average`, `?sat=`, `?debug` (`window.blackPoint`).
- Tested with headless Chrome over the DevTools protocol (a Node script in the session scratchpad): full scripted runs, results, averaged view, phone width, and the camera path with a fake webcam (ml5 and the hand model load, waits at calibration). **Not tried with a real hand yet.**
- Portfolio post: content/itp/semester-3/shared-minds/09-interface-metaphor.md (title 09 Black Point, notes image, five screenshots, square thumbnail, `live:` link). Written and built locally but **not committed**: the portfolio repo had unrelated uncommitted work (readings pages, build-itp changes).
- The HW 9 PDF stays local (ignored).

## A08 Human Nature
- No-build page: `index.html`, `style.css`, `script.js` (field, render loop, keyboard fallback), `plants.js` (species, growth rules, drawing), `gestures.js` (webcam + ml5 1.4.0, loaded only when the camera starts).
- ml5 without p5: `ml5.bodyPose()` / `ml5.handPose()` return promises and must be awaited. bodyPose is MoveNet SINGLEPOSE_LIGHTNING; handPose is `lite`, 2 hands. Positions are mirrored by hand (no `flipped`), with distances corrected for the camera's aspect ratio.
- Gestures: O over the head (held 0.35s) = sun; back of an open hand toward the camera, held 0.3s = rain (palm vs back from handedness, taken from the nearest body wrist when possible, plus knuckle order); one arm up fast = throw seeds; shake an OK sign = sow (seeds fall below the hand while shaking; the arm-swing throw was removed); one flat hand down fast = chop, from body or hand tracking (cuts off rain that just started); fist (3+ fingers curled) = drag the view (smoothed palm, dead zone, the view eases to `camTarget` and glides on release); pinch = the OK sign (thumb meets the index *tip*, middle finger out) held still 0.3s = select a plant and open its card, pinch again to close; a chop cuts only the selected plant (nothing selected = a hint, no cut). Thresholds are in `TUNING` at the top of `gestures.js`, calibrated on real handPose output from sample photos.
- **The `<video>` needs `width`/`height` attributes** (set after the stream starts) or handPose never finds a hand. This was why hand gestures didn't register at first.
- Hand gestures are computed once per new handPose result. Gestures are exclusive: one held gesture (`active`: sun, rain, drag) at a time, a quiet gap after any gesture (`afterHeld`, `afterQuick`), and the O overrides rain and drag.
- Ghost hands are drawn on the field (no arms, no mirror preview; they turn gold while you hold the O); hands are capped in size around the palm (`ghostHandSize`). `?debug` exposes `window.humanNature`.
- Tested: Node checks with real hand keypoints (12 pass) and headless Chrome with a fake webcam made from hand photos. Still not tried by a person on a real camera beyond the first report.
- Keyboard fallback: hold O sun, R rain; S throws seeds at the mouse; click a plant to select it (click again to close), C cuts the selected plant; drag to pan. Esc pauses (freezes the field, gestures ignored). "Show me" in the camera pill (or M) shows a mirrored webcam view in the corner for recording; remembered in localStorage `human-nature-mirror`. Keys with Cmd/Ctrl/Alt are left to the browser.
- Plants: 7 crops (tomato, pepper, eggplant, blueberry, strawberry, sunflower, pumpkin) and 4 weeds (dandelion, thistle, crabgrass, bindweed). Crops grow only in the sun, need water, flower, then fruit ripens in the sun. Barren chance 12% + thirst time. Weeds grow on water alone, drink from neighbours, spread. Pace numbers in `RULES` in `plants.js`.
- Field is 3 screens wide, saved to localStorage (`human-nature-field-v1`). `?speed=10` fast-forwards time for testing and demos.
- Farm game (2026-11-03): `farm.js` holds the profile (coins, seeds, fruit, owned farms, each farm's plants), prices, `LOCATIONS` and saving; `scenery.js` draws each location's view. Pinch a ripe plant to pick it (fruit + 2 seeds; 3 harvests then "spent"); sowing uses the chosen seed from the bag; point one finger up to open the seed picker (1–7 or click with a mouse); Market sells fruit; Farms buys/visits Seaside Cliffs (150), Mountain Valley (400), Lakeside (800), Desert Oasis (1500), each with its own field, view and dry/grow multipliers. Frozen while away.
- Saving: localStorage `human-nature-profile-v2` (migrates the old `human-nature-field-v1`); signed in with Google, also Firestore `humanNatureFarms/{uid}` as one JSON string (rules in `firestore.rules`, **not deployed yet**). The account's farm wins over the browser's when you sign in.
- Portfolio post: content/itp/semester-3/shared-minds/08-body.md (title 08 Human Nature, notes, three screenshots, square thumbnail, `live:` link).

## A04 Triads
- No-build page: `index.html`, `style.css`, `script.js`, `firebase-config.js`. Colors only (an images mode was built and then removed at the user's request).
- Piano C4–C6 (black keys drawn black, played keys light green), Web Audio synth. Computer keys A–' (black keys W E T Y U O P), Z/X octave, or tap. Holding three keys of a triad sets the chord.
- Each note shows a color in one of three frames, lowest on the left; hue comes from the circle of fifths (`colorFor`).
- Chord picker (root + major/minor/diminished/augmented), three buttons to play one inversion, and Play the set (all three inversions, then "The set, in silence": a slideshow of the three color orders, one at a time, with ← → buttons, arrow keys and dots).
- Save a set (name + chord) to localStorage and the Firestore `triadsSets` wall; click a wall card to load it. Rules for `triadsSets` are in `firestore.rules` but **not deployed** yet, so saves only stay in the browser.
- Portfolio post: content/itp/semester-3/shared-minds/04-time.md (title 04 Triads, `live:` link, square thumbnail 04-time-thumb.png). The "The idea" section still describes images.
- The HW 4 PDF stays local (ignored).

## A07 Decisions
- three.js 0.160 (importmap, no build). `world.js` builds the scene, styles and figure; `script.js` runs the game, judge and controls.
- World: hill, instanced trees, stream, climbable mountains (heightfield with contour lines), a cave at the foot of the left mountain with a low door (1.9) that only children fit through, a sun that crosses the sky over a lifetime.
- Two looks: Ink (default, black outlines on white like the sketch) and Watercolor; `?style=` or localStorage `decisions-style`.
- Figure is a 3D version of the user's sketch (round head, bell body, pod legs, thin arms). `growFigure(rig, growth)` reshapes it from baby to adult.
- Life starts at age 1, crawling; stages baby → toddler (2.5) → child (5) → teen (12) → adult (18), by how grown you are, not age. Childhood years pass at 0.12/s, adult years at 0.25/s; life ends at 90.
- Judge: `openai/gpt-4o-mini` via the Replicate proxy invents a hidden one-sentence creed, offers three objects a round, verdicts good / bad / end (end allowed from round 3).
- Good: lighter/faster (strength +0.3w, max 3.2), aging slower, unstuck, small growth head start. Bad: heavier (strength −0.22w, min 0.2), aging faster, stuck at current stage until a good choice.
- Controls: WASD/arrows walk, mouse drag turns and tilts the camera (up to the sky). Touch: hold one finger to walk forward, two to back up, drag to turn/look, tap to jump.
- Portfolio post: content/itp/semester-3/shared-minds/07-spatial.md in the portfolio repo (not deployed as of 2026-10-28).

## A05 100
- Social app capped at 100 connections. Each connection has a temperature from mutual engagement: an in-app call over 5 min, or messaging, on a given New York calendar day. Hot 6–7 of last 7 days, warm 3–5, cold 1–2; gone after 7 days with nothing, then neither person can reconnect for 30 days.
- All rule constants and day math live in `a05_100/rules.js`, shared by the interface (`script.js`), demo store (`store-demo.js`) and Firebase store (`store-firebase.js`).
- Posts (text/image/video link) with heat and comments; they don't count as engagement. Open switches in `rules.js`: `PUBLIC_HEAT`, `COMMENTS_COUNT_AS_TALKING`.
- Activities (`activities.js`, Firestore `hundredActivities`): Watch, Read, Study with anyone in your 100; 5 min together counts as a shared day (`ACTIVITIES_COUNT_AS_TALKING`).
- Demo mode: ~140 LLM-backed fake people and a Next day button, no sign-in needed.
- Firestore collections: `hundredUsers`, `hundredConnections` (+ `messages`), `hundredPosts` (+ `comments`), `hundredActivities` (+ `chat`, `notes`), `hundredCalls` (+ ICE candidates). Rules are in `firestore.rules`; deployment to `shared-mindsf26` not confirmed this session.
- `logo.svg` is force-added (the repo ignores `*.svg`). The HW 5 PDF stays local (ignored).

## A06 Textual Charades
- Player gets a secret word (90s game), types clues without saying it; `openai/gpt-4o-mini` guesses; guesses are placed on a radial board by `multilingual-e5-large` cosine similarity to the secret word.
- Resolution slider (1–10) → guess count (5–23), guesser temperature, board spread.
- Translated clues are blocked: each clue is translated to English by the LLM in parallel with guessing, then the "no saying the word" rule runs on the English.
- Firestore collections: `charadesPlayers` (live leaderboard, one row per Google account ID), `charadesRounds` (recent-rounds feed, records uid and resolution). Rules deployed 2026-10-21.
- Google sign-in (Firebase Auth, provider enabled; `sixbythree.github.io` authorized). Players show under their Google first name (rules enforce it); shared first names get different colors.
- Scoring: clue points (5 → 1) × resolution multiplier (×3 at 1 → ×1 at 10); the hottest resolution used in the round counts.
- Mobile: no page scroll; leaderboard is a slide-in panel. Board rings animate like water ripples.
- 367 secret words in `words.js`. On sign-in the game loads the player's played words from `charadesRounds` (by uid) and skips them until the list is exhausted.
- Clock pauses while models are thinking.
- Six brand design (light theme only). Live: https://sixbythree.github.io/shared-mindsF26/a06_textual_charades/
- Portfolio post: https://www.six-hq.com/itp/semester-3/shared-minds/06-textual-charades (source in the portfolio repo, `content/itp/semester-3/shared-minds/`). Only numbered assignments go in the portfolio; bouncing_ball and nano_banana_2 are classwork and stay out.

## Run locally
```
cd "/Users/sammyoge/GitHub/nyu/semester 3/shared_minds"
python3 -m http.server 8000
```
Open http://localhost:8000. Each project is self-contained, so serving from its own folder also works.

Pushing `main` deploys GitHub Pages (https://sixbythree.github.io/shared-mindsF26/).

## Next
See `docs/roadmap.md`.
