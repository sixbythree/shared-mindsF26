# Master Tracker — Shared Minds

## Done
- [x] 01 Bouncing Ball: canvas motion study
- [x] 02 Nano Banana 2: Replicate image generation and shared Firestore gallery (drag to arrange, maker names)
- [x] 03 Textual Charades (A06), 2026-10-21
  - [x] Game loop: secret word, 90s timer, clues, skip, 8-clue cap
  - [x] LLM guesser via Replicate (`openai/gpt-4o-mini`)
  - [x] Embedding board via Replicate (`multilingual-e5-large`): closer meaning = nearer the center
  - [x] Resolution slider: count, temperature, spread
  - [x] Block translated or transliterated clues (translate-then-check)
  - [x] Firebase live leaderboard and recent-rounds feed, plus Firestore rules
  - [x] Linked from the root index
  - [x] Six brand design (Inter Light, stone neutrals, brand colors per clue), light theme only
  - [x] Overlap-free guess placement; secret word shown only by the solved center marker
  - [x] Start card fits short browser windows
  - [x] Folder renamed to `a06_textual_charades/`; live on GitHub Pages
  - [x] Portfolio post on six-hq.com (/itp/semester-3/shared-minds/06-textual-charades) with an arrow to the live game
  - [x] Back link goes to the six-hq.com post
  - [x] Google sign-in (Firebase Auth); one leaderboard row per account; first names only, enforced by rules
  - [x] Players sharing a first name get different colors (leaderboard and feed)
  - [x] Scoring: clue points (5 → 1) × resolution multiplier (×3 at 1 → ×1 at 10); hottest resolution in the round counts
  - [x] Board centered in the space left of the leaderboard (desktop)
  - [x] Mobile: no page scroll; leaderboard as a slide-in panel (Players button)
  - [x] Water-ripple ring animation (off with reduced motion)

## In progress
- (none)

## Not started
- See `docs/roadmap.md`
