# Session Handoff — Shared Minds (NYU ITP, Fall 2026)

_Last updated: 2026-10-21_

## What this repo is
Weekly assignments for the Shared Minds class, published as a static site on GitHub Pages (`index.html` at the root links to each project). Shared backend: Firebase project `shared-mindsf26` (Firestore, rules in `firestore.rules`) and the ITP/IMA Replicate proxy (`https://itp-ima-replicate-proxy.web.app/api/create_n_get`).

## Projects
| # | Folder | Status |
|---|--------|--------|
| 01 | `bouncing_ball/` | Done |
| 02 | `nano_banana_2/` | Done: prompt → image, shared draggable Firestore gallery |
| 03 | `a06_textual_charades/` | Built 2026-10-21: Textual Charades (see below). Live: https://sixbythree.github.io/shared-mindsF26/a06_textual_charades/ |

## Current focus: A06 Textual Charades
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
