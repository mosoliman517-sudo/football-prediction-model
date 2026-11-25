# ballknowledge (main website): reference for the sister project

State on 2026-11-25. Paths are relative to the repository root. "Verified" means opened in a browser or read in code during the audit of that day; anything else is marked.

## 1. Overview

- **What:** three browser sites under one hub: football, basketball and chess. Quizzes, prediction games against statistical models, and (chess) puzzles, game review, bots and a live championship page.
- **Live:** https://moballknowledge.vercel.app (also GitHub Pages: https://mosoliman517-sudo.github.io/football-prediction-model/)
- **Repository:** mosoliman517-sudo/football-prediction-model. `docs/` is the published site.
- **Stack:** Python builds static pages; plain HTML, CSS and JavaScript (no framework, no npm, no bundler). Supabase for accounts and leaderboards. Stockfish (WASM) in the browser for chess.

## 2. Architecture

| Layer | Files |
|---|---|
| Hub page | `src/64_build_picker.py` → `docs/index.html` |
| Football page | `site/arena_template.html` + `src/30_build_arena.py` → `docs/football/` |
| Basketball page | `site/nba_template.html` + `site/nba_overlay.js` + `src/63_build_nba_arena.py` → `docs/basketball/` |
| Chess page | `site/chess_template.html` + `site/chess_extras.js`, `chess_home.js`, `chess_more.js`, `chess_wcc.js`, `bot_lines.js`, `chess_bots.js` + `src/73_build_chess.py` → `docs/chess/` |
| Page splitting | `src/split_loader.py`: small `index.html` plus `app.<hash>.js`, `data.<hash>.js` (football also `old.<hash>.js`, loaded only when needed) |
| Offline | `docs/sw.js` (hand-written), `docs/manifest.webmanifest`, `site/install.js` |
| Database | `online/*.sql` (pasted by the owner into Supabase), `site/board_config.json` (public URL and publishable key) |

Builds embed data into the page at build time; there is no server of our own. Extras files are concatenated into the template's script, so they share globals and may replace earlier functions (`home = ...`, `aiThink = ...`). This works but is fragile: a duplicate function name silently wins (it happened once with `rvFlip`).

Navigation: football and basketball route on `location.hash` through `go(slug)` / `route()`. Chess calls functions from a table, `GO[key]()`.

Build commands:

```bash
python3 src/30_build_arena.py --public
python3 src/63_build_nba_arena.py --public
python3 src/73_build_chess.py --public
python3 src/64_build_picker.py
```

## 3. Feature inventory

Status: **Live** = on the published site and opened without errors in the 2026-11-25 sweep. Opening a screen is not the same as playing it to the end.

### Football (`site/arena_template.html`)
| Feature | Status | Notes / reuse |
|---|---|---|
| Prediction games: Call it, Daily 5, Matchday, Spot the upset, Guess the table, Higher or lower, Bracket buster, Rapid fire, Challenge a friend | Live | Need model outputs built by `src/29`, `32`, `33` |
| Knowledge games: Who am I?, Career path, Name that club, Badge blur, Where did they finish?, Market value, Club roulette, Starting XI, Who did it, Scramble, tic-tac-toe | Live | Quiz data from `src/34`–`53`; solo and two-player |
| Leagues and an all-leagues mode, each with its own palette and font | Live | `:root[data-league=...]` tokens; highly reusable |
| Profile, XP, ranks, achievements, album of collectible moments | Live | Stored in localStorage, synced when signed in |
| Leaderboards, nicknames shared across sports | Live, sign-up not re-tested | `site/name_sync.js` |
| Seasons and rewards | Built, paused by the owner | `site/seasons.js` |
| Usage counts for the owner, admin page, ideas board, reports | Built, not exercised in the audit | `site/usage.js`, `is_admin()` guarded |
| Team news from fantasy data | Partial (Premier League only) | |

### Basketball (`site/nba_template.html`)
Same shell and game list as football, with NBA data (`src/60`–`67`) and an overlay. Live.

