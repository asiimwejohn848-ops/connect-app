-- CONNECT private messaging foundation
-- Run this migration in the Supabase SQL Editor for the CONNECT project.
-- This phase supports one-to-one text messages between accepted contacts.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint messages_not_self check (sender_id <> recipient_id),
  constraint messages_body_length check (
    char_length(trim(body)) between 1 and 5000
  )
);

create index if not exists messages_sender_recipient_created_idx
  on public.messages (sender_id, recipient_id, created_at desc);

create index if not exists messages_recipient_sender_created_idx
  on public.messages (recipient_id, sender_id, created_at desc);

alter table public.messages enable row level security;

drop policy if exists "Participants can view their messages" on public.messages;
create policy "Participants can view their messages"
  on public.messages
  for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "Accepted contacts can send messages" on public.messages;
create policy "Accepted contacts can send messages"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and recipient_id <> auth.uid()
    and exists (
      select 1
      from public.contact_requests as cr
      where cr.status = 'accepted'
        and (
          (cr.sender_id = auth.uid() and cr.recipient_id = messages.recipient_id)
          or
          (cr.recipient_id = auth.uid() and cr.sender_id = messages.recipient_id)
        )
    )
  );

drop policy if exists "Recipients can mark messages as read" on public.messages;
create policy "Recipients can mark messages as read"
  on public.messages
  for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Prevent participants from changing message content or ownership after sending.
create or replace function public.protect_message_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.sender_id is distinct from old.sender_id
    or new.recipient_id is distinct from old.recipient_id
    or new.body is distinct from old.body
    or new.created_at is distinct from old.created_at
    or (old.read_at is not null and new.read_at is distinct from old.read_at)
  then
    raise exception 'Message content and ownership cannot be changed.';
  end if;

  if new.read_at is not null and new.read_at < old.created_at then
    raise exception 'Read time cannot be earlier than message time.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_message_fields on public.messages;
create trigger protect_message_fields
before update on public.messages
for each row execute function public.protect_message_fields();

grant select, insert, update on public.messages to authenticated;
revoke all on public.messages from anon;
