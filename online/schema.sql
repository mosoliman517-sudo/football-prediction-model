-- Beat the Model: accounts, saved progress and global leaderboards.
-- Run once: Supabase dashboard -> SQL editor -> New query -> paste this whole file -> Run.
-- Safe to run again. Sign-up and sign-in use Supabase's own Auth; these tables sit beside it.

-- A nickname for each account that wants to appear on the boards (unique, plain characters only).
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nick text not null unique check (nick ~ '^[A-Za-z0-9 _.-]{3,16}$'),
  created_at timestamptz not null default now()
);

-- One row of saved progress per account (plays, XP, achievements, streak days).
create table if not exists public.progress (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Leaderboard entries. Only the account's own user_id can be written, and only if it has a nickname.
create table if not exists public.results (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game text not null check (game in ('xp','call','daily','matchday','upset','table','hol','challenge')),
  league text not null check (league in ('all','E0','D1','SP1','I1','F1')),
  score numeric not null check (score between -300 and 1000),
  week int not null,
  day text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  code text check (code is null or code ~ '^[a-z0-9]{4,10}$')
);
create index if not exists results_board on public.results (game, league, week);
create index if not exists results_user on public.results (user_id, created_at);

alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.results enable row level security;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select to authenticated using (user_id = auth.uid());

drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own results insert" on public.results;
create policy "own results insert" on public.results for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.profiles p where p.user_id = auth.uid()));

-- At most 120 entries a minute per account (a simple brake on abuse).
create or replace function public.results_rate_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.results where user_id = new.user_id and created_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many scores, slow down';
  end if;
  return new;
end $$;
drop trigger if exists results_rate on public.results;
create trigger results_rate before insert on public.results for each row execute function public.results_rate_limit();

-- Choose or change a nickname. Returns 'ok', 'taken' or 'invalid'.
create or replace function public.set_nickname(p_nick text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_nick !~ '^[A-Za-z0-9 _.-]{3,16}$' then return 'invalid'; end if;
  insert into public.profiles (user_id, nick) values (auth.uid(), p_nick)
    on conflict (user_id) do update set nick = excluded.nick;
  return 'ok';
exception when unique_violation then return 'taken';
end $$;

-- The public boards. Best streaks take the maximum, everything else adds up. Nobody can read the raw tables.
create or replace function public.leaderboard(p_game text, p_league text, p_period text, p_week int, p_day text, p_code text)
returns table (nick text, value numeric, plays int)
language sql stable security definer set search_path = public as $$
  select p.nick,
         case when r.game in ('upset','hol') then max(r.score) else sum(r.score) end as value,
         count(*)::int as plays
  from public.results r join public.profiles p on p.user_id = r.user_id
  where r.game = p_game
    and (p_league = 'all' or r.league = p_league)
    and (p_period = 'all' or (p_period = 'week' and r.week = p_week) or (p_period = 'day' and r.day = p_day))
    and (p_game <> 'challenge' or r.code = p_code)
  group by p.nick
  order by value desc, max(r.created_at) asc
  limit 50;
$$;

grant execute on function public.leaderboard(text, text, text, int, text, text) to anon, authenticated;
grant execute on function public.set_nickname(text) to authenticated;
grant select, insert, update on public.progress to authenticated;
grant insert on public.results to authenticated;
grant usage, select on sequence public.results_id_seq to authenticated;
grant select on public.profiles to authenticated;
