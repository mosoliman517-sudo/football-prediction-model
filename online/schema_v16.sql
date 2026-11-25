-- ballknowledge, part 16: narrower table rights for basketball and chess, and a score rate limit that actually counts.
-- Paste ALL of this into the Supabase SQL editor and press Run. Safe to run twice. It changes rights only: no data is touched.
-- Run it AFTER schema_nba.sql and schema_chess.sql. If you ever run those two again, run this file again afterwards,
-- because they hand the wide rights back.

begin;

-- 1. Take back the blanket table rights. Row level security already blocked reading other people's rows; this is the
--    second lock, so that a table added later without a rule is not open to everyone.
alter default privileges in schema nba   revoke all on tables    from anon, authenticated;
alter default privileges in schema chess revoke all on tables    from anon, authenticated;
alter default privileges in schema nba   revoke all on sequences from anon, authenticated;
alter default privileges in schema chess revoke all on sequences from anon, authenticated;

revoke all on all tables    in schema nba   from anon, authenticated;
revoke all on all tables    in schema chess from anon, authenticated;
revoke all on all sequences in schema nba   from anon, authenticated;
revoke all on all sequences in schema chess from anon, authenticated;

-- 2. Give back exactly what the site does directly. Everything else goes through functions, which keep working.
grant select, insert, update on nba.progress   to authenticated;   -- saved progress (own row only, by rule)
grant select, insert, update on chess.progress to authenticated;
grant select on nba.profiles   to authenticated;                   -- reading your own nickname
grant select on chess.profiles to authenticated;
grant insert on nba.results    to authenticated;                   -- posting a score
grant insert on chess.results  to authenticated;
grant usage, select on sequence nba.results_id_seq   to authenticated;
grant usage, select on sequence chess.results_id_seq to authenticated;

-- 3. The "120 scores a minute" brake never fired: it counted rows as the player, who may not read the results table,
--    so it always counted zero. It now counts with the owner's rights, and does nothing else.
create or replace function public.results_rate_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.results where user_id = new.user_id and created_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many scores, slow down';
  end if;
  return new;
end $$;

create or replace function nba.results_rate_limit() returns trigger language plpgsql security definer set search_path = nba as $$
begin
  if (select count(*) from nba.results where user_id = new.user_id and created_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many scores, slow down';
  end if;
  return new;
end $$;

create or replace function chess.results_rate_limit() returns trigger language plpgsql security definer set search_path = chess as $$
begin
  if (select count(*) from chess.results where user_id = new.user_id and created_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many scores, slow down';
  end if;
  return new;
end $$;

commit;

-- Check (read only). You should see only: authenticated | nba/chess | profiles SELECT, progress SELECT/INSERT/UPDATE, results INSERT.
select grantee, table_schema, table_name, string_agg(privilege_type, ', ' order by privilege_type) as rights
from information_schema.role_table_grants
where table_schema in ('nba', 'chess') and grantee in ('anon', 'authenticated')
group by 1, 2, 3 order by 2, 3, 1;
