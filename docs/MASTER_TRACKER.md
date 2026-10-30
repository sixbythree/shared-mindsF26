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
  - [x] 367-word list (`words.js`); per-player no-repeat history from saved rounds
  - [x] Fairer clue check for short secret words ("giant" allowed for ant)
- [x] Triads (A04), 2026-10-29, in `a04_triads/`
  - [x] Portfolio post written from the HW 4 notes (04 Triads), with the notes, sketch and a square thumbnail
  - [x] Piano C4–C6 playable with the computer keyboard or touch; held triads set the chord
  - [x] Each note shows a circle-of-fifths color in three frames (images mode built, then removed)
  - [x] Buttons to play each inversion; Play the set, then the three orders in silence
  - [x] Silent set shown as a slideshow (arrows, arrow keys, dots); black keys drawn black
  - [x] Save sets (name + chord) to localStorage and a Firestore wall
  - [x] Card on the root index (03; 100, Charades, Decisions now 04–06); live link in the post
  - [ ] Deploy the `triadsSets` Firestore rules
  - [ ] Update the post's idea section for colors
- [x] 05 Decisions (A07), 2026-10-28, in `a07_spatial/`
  - [x] three.js world from the sketch: hill, trees, stream, sun, climbable mountains with contour lines, cave
  - [x] Ink and Watercolor looks with a toggle
  - [x] LLM judge (`openai/gpt-4o-mini`) with a hidden creed; good / bad / end verdicts; reveal at the end
  - [x] Figure modeled on the sketch; grows from a crawling 1-year-old through toddler, child, teen, adult
  - [x] Good = lighter, slower aging, keep growing; bad = heavier, faster aging, stuck at the current stage
  - [x] Cave door only children fit through
  - [x] Drag to look around (including up at the sky)
  - [x] Touch controls: hold to walk, two fingers to back up, drag to turn, tap to jump
  - [x] Card on the root index; live on GitHub Pages
  - [x] Portfolio post written (07-spatial.md) with screenshots
  - [ ] Portfolio post deployed to six-hq.com
  - [ ] Full play-test with the real judge (taking items, getting stuck, ending) on desktop and phone

## In progress
- [ ] 03 100 (A05), draft started 2026-10-26 in `a05_100/`
  - [x] Rules module (`rules.js`): 100-connection cap, 7-day window, 3-of-7 engagement, 5-min calls, 30-day block, New York calendar days
  - [x] Temperature: everyone starts hot; mutual days in last 7 (6–7 hot, 3–5 warm, 1–2 cold); disappears after 7 days with no engagement
  - [x] Full 100: connecting or accepting means letting someone go
  - [x] Connections, in-app messages and WebRTC voice calls (Firestore `hundredConnections`, `hundredCalls`)
  - [x] Posts (text, image, video link) with private heat and comments; neither counts as engagement
  - [x] Person pages (posts visible only when connected)
  - [x] Activities (`activities.js`): Watch (synced YouTube/.mp4, shared clock for streaming apps), Read (article list, notes), Study (shared focus timer, chat on breaks); 5 min together counts as a shared day
  - [x] Demo mode (~140 LLM-backed fake people, Next day button) via `store-demo.js`; real backend in `store-firebase.js`
  - [x] Logo ("1" + two eyes), Firestore rules for all `hundred*` collections, card on the root index (03; Charades now 04)
  - [ ] Deploy Firestore rules and verify the real (non-demo) flow with two accounts
  - [ ] Decide open switches: PUBLIC_HEAT, COMMENTS_COUNT_AS_TALKING
  - [ ] Money model (leaning Activities-based, no ads)
  - [ ] Portfolio post (05-social.md) kept in sync with the rules

## Not started
- See `docs/roadmap.md`
