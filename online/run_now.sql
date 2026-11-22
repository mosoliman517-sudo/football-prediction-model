-- ballknowledge: the three parts this database is missing, in order (schema_v5, schema_v9, schema_v12). Paste this whole file into
-- the Supabase SQL editor and run it once. Each part is safe to run twice.

-- ===== schema_v5.sql =====
-- ballknowledge, part 5: match history (opponent and game on every rating change). Run AFTER schema_v3.sql. Safe to run twice.
alter table public.elo_history add column if not exists opp uuid;
alter table public.elo_history add column if not exists game text;

drop function if exists public.report_match(text, uuid, text);
create or replace function public.report_match(p_match text, p_opp uuid, p_result text, p_game text default null) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); theirs text; ra int; rb int; na int; nb int; ea numeric; sa numeric; k int := 32;
begin
  if me is null then return 'auth'; end if;
  if me = p_opp then return 'self'; end if;
  if p_result not in ('win', 'loss', 'draw') or length(p_match) > 80 then return 'bad'; end if;
  insert into match_reports (match_id, reporter, opponent, result) values (p_match, me, p_opp, p_result) on conflict do nothing;
  if exists (select 1 from matches_done where match_id = p_match) then return 'done'; end if;
  select result into theirs from match_reports where match_id = p_match and reporter = p_opp and opponent = me;
  if theirs is null then return 'waiting'; end if;
  if not ((p_result = 'win' and theirs = 'loss') or (p_result = 'loss' and theirs = 'win') or (p_result = 'draw' and theirs = 'draw')) then return 'conflict'; end if;
  insert into matches_done (match_id) values (p_match) on conflict do nothing;
  if not found then return 'done'; end if;
  insert into ratings (user_id) values (me), (p_opp) on conflict do nothing;
  select elo into ra from ratings where user_id = me;
  select elo into rb from ratings where user_id = p_opp;
  ea := 1 / (1 + power(10, (rb - ra) / 400.0));
  sa := case p_result when 'win' then 1 when 'draw' then 0.5 else 0 end;
  update ratings set elo = greatest(100, round(elo + k * (sa - ea))::int), games = games + 1, wins = wins + (case when p_result = 'win' then 1 else 0 end), updated_at = now() where user_id = me returning elo into na;
  update ratings set elo = greatest(100, round(elo + k * ((1 - sa) - (1 - ea)))::int), games = games + 1, wins = wins + (case when p_result = 'loss' then 1 else 0 end), updated_at = now() where user_id = p_opp returning elo into nb;
  insert into elo_history (user_id, elo, delta, opp, game) values (me, na, na - ra, p_opp, left(p_game, 20)), (p_opp, nb, nb - rb, me, left(p_game, 20));
  return 'applied';
end $$;

drop function if exists public.my_elo_history();
create or replace function public.my_elo_history() returns table (elo int, delta int, at timestamptz, opp_nick text, game text)
language sql stable security definer set search_path = public as $$
  select h.elo, h.delta, h.at, p.nick, h.game
  from (select * from elo_history where user_id = auth.uid() order by at desc limit 60) h left join profiles p on p.user_id = h.opp order by h.at asc;
$$;
grant execute on function public.report_match(text, uuid, text, text) to authenticated;
grant execute on function public.my_elo_history() to authenticated;

-- ===== schema_v9.sql =====
-- ballknowledge, part 9: equipped badges (up to 3, visible to everyone) and owner / admin roles. Run AFTER schema_v3.sql, schema_v4.sql and schema_v6.sql. Safe to run twice.
alter table public.profiles add column if not exists badges text[] not null default '{}';
alter table public.admins add column if not exists role text not null default 'admin' check (role in ('owner', 'admin'));

-- the badge ids a player has equipped, minus the staff badges unless that person really holds the role right now
create or replace function public.clean_badges(p_user uuid, p_badges text[]) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(select b from unnest(p_badges) b where b not in ('owner', 'admin')
    or (b = 'owner' and exists (select 1 from admins where user_id = p_user and role = 'owner'))
    or (b = 'admin' and exists (select 1 from admins where user_id = p_user))), '{}');
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from admins where user_id = auth.uid();
$$;

