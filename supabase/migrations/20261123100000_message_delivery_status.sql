-- CONNECT message delivery status
-- A message is delivered when the recipient's CONNECT inbox loads it.
-- A message is read when the recipient opens its conversation.

alter table public.messages
  add column if not exists delivered_at timestamptz;

-- Existing messages already marked read were necessarily delivered.
update public.messages
   set delivered_at = read_at
 where read_at is not null
   and delivered_at is null;

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
    or new.edited_at is distinct from old.edited_at
    or new.reply_to_id is distinct from old.reply_to_id
    or new.voice_path is distinct from old.voice_path
    or new.attachment_path is distinct from old.attachment_path
    or new.attachment_name is distinct from old.attachment_name
    or new.attachment_mime is distinct from old.attachment_mime
    or new.attachment_size is distinct from old.attachment_size
    or (old.read_at is not null and new.read_at is distinct from old.read_at)
    or (old.delivered_at is not null and new.delivered_at is distinct from old.delivered_at)
  then
    raise exception 'Message content, ownership and status history cannot be changed.';
  end if;

  if new.delivered_at is distinct from old.delivered_at then
    if new.delivered_at is null
      or new.recipient_id <> auth.uid()
      or new.delivered_at < old.created_at
    then
      raise exception 'Only the recipient can mark a message as delivered.';
    end if;
  end if;

  if new.read_at is not null and new.read_at < old.created_at then
    raise exception 'Read time cannot be earlier than message time.';
  end if;

  if new.read_at is distinct from old.read_at then
    if new.read_at is null
      or new.recipient_id <> auth.uid()
      or new.delivered_at is null
    then
      raise exception 'Only the recipient can mark a delivered message as read.';
    end if;
  end if;

  return new;
end;
$$;

comment on column public.messages.delivered_at is
  'Set when the recipient inbox loads this message; read_at records when its conversation is opened.';
