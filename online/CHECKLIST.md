# Switch on basketball and chess accounts (one page)

You only need to do this once. Football already works. Basketball and chess need their own tables, which live in two extra
"schemas" in the same Supabase project. Logins are shared: one account works in all three sports, but each sport has its own
nickname, scores and progress.

## Do this

1. Open your Supabase project, then **SQL editor**, then **New query**.
2. Open `online/schema_nba.sql` from this repo, copy everything, paste it, press **Run**. Wait for "Success".
3. New query again. Open `online/schema_chess.sql`, copy everything, paste, **Run**. Wait for "Success".
   (Order matters: `nba` first, because the last lines of the chess file expose both schemas to the API.)
4. **Project settings, Data API, Exposed schemas**: check that the list reads `public, graphql_public, storage, nba, chess`.
   If it does not, add `nba` and `chess` and press Save.
5. Wait about 30 seconds (the API reloads its settings).

## Check it worked

- Open the basketball site, sign in, play one game. Open that game's leaderboard: your nickname should appear.
- Open the chess site, press **Sign in**, then play Human bar once. Open **Leaderboards**, choose Human bar: you should be there.
- If a leaderboard says "not switched on yet", step 4 is the usual cause. Reload the page after the 30 seconds.

## If something fails

- "schema must be one of the following": the Exposed schemas list in step 4 is missing a name.
- "permission denied": run the SQL file again (it is safe to run twice).
- "relation does not exist" while running the chess file: run `schema_nba.sql` first, then chess again.
- A nickname error says "taken": nicknames are unique inside each sport, so choose another.

## What is stored (chess)

An email and password (kept by Supabase Auth, not by this project), a nickname, your best scores per game, and one row per submitted
score (game, score, week, day). Nobody can read other people's raw rows; the leaderboard functions only return nickname and best score.
Scores are worked out in the browser, so the boards are a friendly competition, not proof.
