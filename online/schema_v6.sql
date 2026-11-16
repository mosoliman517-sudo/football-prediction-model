-- ballknowledge, part 6: an admin role and the admin dashboard's data. Run AFTER schema.sql and schema_v2.sql. Safe to run twice.
create table if not exists public.admins (user_id uuid primary key references auth.users (id) on delete cascade);
alter table public.admins enable row level security;
-- no policies: only the functions below read this table.

-- MAKE YOURSELF ADMIN: run this ONE line separately, with YOUR sign-in email (do not commit your email anywhere):
--   insert into public.admins select id from auth.users where email = 'YOUR-EMAIL-HERE' on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then return null; end if;
  return jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'active_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'with_nick', (select count(*) from profiles),
    'rated', (select count(*) from ratings where games > 0),
    'ranked_matches', (select count(*) from matches_done),
    'predictions', (select count(*) from predictions),
    'fixtures', (select count(*) from fixtures),
    'last_fixture_sync', (select max(updated_at) from fixtures),
    'open_lobbies', (select count(*) from lobbies where seen_at > now() - interval '45 seconds'),
    'friend_links', (select count(*) from friends),
    'saved_progress', (select count(*) from progress),
    'signups_by_day', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]'::jsonb) from (select created_at::date as d, count(*) as n from auth.users where created_at > now() - interval '14 days' group by 1) x));
end $$;

create or replace function public.admin_users(p_q text default '') returns table (nick text, email text, created timestamptz, last_seen timestamptz, elo int, games int, wins int)
language sql stable security definer set search_path = public, auth as $$
  select p.nick, u.email::text, u.created_at, u.last_sign_in_at, coalesce(r.elo, 1000), coalesce(r.games, 0), coalesce(r.wins, 0)
  from auth.users u left join profiles p on p.user_id = u.id left join ratings r on r.user_id = u.id
  where public.is_admin() and (p_q = '' or lower(coalesce(p.nick, '') || ' ' || coalesce(u.email, '')) like '%' || lower(p_q) || '%')
  order by u.created_at desc limit 300;
$$;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_users(text) to authenticated;
