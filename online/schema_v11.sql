-- ballknowledge, part 11: leaderboards for the newer games (Scramble, Starting XI, Iconic matches, Rapid fire, Bracket buster).
-- Run in the Supabase SQL editor AFTER schema_v10.sql. Safe to run twice. It widens the list of game ids the results table accepts and teaches the leaderboard
-- function that single-run games (Rapid fire, Starting XI, Iconic matches, Bracket buster) show a player's best run while Scramble adds up.

alter table public.results drop constraint if exists results_game_check;
alter table public.results add constraint results_game_check check (game in (
  'xp','call','daily','matchday','upset','table','hol','challenge','who','career','club','blur','finish','pvalue','cvalue','number','ttt',
  'scramble','xi','iconic','rapid','bracket'));

create or replace function public.leaderboard(p_game text, p_league text, p_period text, p_week int, p_day text, p_code text)
returns table (nick text, value numeric, plays int)
language sql stable security definer set search_path = public as $$
  select p.nick,
         case when p_game in ('upset','hol','pvalue','cvalue','rapid','xi','iconic','bracket') then max(r.score) else sum(r.score) end as value,
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
