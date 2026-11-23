-- CONNECT group conversations foundation
-- Run this migration in the Supabase SQL Editor.
-- Group messages are stored separately from one-to-one messages so existing
-- private-message features and security rules remain unchanged.

create table if not exists public.group_conversations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint group_conversations_name_length check (
    char_length(trim(name)) between 2 and 80
  )
);

create table if not exists public.group_members (
  group_id uuid not null references public.group_conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint group_messages_body_length check (
    char_length(trim(body)) between 1 and 5000
  )
);

create index if not exists group_members_user_group_idx
  on public.group_members (user_id, group_id);
create index if not exists group_messages_group_created_idx
  on public.group_messages (group_id, created_at desc);

alter table public.group_conversations enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;

-- SECURITY DEFINER helpers avoid recursive group_members RLS lookups.
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = p_user_id
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = p_user_id and gm.role = 'admin'
  );
$$;

revoke all on function public.is_group_member(uuid, uuid) from public;
revoke all on function public.is_group_admin(uuid, uuid) from public;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.is_group_admin(uuid, uuid) to authenticated;

-- Automatically make the creator the first group administrator.
create or replace function public.add_group_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

drop trigger if exists add_group_creator_after_insert on public.group_conversations;
create trigger add_group_creator_after_insert
after insert on public.group_conversations
for each row execute function public.add_group_creator();

drop policy if exists "Group members can view their groups" on public.group_conversations;
create policy "Group members can view their groups"
on public.group_conversations for select to authenticated
using (public.is_group_member(id));

drop policy if exists "Authenticated users can create groups" on public.group_conversations;
create policy "Authenticated users can create groups"
on public.group_conversations for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "Group members can view membership" on public.group_members;
create policy "Group members can view membership"
on public.group_members for select to authenticated
using (public.is_group_member(group_id));

drop policy if exists "Group admins can add accepted contacts" on public.group_members;
create policy "Group admins can add accepted contacts"
on public.group_members for insert to authenticated
with check (
  public.is_group_admin(group_id)
  and user_id <> auth.uid()
  and exists (
    select 1 from public.contact_requests cr
    where cr.status = 'accepted'
      and (
        (cr.sender_id = auth.uid() and cr.recipient_id = user_id)
        or (cr.recipient_id = auth.uid() and cr.sender_id = user_id)
      )
  )
);

drop policy if exists "Members can leave or admins can remove members" on public.group_members;
create policy "Members can leave or admins can remove members"
on public.group_members for delete to authenticated
using (
  user_id = auth.uid()
  or public.is_group_admin(group_id)
);

drop policy if exists "Group members can view group messages" on public.group_messages;
create policy "Group members can view group messages"
on public.group_messages for select to authenticated
using (public.is_group_member(group_id));

drop policy if exists "Group members can send group messages" on public.group_messages;
create policy "Group members can send group messages"
on public.group_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_group_member(group_id)
);

grant select, insert on public.group_conversations to authenticated;
grant select, insert, delete on public.group_members to authenticated;
grant select, insert on public.group_messages to authenticated;
revoke all on public.group_conversations, public.group_members, public.group_messages from anon;

-- Enable realtime updates for group lists and messages.
do $$
begin
  alter publication supabase_realtime add table public.group_conversations;
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.group_members;
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.group_messages;
exception when duplicate_object then null;
end
$$;
