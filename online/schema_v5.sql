-- ballknowledge, part 5: match history (opponent and game on every rating change). Run AFTER schema_v3.sql. Safe to run twice.
alter table public.elo_history add column if not exists opp uuid;
alter table public.elo_history add column if not exists game text;

drop function if exists public.report_match(text, uuid, text);
create or replace function public.report_match(p_match text, p_opp uuid, p_result text, p_game text default null) returns text
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
  insert into elo_history (user_id, elo, delta, opp, game) values (me, na, na - ra, p_opp, left(p_game, 20)), (p_opp, nb, nb - rb, me, left(p_game, 20));
  return 'applied';
end $$;

drop function if exists public.my_elo_history();
create or replace function public.my_elo_history() returns table (elo int, delta int, at timestamptz, opp_nick text, game text)
language sql stable security definer set search_path = public as $$
  select h.elo, h.delta, h.at, p.nick, h.game
  from (select * from elo_history where user_id = auth.uid() order by at desc limit 60) h left join profiles p on p.user_id = h.opp order by h.at asc;
$$;
grant execute on function public.report_match(text, uuid, text, text) to authenticated;
grant execute on function public.my_elo_history() to authenticated;
