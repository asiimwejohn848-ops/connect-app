-- CONNECT secure private text-message forwarding
-- Run this migration in the Supabase SQL Editor after the messages migrations.

alter table public.messages
  add column if not exists forwarded_from_sender_id uuid references public.profiles (id) on delete set null,
  add column if not exists forwarded_from_name text;

alter table public.messages
  drop constraint if exists messages_forward_metadata_pair;
alter table public.messages
  add constraint messages_forward_metadata_pair check (
    (forwarded_from_sender_id is null and forwarded_from_name is null)
    or
    (forwarded_from_sender_id is not null and forwarded_from_name is not null)
  );

-- Direct client inserts cannot forge forwarding attribution. The trusted RPC below
-- is SECURITY DEFINER and performs all authorization checks before inserting.
drop policy if exists "Accepted contacts can send messages" on public.messages;
create policy "Accepted contacts can send messages"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and recipient_id <> auth.uid()
    and forwarded_from_sender_id is null
    and forwarded_from_name is null
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

create or replace function public.protect_message_forward_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.forwarded_from_sender_id is distinct from old.forwarded_from_sender_id
    or new.forwarded_from_name is distinct from old.forwarded_from_name
  then
    raise exception 'Forwarding attribution cannot be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_message_forward_metadata on public.messages;
create trigger protect_message_forward_metadata
before update on public.messages
for each row execute function public.protect_message_forward_metadata();

create or replace function public.forward_private_message(
  p_message_id uuid,
  p_recipient_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_message public.messages%rowtype;
  original_sender_name text;
  new_message_id uuid;
  other_participant uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to forward a message.';
  end if;

  if p_recipient_id is null or p_recipient_id = auth.uid() then
    raise exception 'Choose another accepted contact.';
  end if;

  select *
    into source_message
    from public.messages
   where id = p_message_id
     and (sender_id = auth.uid() or recipient_id = auth.uid());

  if not found then
    raise exception 'Message not found or you do not have permission to forward it.';
  end if;

  if source_message.voice_path is not null or source_message.attachment_path is not null then
    raise exception 'Only text messages can be forwarded right now.';
  end if;

  other_participant := case
    when source_message.sender_id = auth.uid() then source_message.recipient_id
    else source_message.sender_id
  end;

  if p_recipient_id = other_participant then
    raise exception 'Choose a contact outside this conversation.';
  end if;

  if not exists (
    select 1
      from public.contact_requests cr
     where cr.status = 'accepted'
       and (
         (cr.sender_id = auth.uid() and cr.recipient_id = p_recipient_id)
         or
         (cr.recipient_id = auth.uid() and cr.sender_id = p_recipient_id)
       )
  ) then
    raise exception 'You can only forward messages to accepted contacts.';
  end if;

  select coalesce(
    nullif(p.display_name, ''),
    case when p.username is not null then '@' || p.username end,
    'a CONNECT member'
  )
    into original_sender_name
    from public.profiles p
   where p.id = source_message.sender_id;

  insert into public.messages (
    sender_id,
    recipient_id,
    body,
    forwarded_from_sender_id,
    forwarded_from_name
  )
  values (
    auth.uid(),
    p_recipient_id,
    source_message.body,
    source_message.sender_id,
    coalesce(original_sender_name, 'a CONNECT member')
  )
  returning id into new_message_id;

  return new_message_id;
end;
$$;

revoke all on function public.forward_private_message(uuid, uuid) from public;
grant execute on function public.forward_private_message(uuid, uuid) to authenticated;
