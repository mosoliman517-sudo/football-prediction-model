-- ballknowledge, part 4: live predictions. Run in the Supabase SQL editor AFTER schema.sql, schema_v2.sql and schema_v3.sql. Safe to run twice.
-- Upcoming fixtures and the model's forecast are written by src/40_sync_fixtures.py with the service key (never shipped in the page).
-- Players can only add or change their own pick before kickoff, and the model's forecast stays hidden until you have picked (or the match has kicked off).

create table if not exists public.fixtures (
  id text primary key,
  league text not null,
  kickoff timestamptz not null,
  home text not null,
  away text not null,
  p_h real, p_d real, p_a real,
  model_pick text check (model_pick in ('H', 'D', 'A')),
  res text check (res in ('H', 'D', 'A')),
  hg int, ag int,
  updated_at timestamptz not null default now()
);
create index if not exists fixtures_kick on public.fixtures (kickoff);
create table if not exists public.predictions (
  user_id uuid not null references auth.users (id) on delete cascade,
  fixture_id text not null references public.fixtures (id) on delete cascade,
  pick text not null check (pick in ('H', 'D', 'A')),
  created_at timestamptz not null default now(),
  primary key (user_id, fixture_id)
);
alter table public.fixtures enable row level security;
alter table public.predictions enable row level security;
-- no policies: everything goes through the functions below.

create or replace function public.open_fixtures(p_league text) returns table (
  id text, league text, kickoff timestamptz, home text, away text, my_pick text, p_h real, p_d real, p_a real, model_pick text,
  res text, hg int, ag int, crowd_h int, crowd_d int, crowd_a int)
language sql stable security definer set search_path = public as $$
  select f.id, f.league, f.kickoff, f.home, f.away, mp.pick,
         case when mp.pick is not null or f.kickoff <= now() then f.p_h end,
         case when mp.pick is not null or f.kickoff <= now() then f.p_d end,
         case when mp.pick is not null or f.kickoff <= now() then f.p_a end,
         case when mp.pick is not null or f.kickoff <= now() then f.model_pick end,
         f.res, f.hg, f.ag,
         case when mp.pick is not null or f.kickoff <= now() then (select count(*)::int from predictions x where x.fixture_id = f.id and x.pick = 'H') end,
         case when mp.pick is not null or f.kickoff <= now() then (select count(*)::int from predictions x where x.fixture_id = f.id and x.pick = 'D') end,
         case when mp.pick is not null or f.kickoff <= now() then (select count(*)::int from predictions x where x.fixture_id = f.id and x.pick = 'A') end
  from fixtures f left join predictions mp on mp.fixture_id = f.id and mp.user_id = auth.uid()
  where f.kickoff > now() - interval '4 days' and f.kickoff < now() + interval '21 days' and (p_league = 'all' or f.league = p_league)
  order by f.kickoff, f.home;
$$;

create or replace function public.predict(p_fixture text, p_pick text) returns text
language plpgsql security definer set search_path = public as $$
declare k timestamptz;
begin
  if auth.uid() is null then return 'auth'; end if;
  if p_pick not in ('H', 'D', 'A') then return 'bad'; end if;
  select kickoff into k from fixtures where id = p_fixture;
  if k is null then return 'notfound'; end if;
  if k <= now() then return 'closed'; end if;
  insert into predictions (user_id, fixture_id, pick) values (auth.uid(), p_fixture, p_pick)
  on conflict (user_id, fixture_id) do update set pick = excluded.pick, created_at = now();
  return 'ok';
end $$;

-- the board: finished fixtures that kicked off in the last p_days days, one point per right result; the model is scored on the same fixtures
create or replace function public.fixture_board(p_league text, p_days int) returns table (nick text, avatar text, correct int, played int)
language sql stable security definer set search_path = public as $$
  select p.nick, p.avatar, count(*) filter (where x.pick = f.res)::int, count(*)::int
  from predictions x join fixtures f on f.id = x.fixture_id join profiles p on p.user_id = x.user_id
  where f.res is not null and f.kickoff > now() - make_interval(days => greatest(1, least(p_days, 400))) and (p_league = 'all' or f.league = p_league)
  group by p.nick, p.avatar having count(*) >= 1
  order by 3 desc, 4 asc, 1 limit 50;
$$;
create or replace function public.model_score(p_league text, p_days int) returns table (correct int, played int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where model_pick = res)::int, count(*)::int from fixtures
  where res is not null and kickoff > now() - make_interval(days => greatest(1, least(p_days, 400))) and (p_league = 'all' or league = p_league);
$$;

grant execute on function public.open_fixtures(text) to anon, authenticated;
grant execute on function public.predict(text, text) to authenticated;
grant execute on function public.fixture_board(text, int) to anon, authenticated;
grant execute on function public.model_score(text, int) to anon, authenticated;