create or replace function public.set_badges(p_ids text[]) returns text
language plpgsql security definer set search_path = public as $$
declare ids text[];
begin
  if auth.uid() is null then return 'auth'; end if;
  select coalesce(array(select distinct b from unnest(p_ids) b where b ~ '^[a-z0-9_]{2,24}$' limit 3), '{}') into ids;
  if 'owner' = any (ids) and coalesce(public.my_role(), '') <> 'owner' then ids := array_remove(ids, 'owner'); end if;
  if 'admin' = any (ids) and public.my_role() is null then ids := array_remove(ids, 'admin'); end if;
  update profiles set badges = ids where user_id = auth.uid();
  return 'ok';
end $$;

-- the public lists now carry each player's equipped badges
drop function if exists public.elo_top();
create or replace function public.elo_top() returns table (nick text, elo int, games int, wins int, avatar text, badges text[])
language sql stable security definer set search_path = public as $$
  select p.nick, r.elo, r.games, r.wins, p.avatar, public.clean_badges(p.user_id, p.badges) from ratings r join profiles p on p.user_id = r.user_id where r.games > 0 order by r.elo desc, r.games desc limit 50;
$$;
drop function if exists public.open_lobbies();
create or replace function public.open_lobbies() returns table (code text, nick text, elo int, game text, diff text, avatar text, badges text[])
language sql stable security definer set search_path = public as $$
  select l.code, p.nick, coalesce(r.elo, 1000), l.game, l.diff, p.avatar, public.clean_badges(p.user_id, p.badges)
  from lobbies l join profiles p on p.user_id = l.host left join ratings r on r.user_id = l.host
  where l.seen_at > now() - interval '45 seconds' order by l.seen_at desc limit 40;
$$;
drop function if exists public.my_friends();
create or replace function public.my_friends() returns table (nick text, elo int, games int, avatar text, fav_player text, fav_team text, badges text[])
language sql stable security definer set search_path = public as $$
  select p.nick, coalesce(r.elo, 1000), coalesce(r.games, 0), p.avatar, p.fav_player, p.fav_team, public.clean_badges(p.user_id, p.badges)
  from friends f join profiles p on p.user_id = f.friend_id left join ratings r on r.user_id = f.friend_id
  where f.user_id = auth.uid() order by coalesce(r.elo, 1000) desc, p.nick;
$$;
drop function if exists public.fixture_board(text, int);
create or replace function public.fixture_board(p_league text, p_days int) returns table (nick text, avatar text, correct int, played int, badges text[])
language sql stable security definer set search_path = public as $$
  select p.nick, p.avatar, count(*) filter (where x.pick = f.res)::int, count(*)::int, public.clean_badges(p.user_id, p.badges)
  from predictions x join fixtures f on f.id = x.fixture_id join profiles p on p.user_id = x.user_id
  where f.res is not null and f.kickoff > now() - make_interval(days => greatest(1, least(p_days, 400))) and (p_league = 'all' or f.league = p_league)
  group by p.nick, p.avatar, p.user_id, p.badges having count(*) >= 1
  order by 3 desc, 4 asc, 1 limit 50;
$$;
grant execute on function public.my_role() to authenticated;
grant execute on function public.set_badges(text[]) to authenticated;
grant execute on function public.elo_top() to anon, authenticated;
grant execute on function public.open_lobbies() to anon, authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.fixture_board(text, int) to anon, authenticated;

-- MAKE YOURSELF THE OWNER (run separately, with YOUR sign-in email; do not commit your email anywhere):
--   insert into public.admins (user_id, role) select id, 'owner' from auth.users where email = 'YOUR-EMAIL-HERE'
--   on conflict (user_id) do update set role = 'owner';

-- ===== schema_v12.sql =====
-- ballknowledge, part 12: the weekly tournament predicts real matches, and friends show who is online. Run in the Supabase SQL editor after the earlier parts.
-- Safe to run twice.
--
-- Each player predicts the exact score of this week's real fixtures. The server stamps every prediction with its own clock
-- (made_at), and the page only scores a prediction that was made before the real kickoff (kickoff times and results come from
-- ESPN and the published forecast file, not from the player), so a late or edited prediction cannot score.
-- Points per match: 3 for the exact score, otherwise 2 for the right winner or draw, otherwise 1 for the right number of goals.

