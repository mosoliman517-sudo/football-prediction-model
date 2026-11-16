-- ballknowledge, part 2: Elo ratings, ranked matches and open lobbies.
-- Run this in the Supabase SQL editor AFTER schema.sql. Safe to run twice.

create table if not exists public.ratings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  elo int not null default 1000,
  games int not null default 0,
  wins int not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.match_reports (
  match_id text not null,
  reporter uuid not null references auth.users (id) on delete cascade,
  opponent uuid not null,
  result text not null check (result in ('win', 'loss', 'draw')),
  created_at timestamptz not null default now(),
  primary key (match_id, reporter)
);
create table if not exists public.matches_done (match_id text primary key, created_at timestamptz not null default now());
create table if not exists public.lobbies (
  code text primary key,
  host uuid not null references auth.users (id) on delete cascade,
  game text not null,
  diff text not null,
  seen_at timestamptz not null default now()
);
alter table public.ratings enable row level security;
alter table public.match_reports enable row level security;
alter table public.matches_done enable row level security;
alter table public.lobbies enable row level security;
-- no policies on purpose: nobody reads or writes these tables directly, only the functions below do.

-- Both players report the same match from their own account. The rating only moves when the two reports agree (one says win, the other loss, or both draw),
-- and only once per match, so nobody can raise their own rating alone. K factor 32, everyone starts on 1000.
create or replace function public.report_match(p_match text, p_opp uuid, p_result text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); theirs text; ra int; rb int; ea numeric; sa numeric; k int := 32;
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
  update ratings set elo = greatest(100, round(elo + k * (sa - ea))::int), games = games + 1, wins = wins + (case when p_result = 'win' then 1 else 0 end), updated_at = now() where user_id = me;
  update ratings set elo = greatest(100, round(elo + k * ((1 - sa) - (1 - ea)))::int), games = games + 1, wins = wins + (case when p_result = 'loss' then 1 else 0 end), updated_at = now() where user_id = p_opp;
  return 'applied';
end $$;

create or replace function public.my_rating() returns table (elo int, games int, wins int)
language sql stable security definer set search_path = public as $$
  select coalesce(r.elo, 1000), coalesce(r.games, 0), coalesce(r.wins, 0) from (select 1) x left join ratings r on r.user_id = auth.uid();
$$;

create or replace function public.elo_top() returns table (nick text, elo int, games int, wins int)
language sql stable security definer set search_path = public as $$
  select p.nick, r.elo, r.games, r.wins from ratings r join profiles p on p.user_id = r.user_id where r.games > 0 order by r.elo desc, r.games desc limit 50;
$$;

create or replace function public.lobby_ping(p_code text, p_game text, p_diff text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_code !~ '^[A-Z]{4}$' or length(p_game) > 20 or length(p_diff) > 10 then return; end if;
  delete from lobbies where host = auth.uid() and code <> p_code;
  insert into lobbies (code, host, game, diff, seen_at) values (p_code, auth.uid(), p_game, p_diff, now())
  on conflict (code) do update set seen_at = now(), game = excluded.game, diff = excluded.diff where lobbies.host = auth.uid();
end $$;

create or replace function public.lobby_close() returns void
language plpgsql security definer set search_path = public as $$
begin delete from lobbies where host = auth.uid(); end $$;

create or replace function public.open_lobbies() returns table (code text, nick text, elo int, game text, diff text)
language sql stable security definer set search_path = public as $$
  select l.code, p.nick, coalesce(r.elo, 1000), l.game, l.diff
  from lobbies l join profiles p on p.user_id = l.host left join ratings r on r.user_id = l.host
  where l.seen_at > now() - interval '45 seconds' order by l.seen_at desc limit 40;
$$;

grant execute on function public.report_match(text, uuid, text) to authenticated;
grant execute on function public.my_rating() to authenticated;
grant execute on function public.lobby_ping(text, text, text) to authenticated;
grant execute on function public.lobby_close() to authenticated;
grant execute on function public.open_lobbies() to anon, authenticated;
grant execute on function public.elo_top() to anon, authenticated;
