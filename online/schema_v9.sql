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
