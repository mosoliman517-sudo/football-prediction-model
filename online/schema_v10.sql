-- ballknowledge, part 10: roadmap ideas, badge ideas and votes. Run in the Supabase SQL editor AFTER schema_v9.sql. Safe to run twice.
-- Anyone can read the ideas; signed-in players can suggest (5 a day) and vote once per idea; admins set the status.

create table if not exists public.ideas (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('feature', 'badge', 'game', 'other')),
  title text not null check (char_length(title) between 3 and 80),
  body text check (body is null or char_length(body) <= 300),
  status text not null default 'open' check (status in ('open', 'planned', 'done', 'declined')),
  created_at timestamptz not null default now()
);
create table if not exists public.idea_votes (
  idea_id bigint not null references public.ideas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (idea_id, user_id)
);
alter table public.ideas enable row level security;
alter table public.idea_votes enable row level security;
-- no policies: everything goes through the functions below.

create or replace function public.submit_idea(p_kind text, p_title text, p_body text) returns text
language plpgsql security definer set search_path = public as $$
declare nid bigint;
begin
  if auth.uid() is null then return 'auth'; end if;
  if p_kind not in ('feature', 'badge', 'game', 'other') or char_length(coalesce(p_title, '')) not between 3 and 80 then return 'invalid'; end if;
  if (select count(*) from ideas where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then return 'limit'; end if;
  insert into ideas (user_id, kind, title, body) values (auth.uid(), p_kind, trim(p_title), nullif(left(trim(coalesce(p_body, '')), 300), '')) returning id into nid;
  insert into idea_votes (idea_id, user_id) values (nid, auth.uid());
  return 'ok';
end $$;

create or replace function public.list_ideas(p_kind text default null)
returns table (id bigint, kind text, title text, body text, status text, votes int, mine boolean, nick text, created timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.kind, i.title, i.body, i.status,
         (select count(*)::int from idea_votes v where v.idea_id = i.id),
         exists (select 1 from idea_votes v where v.idea_id = i.id and v.user_id = auth.uid()),
         p.nick, i.created_at
  from ideas i left join profiles p on p.user_id = i.user_id
  where (p_kind is null or i.kind = p_kind) and (i.status <> 'declined' or public.is_admin())
  order by 6 desc, i.created_at desc limit 100;
$$;

create or replace function public.vote_idea(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'auth'; end if;
  if not exists (select 1 from ideas where id = p_id) then return 'missing'; end if;
  if exists (select 1 from idea_votes where idea_id = p_id and user_id = auth.uid()) then
    delete from idea_votes where idea_id = p_id and user_id = auth.uid(); return 'removed';
  end if;
  insert into idea_votes (idea_id, user_id) values (p_id, auth.uid()); return 'added';
end $$;

create or replace function public.admin_set_idea(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() and p_status in ('open', 'planned', 'done', 'declined') then update ideas set status = p_status where id = p_id; end if;
end $$;

grant execute on function public.list_ideas(text) to anon, authenticated;
grant execute on function public.submit_idea(text, text, text) to authenticated;
grant execute on function public.vote_idea(bigint) to authenticated;
grant execute on function public.admin_set_idea(bigint, text) to authenticated;
