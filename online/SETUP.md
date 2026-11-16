# Switching on accounts, saved progress and leaderboards

The public site runs without any of this: everyone can play as a guest and their progress is saved in their own browser.
To let people create accounts (progress follows them to any device) and compete on global leaderboards, the site needs a
small online database. It is free and takes about ten minutes.

1. Create a free project at supabase.com (any region).
2. In the dashboard open **SQL editor**, paste all of `online/schema.sql` and press **Run**. It creates the tables, the safety
   rules (people can only read and write their own progress and scores, and a nickname is required to post a score) and the
   leaderboard functions. It is safe to run twice.
3. **Authentication > Providers > Email**: leave email sign-in on. For the simplest sign-up, turn **Confirm email** off; leave it
   on if you want people to confirm their address first (the page handles both).
4. **Authentication > URL configuration**: set the Site URL to your public address
   (for example `https://moballknowledge.vercel.app`) so password-reset emails come back to it.
5. **Project settings > API**: copy the **Project URL** and the **anon public** key. Never use or paste the `service_role` key.
6. Create `site/board_config.json`:
   ```json
   { "url": "https://YOUR-PROJECT.supabase.co", "key": "YOUR-ANON-PUBLIC-KEY" }
   ```
   The anon key is meant to be public (it is shipped inside the page); the database rules in `schema.sql` are what protect the data.
7. Rebuild and publish: `python3 src/30_build_arena.py --public`, then commit and push `docs/index.html`.

What is stored: an email and password (handled by Supabase Auth, never by this project), a nickname, each account's saved progress
(plays, XP, achievements, days played) and leaderboard scores (game, league, score, week). Picks are only in the saved progress, which
only its owner can read.

Honest limits: scores are calculated in the browser, so a determined person can submit invented numbers; the boards are a friendly
competition, not proof. The rate limit (120 scores a minute per account) only slows abuse. To remove an entry or account, use the
Supabase dashboard (Table editor, or Authentication > Users).

## Online rooms (two players, two devices)

Online rooms need no extra tables. They use Supabase Realtime *broadcast* on a channel named after the four-letter room code, with the same project URL and anon key as the leaderboards (Realtime is on by default in new projects; check Project Settings, API, Realtime if rooms do not connect). One player hosts and runs the game; the guest only sends clicks and typed text. Without the database, rooms still connect two tabs of the same browser. The Realtime path is written but has not been tested against a live project.
