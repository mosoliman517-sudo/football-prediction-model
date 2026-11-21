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
