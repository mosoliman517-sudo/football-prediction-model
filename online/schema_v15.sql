-- ballknowledge, part 15: head-to-head records. On another player's card you see your lifetime ranked record against them,
-- per game: wins, losses and draws, from the rating history both of you already have. Friendly (private) matches don't change
-- Elo, so they aren't in the history and aren't counted. Run after part 14. Safe to run twice.

create or replace function public.head_to_head(p_nick text) returns table (game text, wins int, losses int, draws int, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(h.game, 'any'), count(*) filter (where h.delta > 0)::int, count(*) filter (where h.delta < 0)::int, count(*) filter (where h.delta = 0)::int, max(h.at)
  from elo_history h join profiles p on p.user_id = h.opp
  where h.user_id = auth.uid() and lower(p.nick) = lower(p_nick)
  group by coalesce(h.game, 'any') order by max(h.at) desc;
$$;
grant execute on function public.head_to_head(text) to authenticated;

create or replace function nba.head_to_head(p_nick text) returns table (game text, wins int, losses int, draws int, last_at timestamptz)
language sql stable security definer set search_path = nba, public as $$
  select coalesce(h.game, 'any'), count(*) filter (where h.delta > 0)::int, count(*) filter (where h.delta < 0)::int, count(*) filter (where h.delta = 0)::int, max(h.at)
  from nba.elo_history h join nba.profiles p on p.user_id = h.opp
  where h.user_id = auth.uid() and lower(p.nick) = lower(p_nick)
  group by coalesce(h.game, 'any') order by max(h.at) desc;
$$;
grant execute on function nba.head_to_head(text) to authenticated;