### Chess (`site/chess_template.html` and `site/chess_*.js`)
| Feature | Status | How it works |
|---|---|---|
| Puzzles (2,969), mate puzzles, weekly cup, daily challenges | Live | Lichess puzzle database (CC0) |
| Position games: Next move, Who played it, Human bar, Spot the tactic, Endgame verdict, Blindfold | Live | |
| Game review (PGN, chess.com or Lichess import) | Live | Stockfish at depth 18, three lines; win-probability grading; rating estimate calibrated on 63,815 games; badges including Brilliant, Great, Forced, Desperado, Zugzwang; tags for motifs. Detection is heuristic; see limitations |
| Play eight characters with measured ratings (1080–2110) | Live | Style rules over Stockfish candidates, `site/chess_bots.js` |
| Coaches Pip, Queen Vera, Bishop Bea | Live | Speech bubble plus recorded clip; facts on opening moves |
| Opening explorer, opening trainer ("gym"), opening stories | Live | `site/opening_stories.js`; explorer needs Lichess |
| World Championship 2026 hub (live board, analysis, schedule, players) | Live | Lichess broadcast API; shows a message when unreachable |
| World rankings and player profiles, match simulator | Live | Built data (`src/79`, `84`) |
| Play a friend online | Built | Supabase Realtime broadcast; never tested against two real devices |
| Themes: Cyber, Classic, Light | Live | CSS variables on `:root[data-theme]` |

### Shared across sports
| System | Where | Reusable? |
|---|---|---|
| Voice: exact text → clip | `site/voice.js`, `src/voice_groups.py`, `src/80` (Kokoro), `src/83` (Chatterbox), `docs/voice/index.json` | Yes. No clip means silence (no device voice). |
| Sidekicks and their lines | `site/mascots.js`, `site/mascot_lines.js`, `site/coach_lines.js`, `src/bot_lines.json` | Pattern yes, characters are this site's identity |
| Search across the three sports | `site/sitesearch.js`, `src/95_site_index.py` | Yes |
| Install prompt, skip link | `site/install.js` | Yes |
| Settings, missions, share links, spectate, play-next | `site/settings_ui.js`, `missions.js`, `sharelink.js`, `spectate.js`, `playnext.js` | Mostly yes |
| Particle and grid effects | `site/gamefx.js`, `site/gamegrid.js` | Yes |

## 4. Data structures

- **`DATA`** (global in each page): football keys include `leagues, profiles, summary, board, hero, colors, quiz, highlights, about, bracket, xi`; chess keys include `model, openings, players, elite, evals, puzzles, champ, ratings, events, sim, openstats, ratecal`.
- **localStorage:** `arena-session` (Supabase tokens), `arena-plays-v1`, `arena-nba-plays-v1`; chess uses the `bkc_` prefix; shared flags use `bk_`.
- **Supabase:** schema `public` (football), `nba`, `chess`; each has `profiles, progress, results`, row level security on, own-row policies, security-definer functions for leaderboards. One login for all three.
- **Voice index:** key is the exact line, or `voice|line` for non-default voices; value is the file name (`cb_` = Chatterbox).

## 5. Design conventions

- Colours as CSS variables, switched by attributes on `<html>` (`data-league`, `data-mode`, `data-style`, `data-theme`); `--accent` always pairs with `--on-accent`.
- Large photography and animation; the owner has rejected plain minimal redesigns for these pages.
- Reduced motion is respected in many places (`prefers-reduced-motion`).
- Inline SVG icons and characters; no icon library.
- Escape every external or user string with `esc()` before `innerHTML`.

## 6. Dependencies

Runtime in the browser: chess.js, Stockfish WASM (`docs/engine/`), Google Fonts. Services: Lichess APIs, chess.com public API (import), Supabase, Lichess endgame tablebase. Build: Python (`requirements.txt`), Pillow; voice venvs `.venv-tts` (Kokoro) and `.venv-cb` (Chatterbox).

## 7. Known limitations

- Leaderboard scores are computed in the browser, so they can be faked.
- Data bundles are large: about 1.3 MB (football), 1.5 MB (chess), 0.7 MB (basketball) gzipped, plus about 0.2–0.3 MB of code each.
- Chess move classification is heuristic; precision and recall have only been measured on a few hand-built positions (`tests/review_detectors.js`).
- No automated test suite for the pages beyond that file and the data audit `src/46_audit_quiz_data.py`.
- The Champions League has no data source; four leagues have no xG or squad-value inputs.
- Third-party badges and photos appear in the published build for identification (`--no-artwork` removes them).

## 8. Worth adapting to a sister site

1. The exact-text voice system with a silent fallback.
2. Per-section design tokens (`data-league` palettes).
3. Hash-split static build (long caching without a server).
4. The service worker rules in `docs/sw.js` (network first; hashed files cache first; audio never cached).
5. Leaderboard schema with row level security and function-only access.
6. The browser sweep used in this audit: open every route, flag errors, overflow, broken images and unlabelled controls.

Adapt ideas, not identity: names, characters and artwork belong to this site.

## 9. Improvements from the 2026-11-25 audit that may apply there too

See `AUDIT_2026-11-25.md`: SVG file extensions, service-worker caching rules, install banner never over a dialog, offline message distinct from "not set up", accent button text using `--on-accent`.
