-- CONNECT VIP extras: polls, saved messages, and a privacy-safe VIP directory.
create table if not exists public.connect_vip_polls (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  question text not null check (char_length(trim(question)) between 5 and 180),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 5),
  created_at timestamptz not null default now()
);
create table if not exists public.connect_vip_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.connect_vip_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index integer not null check (option_index between 0 and 4),
  created_at timestamptz not null default now(),
  unique(poll_id,user_id)
);
alter table public.connect_vip_polls enable row level security;
alter table public.connect_vip_poll_votes enable row level security;
drop policy if exists "VIP members read polls" on public.connect_vip_polls;
create policy "VIP members read polls" on public.connect_vip_polls for select to authenticated using (public.has_active_connect_vip());
drop policy if exists "VIP members create polls" on public.connect_vip_polls;
create policy "VIP members create polls" on public.connect_vip_polls for insert to authenticated with check (creator_id = auth.uid() and public.has_active_connect_vip());
drop policy if exists "VIP members read poll votes" on public.connect_vip_poll_votes;
create policy "VIP members read poll votes" on public.connect_vip_poll_votes for select to authenticated using (public.has_active_connect_vip());
drop policy if exists "VIP members vote" on public.connect_vip_poll_votes;
create policy "VIP members vote" on public.connect_vip_poll_votes for insert to authenticated
with check (user_id = auth.uid() and public.has_active_connect_vip()
  and exists (select 1 from public.connect_vip_polls p where p.id = poll_id
    and option_index < jsonb_array_length(p.options)));
revoke all on public.connect_vip_polls, public.connect_vip_poll_votes from anon, authenticated;
grant select, insert on public.connect_vip_polls to authenticated;
grant select, insert on public.connect_vip_poll_votes to authenticated;

create table if not exists public.connect_vip_saved_messages (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.connect_vip_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,message_id)
);
alter table public.connect_vip_saved_messages enable row level security;
drop policy if exists "VIP members manage own saved messages" on public.connect_vip_saved_messages;
create policy "VIP members manage own saved messages" on public.connect_vip_saved_messages
for all to authenticated using (user_id = auth.uid() and public.has_active_connect_vip())
with check (user_id = auth.uid() and public.has_active_connect_vip());
revoke all on public.connect_vip_saved_messages from anon, authenticated;
grant select, insert, delete on public.connect_vip_saved_messages to authenticated;

create or replace function public.get_connect_vip_directory()
returns table(user_id uuid, display_name text, username text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.display_name, p.username
  from public.profiles p
  where exists (
    select 1 from public.connect_subscriptions s
    where s.user_id = p.id and s.status = 'active'
      and s.starts_at <= now() and s.ends_at > now()
  )
  and public.has_active_connect_vip()
  order by coalesce(p.display_name,p.username,'') asc
  limit 100;
$$;
revoke all on function public.get_connect_vip_directory() from public, anon;
grant execute on function public.get_connect_vip_directory() to authenticated;
