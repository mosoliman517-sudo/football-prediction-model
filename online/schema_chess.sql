-- ballknowledge CHESS: its own small schema called `chess` (nickname, best scores, saved bests).
-- Logins are shared with football and basketball (Supabase Auth); everything else is separate per sport.
-- Run once: Supabase -> SQL editor -> paste -> Run. Safe to run again. The last lines expose the schema to the API,
-- together with `nba`, so running this file does not undo the basketball setup. Run schema_nba.sql FIRST (the schema list names `nba`).

create schema if not exists chess;
grant usage on schema chess to anon, authenticated, service_role;
alter default privileges in schema chess grant all on tables to anon, authenticated, service_role;
alter default privileges in schema chess grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema chess grant execute on functions to anon, authenticated, service_role;

create table if not exists chess.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nick text not null check (nick ~ '^[A-Za-z0-9 _.-]{3,16}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists chess_profiles_nick on chess.profiles (lower(nick));

create table if not exists chess.progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists chess.results (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game text not null check (game ~ '^[a-z0-9_]{2,24}$'),
  score numeric not null check (score between -1000 and 100000),
  week int not null,
  day text not null check (day ~ '^\d{4}-\d{2}-\d{2}$')
);
create index if not exists chess_results_board on chess.results (game, week);
create index if not exists chess_results_user on chess.results (user_id, created_at);

alter table chess.profiles enable row level security;
alter table chess.progress enable row level security;
alter table chess.results enable row level security;

drop policy if exists "own profile read" on chess.profiles;
create policy "own profile read" on chess.profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists "own progress" on chess.progress;
create policy "own progress" on chess.progress for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own results insert" on chess.results;
create policy "own results insert" on chess.results for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from chess.profiles p where p.user_id = auth.uid()));

-- At most 120 entries a minute per account (a simple brake on abuse).
create or replace function chess.results_rate_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from chess.results where user_id = new.user_id and created_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many scores, slow down';
  end if;
  return new;
end $$;
drop trigger if exists results_rate on chess.results;
create trigger results_rate before insert on chess.results for each row execute function chess.results_rate_limit();

-- Choose or change a nickname. Returns 'ok', 'taken' or 'invalid'.
create or replace function chess.set_nickname(p_nick text) returns text
language plpgsql security definer set search_path = chess as $$
begin
  if auth.uid() is null or p_nick !~ '^[A-Za-z0-9 _.-]{3,16}$' then return 'invalid'; end if;
  insert into chess.profiles (user_id, nick) values (auth.uid(), p_nick)
    on conflict (user_id) do update set nick = excluded.nick;
  return 'ok';
exception when unique_violation then return 'taken';
end $$;

-- The public boards: every chess game is scored as a best score, so a board shows each player's highest result. Nobody can read the raw tables.
create or replace function chess.leaderboard(p_game text, p_period text, p_week int, p_day text)
returns table (nick text, value numeric, plays int)
language sql stable security definer set search_path = chess as $$
  select p.nick, max(r.score) as value, count(*)::int as plays
  from chess.results r join chess.profiles p on p.user_id = r.user_id
  where r.game = p_game
    and (p_period = 'all' or (p_period = 'week' and r.week = p_week) or (p_period = 'day' and r.day = p_day))
  group by p.nick
  order by value desc, max(r.created_at) asc
  limit 50;
$$;

grant execute on function chess.leaderboard(text, text, int, text) to anon, authenticated;
grant execute on function chess.set_nickname(text) to authenticated;
grant select, insert, update on chess.progress to authenticated;
grant insert on chess.results to authenticated;
grant all on all tables in schema chess to service_role;

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, storage, nba, chess';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
