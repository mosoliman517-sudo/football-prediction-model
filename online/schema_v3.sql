-- ballknowledge, part 3: profile pictures and favourites, friends, Elo history.
-- Run in the Supabase SQL editor AFTER schema.sql and schema_v2.sql. Safe to run twice.

alter table public.profiles add column if not exists avatar text;
alter table public.profiles add column if not exists fav_player text;
alter table public.profiles add column if not exists fav_team text;

create table if not exists public.elo_history (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  elo int not null,
  delta int not null,
  at timestamptz not null default now()
);
create index if not exists elo_history_user on public.elo_history (user_id, at);
create table if not exists public.friends (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.elo_history enable row level security;
alter table public.friends enable row level security;
-- no policies: everything goes through the functions below.

-- report_match again, now also writing the rating history
create or replace function public.report_match(p_match text, p_opp uuid, p_result text) returns text
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
  insert into elo_history (user_id, elo, delta) values (me, na, na - ra), (p_opp, nb, nb - rb);
  return 'applied';
end $$;

create or replace function public.set_profile(p_avatar text, p_player text, p_team text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update profiles set avatar = left(p_avatar, 60), fav_player = left(p_player, 60), fav_team = left(p_team, 60) where user_id = auth.uid();
end $$;

create or replace function public.my_elo_history() returns table (elo int, delta int, at timestamptz)
language sql stable security definer set search_path = public as $$
  select h.elo, h.delta, h.at from (select * from elo_history where user_id = auth.uid() order by at desc limit 60) h order by h.at asc;
$$;

create or replace function public.add_friend(p_nick text) returns text
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then return 'auth'; end if;
  select user_id into fid from profiles where lower(nick) = lower(trim(p_nick));
  if fid is null then return 'notfound'; end if;
  if fid = auth.uid() then return 'self'; end if;
  if (select count(*) from friends where user_id = auth.uid()) >= 100 then return 'full'; end if;
  insert into friends (user_id, friend_id) values (auth.uid(), fid) on conflict do nothing;
  if not found then return 'already'; end if;
  return 'ok';
end $$;

create or replace function public.remove_friend(p_nick text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from friends where user_id = auth.uid() and friend_id = (select user_id from profiles where lower(nick) = lower(trim(p_nick)));
end $$;

create or replace function public.my_friends() returns table (nick text, elo int, games int, avatar text, fav_player text, fav_team text)
language sql stable security definer set search_path = public as $$
  select p.nick, coalesce(r.elo, 1000), coalesce(r.games, 0), p.avatar, p.fav_player, p.fav_team
  from friends f join profiles p on p.user_id = f.friend_id left join ratings r on r.user_id = f.friend_id
  where f.user_id = auth.uid() order by coalesce(r.elo, 1000) desc, p.nick;
$$;

-- the public boards and lobbies now also carry the profile picture
drop function if exists public.elo_top();
create or replace function public.elo_top() returns table (nick text, elo int, games int, wins int, avatar text)
language sql stable security definer set search_path = public as $$
  select p.nick, r.elo, r.games, r.wins, p.avatar from ratings r join profiles p on p.user_id = r.user_id where r.games > 0 order by r.elo desc, r.games desc limit 50;
$$;
drop function if exists public.open_lobbies();
create or replace function public.open_lobbies() returns table (code text, nick text, elo int, game text, diff text, avatar text)
language sql stable security definer set search_path = public as $$
  select l.code, p.nick, coalesce(r.elo, 1000), l.game, l.diff, p.avatar
  from lobbies l join profiles p on p.user_id = l.host left join ratings r on r.user_id = l.host
  where l.seen_at > now() - interval '45 seconds' order by l.seen_at desc limit 40;
$$;

grant execute on function public.report_match(text, uuid, text) to authenticated;
grant execute on function public.set_profile(text, text, text) to authenticated;
grant execute on function public.my_elo_history() to authenticated;
grant execute on function public.add_friend(text) to authenticated;
grant execute on function public.remove_friend(text) to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.open_lobbies() to anon, authenticated;
grant execute on function public.elo_top() to anon, authenticated;
