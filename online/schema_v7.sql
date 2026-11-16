-- ballknowledge, part 7: "report a problem". Run AFTER schema_v6.sql (it replaces admin_stats to count open reports). Safe to run twice.
create table if not exists public.reports (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null,
  ref text,
  note text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
-- no policies: reports go in through submit_report and come out only for admins.

create or replace function public.submit_report(p_kind text, p_ref text, p_note text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'auth'; end if;
  if (select count(*) from reports where user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then return 'limit'; end if;
  insert into reports (user_id, kind, ref, note) values (auth.uid(), left(p_kind, 20), left(p_ref, 120), left(p_note, 500));
  return 'ok';
end $$;

create or replace function public.admin_reports(p_status text default 'open') returns table (id bigint, kind text, ref text, note text, status text, created timestamptz, email text)
language sql stable security definer set search_path = public, auth as $$
  select r.id, r.kind, r.ref, r.note, r.status, r.created_at, u.email::text
  from reports r left join auth.users u on u.id = r.user_id where public.is_admin() and r.status = p_status order by r.created_at desc limit 200;
$$;

create or replace function public.admin_resolve_report(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin if public.is_admin() then update reports set status = 'resolved' where id = p_id; end if; end $$;

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
    'open_reports', (select count(*) from reports where status = 'open'),
    'signups_by_day', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]'::jsonb) from (select created_at::date as d, count(*) as n from auth.users where created_at > now() - interval '14 days' group by 1) x));
end $$;
grant execute on function public.submit_report(text, text, text) to authenticated;
grant execute on function public.admin_reports(text) to authenticated;
grant execute on function public.admin_resolve_report(bigint) to authenticated;
grant execute on function public.admin_stats() to authenticated;
