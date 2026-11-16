-- ballknowledge, part 8: display names are unique regardless of capital letters ("Tester" and "tester" are the same name). Safe to run twice.
-- If this fails with "could not create unique index", two accounts already share a name apart from capitals: rename one in Table editor, then run again.
create unique index if not exists profiles_nick_lower on public.profiles (lower(nick));

create or replace function public.set_nickname(p_nick text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_nick !~ '^[A-Za-z0-9 _.-]{3,16}$' then return 'invalid'; end if;
  if exists (select 1 from public.profiles where lower(nick) = lower(p_nick) and user_id <> auth.uid()) then return 'taken'; end if;
  insert into public.profiles (user_id, nick) values (auth.uid(), p_nick)
    on conflict (user_id) do update set nick = excluded.nick;
  return 'ok';
exception when unique_violation then return 'taken';
end $$;
grant execute on function public.set_nickname(text) to authenticated;
