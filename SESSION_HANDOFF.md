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
- Firestore collections: `charadesPlayers` (live leaderboard), `charadesRounds` (recent-rounds feed). Rules deployed 2026-10-21.
- Clock pauses while models are thinking.

## Run locally
```
cd "/Users/sammyoge/GitHub/nyu/semester 3/shared_minds"
python3 -m http.server 8000
```
Open http://localhost:8000. Each project is self-contained, so serving from its own folder also works.

## Next
See `docs/roadmap.md`.