create table if not exists public.wk_preds (
  user_id uuid not null references auth.users (id) on delete cascade,
  fixture_id text not null check (fixture_id ~ '^[A-Z0-9]{2,3}-\d{8}-[a-z0-9-]{1,80}$'),
  week int not null check (week between 202001 and 210053),
  hg int not null check (hg between 0 and 20),
  ag int not null check (ag between 0 and 20),
  made_at timestamptz not null default now(),
  kick timestamptz,   -- the kickoff as the page knows it: used only to keep others' predictions hidden until then, never for scoring
  primary key (user_id, fixture_id)
);
alter table public.wk_preds add column if not exists kick timestamptz;
create index if not exists wk_preds_week on public.wk_preds (week);
alter table public.wk_preds enable row level security;
-- no policies: everything goes through the functions below.

-- Save or change a prediction. The time is always the server's.
drop function if exists public.wk_predict(text, int, int, int);
create or replace function public.wk_predict(p_fixture text, p_week int, p_hg int, p_ag int, p_kick timestamptz) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'auth'; end if;
  if not exists (select 1 from profiles where user_id = auth.uid()) then return 'nick'; end if;
  if p_hg not between 0 and 20 or p_ag not between 0 and 20 then return 'bad'; end if;
  insert into wk_preds (user_id, fixture_id, week, hg, ag, made_at, kick) values (auth.uid(), p_fixture, p_week, p_hg, p_ag, now(), p_kick)
  on conflict (user_id, fixture_id) do update set hg = excluded.hg, ag = excluded.ag, week = excluded.week, made_at = now(), kick = excluded.kick;
  return 'ok';
end $$;

-- My predictions for a week.
create or replace function public.wk_mine(p_week int) returns table (fixture_id text, hg int, ag int, made_at timestamptz)
language sql stable security definer set search_path = public as $$
  select fixture_id, hg, ag, made_at from wk_preds where user_id = auth.uid() and week = p_week;
$$;

-- Everyone's predictions for a week, for the table (nickname, picture, badges, and each prediction with its server time).
-- Another player's score stays hidden until kickoff, so nobody can copy the leader.
create or replace function public.wk_all(p_week int) returns table (nick text, avatar text, badges text[], fixture_id text, hg int, ag int, made_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.nick, p.avatar, p.badges, w.fixture_id,
         case when w.user_id = auth.uid() or coalesce(w.kick, now()) <= now() then w.hg end,
         case when w.user_id = auth.uid() or coalesce(w.kick, now()) <= now() then w.ag end, w.made_at
  from wk_preds w join profiles p on p.user_id = w.user_id where w.week = p_week
  order by p.nick limit 20000;
$$;

grant execute on function public.wk_predict(text, int, int, int, timestamptz) to authenticated;
grant execute on function public.wk_mine(int) to authenticated;
grant execute on function public.wk_all(int) to anon, authenticated;

-- Friends, live: who is online (seen in the last few minutes, from a heartbeat the page sends while open) and whether
-- they have a lobby open right now, so you can join it in one tap. Also whether they added you back.
alter table public.profiles add column if not exists last_seen timestamptz;

create or replace function public.touch_seen() returns void
language sql security definer set search_path = public as $$
  update profiles set last_seen = now() where user_id = auth.uid() and (last_seen is null or last_seen < now() - interval '45 seconds');
$$;

create or replace function public.my_friends_live() returns table (nick text, elo int, games int, avatar text, fav_player text, fav_team text, badges text[],
  last_seen timestamptz, lobby_code text, lobby_game text, mutual boolean)
language sql stable security definer set search_path = public as $$
  select p.nick, coalesce(r.elo, 1000), coalesce(r.games, 0), p.avatar, p.fav_player, p.fav_team, public.clean_badges(p.user_id, p.badges),
         p.last_seen,
         (select l.code from lobbies l where l.host = f.friend_id and l.seen_at > now() - interval '45 seconds' order by l.seen_at desc limit 1),
         (select l.game from lobbies l where l.host = f.friend_id and l.seen_at > now() - interval '45 seconds' order by l.seen_at desc limit 1),
         exists (select 1 from friends b where b.user_id = f.friend_id and b.friend_id = auth.uid())
  from friends f join profiles p on p.user_id = f.friend_id left join ratings r on r.user_id = f.friend_id
  where f.user_id = auth.uid()
  order by (p.last_seen > now() - interval '3 minutes') desc nulls last, coalesce(r.elo, 1000) desc, p.nick;
$$;

grant execute on function public.touch_seen() to authenticated;
grant execute on function public.my_friends_live() to authenticated;
