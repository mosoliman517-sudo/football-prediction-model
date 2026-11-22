-- ballknowledge, part 14: player cards. Tap a name on a leaderboard, in a lobby or in Friends to see that player's public
-- profile: picture, badges, Elo and rank, ranked record, this month's season points and place, their last 10 ranked results,
-- favourite player and team, and when they were last online. Only what is already public on leaderboards is shown
-- (never an email). Run after part 13. Safe to run twice.

create or replace function public.player_card(p_nick text) returns table (nick text, avatar text, badges text[], fav_player text, fav_team text,
  elo int, games int, wins int, last_seen timestamptz, season_pts int, season_place int, form int[])
language sql stable security definer set search_path = public as $$
  with u as (select p.* from profiles p where lower(p.nick) = lower(p_nick) limit 1),
  m as (select date_trunc('month', now() at time zone 'utc') at time zone 'utc' as m0),
  sb as (select h.user_id, 1000 + sum(h.delta) pts, count(*) filter (where h.delta > 0) w, count(*) g from elo_history h, m where h.at >= m.m0 group by h.user_id),
  sr as (select user_id, pts, rank() over (order by pts desc, w desc, g asc) pl from sb)
  select u.nick, u.avatar, public.clean_badges(u.user_id, u.badges), u.fav_player, u.fav_team,
         coalesce(r.elo, 1000), coalesce(r.games, 0), coalesce(r.wins, 0), u.last_seen,
         (select pts::int from sr where sr.user_id = u.user_id), (select pl::int from sr where sr.user_id = u.user_id),
         array(select d from (select h.delta d, h.at from elo_history h where h.user_id = u.user_id order by h.at desc limit 10) x order by x.at)
  from u left join ratings r on r.user_id = u.user_id;
$$;
grant execute on function public.player_card(text) to anon, authenticated;

-- the same for basketball (no online heartbeat there yet, so last_seen is empty)
create or replace function nba.player_card(p_nick text) returns table (nick text, avatar text, badges text[], fav_player text, fav_team text,
  elo int, games int, wins int, last_seen timestamptz, season_pts int, season_place int, form int[])
language sql stable security definer set search_path = nba, public as $$
  with u as (select p.* from nba.profiles p where lower(p.nick) = lower(p_nick) limit 1),
  m as (select date_trunc('month', now() at time zone 'utc') at time zone 'utc' as m0),
  sb as (select h.user_id, 1000 + sum(h.delta) pts, count(*) filter (where h.delta > 0) w, count(*) g from nba.elo_history h, m where h.at >= m.m0 group by h.user_id),
  sr as (select user_id, pts, rank() over (order by pts desc, w desc, g asc) pl from sb)
  select u.nick, u.avatar, nba.clean_badges(u.user_id, u.badges), u.fav_player, u.fav_team,
         coalesce(r.elo, 1000), coalesce(r.games, 0), coalesce(r.wins, 0), null::timestamptz,
         (select pts::int from sr where sr.user_id = u.user_id), (select pl::int from sr where sr.user_id = u.user_id),
         array(select d from (select h.delta d, h.at from nba.elo_history h where h.user_id = u.user_id order by h.at desc limit 10) x order by x.at)
  from u left join nba.ratings r on r.user_id = u.user_id;
$$;
grant execute on function nba.player_card(text) to anon, authenticated;
