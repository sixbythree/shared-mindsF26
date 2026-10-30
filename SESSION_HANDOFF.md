# Session Handoff — Shared Minds (NYU ITP, Fall 2026)

_Last updated: 2026-10-29_

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

## A04 Triads (current focus)
- No-build page: `index.html`, `style.css`, `script.js`, `firebase-config.js`. Colors only (an images mode was built and then removed at the user's request).
- Piano C4–C6, Web Audio synth. Computer keys A–' (black keys W E T Y U O P), Z/X octave, or tap. Holding three keys of a triad sets the chord.
- Each note shows a color in one of three frames, lowest on the left; hue comes from the circle of fifths (`colorFor`).
- Chord picker (root + major/minor/diminished/augmented), three buttons to play one inversion, and Play the set (all three inversions, then "The set, in silence": the three color orders side by side).
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
