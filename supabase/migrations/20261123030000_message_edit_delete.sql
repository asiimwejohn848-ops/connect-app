-- CONNECT message editing and deletion
-- Run this migration in the Supabase SQL Editor after the messages migration.

alter table public.messages
  add column if not exists edited_at timestamptz;

drop policy if exists "Senders can edit their unread messages" on public.messages;
create policy "Senders can edit their unread messages"
  on public.messages
  for update
  to authenticated
  using (sender_id = auth.uid() and read_at is null)
  with check (sender_id = auth.uid());

drop policy if exists "Senders can delete their own messages" on public.messages;
create policy "Senders can delete their own messages"
  on public.messages
  for delete
  to authenticated
  using (sender_id = auth.uid());

create or replace function public.protect_message_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.sender_id is distinct from old.sender_id
    or new.recipient_id is distinct from old.recipient_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Message identity and ownership cannot be changed.';
  end if;

  if new.body is distinct from old.body then
    if old.sender_id <> auth.uid() or old.read_at is not null
      or new.read_at is distinct from old.read_at
      or char_length(trim(new.body)) not between 1 and 5000
    then
      raise exception 'Only the sender can edit an unread message.';
    end if;
    new.edited_at := now();
  else
    if new.edited_at is distinct from old.edited_at then
      raise exception 'Edit time is managed by CONNECT.';
    end if;
    if old.recipient_id <> auth.uid()
      or old.read_at is not null
      or new.read_at is null
      or new.read_at < old.created_at
    then
      raise exception 'Only the recipient can mark a message as read.';
    end if;
  end if;

  return new;
end;
$$;

grant delete on public.messages to authenticated;
