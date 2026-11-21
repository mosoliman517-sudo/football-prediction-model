-- ballknowledge, part 13: ranked seasons. Run in the Supabase SQL editor after the earlier parts (football and basketball). Safe to run twice.
--
-- A season is a calendar month (UTC). Everyone starts each season on a season rating of 1000, and every ranked result moves it
-- by the same amount it moves your Elo (from the rating history the site already records). Your lifetime Elo is untouched and
-- still used for matchmaking; the season ladder is the fresh start. Rewards come from where you finish (the page awards them).

create or replace function public.season_board(p_month text) returns table (nick text, avatar text, badges text[], pts int, games int, wins int)
language sql stable security definer set search_path = public as $$
  select p.nick, p.avatar, public.clean_badges(p.user_id, p.badges), (1000 + sum(h.delta))::int, count(*)::int, count(*) filter (where h.delta > 0)::int
  from elo_history h join profiles p on p.user_id = h.user_id
  where p_month ~ '^\d{4}-\d{2}$' and h.at >= (p_month || '-01')::date and h.at < ((p_month || '-01')::date + interval '1 month')
  group by p.user_id, p.nick, p.avatar, p.badges
  order by 4 desc, 6 desc, 5 asc, 1 limit 100;
$$;

create or replace function public.my_season(p_month text) returns table (pts int, games int, wins int, place int, players int)
language sql stable security definer set search_path = public as $$
  with b as (
    select h.user_id, (1000 + sum(h.delta))::int pts, count(*)::int games, count(*) filter (where h.delta > 0)::int wins
    from elo_history h where p_month ~ '^\d{4}-\d{2}$' and h.at >= (p_month || '-01')::date and h.at < ((p_month || '-01')::date + interval '1 month')
    group by h.user_id),
  r as (select *, rank() over (order by pts desc, wins desc, games asc)::int place, count(*) over ()::int players from b)
  select pts, games, wins, place, players from r where user_id = auth.uid();
$$;

grant execute on function public.season_board(text) to anon, authenticated;
grant execute on function public.my_season(text) to authenticated;

-- the same for basketball
create or replace function nba.season_board(p_month text) returns table (nick text, avatar text, badges text[], pts int, games int, wins int)
language sql stable security definer set search_path = nba, public as $$
  select p.nick, p.avatar, nba.clean_badges(p.user_id, p.badges), (1000 + sum(h.delta))::int, count(*)::int, count(*) filter (where h.delta > 0)::int
  from nba.elo_history h join nba.profiles p on p.user_id = h.user_id
  where p_month ~ '^\d{4}-\d{2}$' and h.at >= (p_month || '-01')::date and h.at < ((p_month || '-01')::date + interval '1 month')
  group by p.user_id, p.nick, p.avatar, p.badges
  order by 4 desc, 6 desc, 5 asc, 1 limit 100;
$$;

create or replace function nba.my_season(p_month text) returns table (pts int, games int, wins int, place int, players int)
language sql stable security definer set search_path = nba, public as $$
  with b as (
    select h.user_id, (1000 + sum(h.delta))::int pts, count(*)::int games, count(*) filter (where h.delta > 0)::int wins
    from nba.elo_history h where p_month ~ '^\d{4}-\d{2}$' and h.at >= (p_month || '-01')::date and h.at < ((p_month || '-01')::date + interval '1 month')
    group by h.user_id),
  r as (select *, rank() over (order by pts desc, wins desc, games asc)::int place, count(*) over ()::int players from b)
  select pts, games, wins, place, players from r where user_id = auth.uid();
$$;

grant execute on function nba.season_board(text) to anon, authenticated;
grant execute on function nba.my_season(text) to authenticated;
