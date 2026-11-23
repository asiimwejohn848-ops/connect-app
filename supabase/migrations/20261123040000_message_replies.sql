-- CONNECT replies to individual messages
-- Run this migration in the Supabase SQL Editor.

alter table public.messages
  add column if not exists reply_to_id uuid;

create or replace function public.validate_message_reply()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1
    from public.messages as parent
    where parent.id = new.reply_to_id
      and (
        (parent.sender_id = new.sender_id and parent.recipient_id = new.recipient_id)
        or
        (parent.sender_id = new.recipient_id and parent.recipient_id = new.sender_id)
      )
  ) then
    raise exception 'You can only reply to a message in this conversation.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_message_reply on public.messages;
create trigger validate_message_reply
before insert on public.messages
for each row execute function public.validate_message_reply();

create index if not exists messages_reply_to_id_idx
  on public.messages (reply_to_id);
