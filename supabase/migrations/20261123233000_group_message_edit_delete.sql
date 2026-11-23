-- Allow group message authors to edit and delete only their own messages.
create or replace function public.edit_group_message(p_message_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := trim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if char_length(v_body) not between 1 and 5000 then
    raise exception 'Messages must contain between 1 and 5000 characters.';
  end if;
  update public.group_messages gm
  set body = v_body
  where gm.id = p_message_id
    and gm.sender_id = auth.uid()
    and public.is_group_member(gm.group_id, auth.uid());
  if not found then
    raise exception 'Message not found or you do not have permission to edit it.';
  end if;
end;
$$;

create or replace function public.delete_group_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  delete from public.group_messages gm
  where gm.id = p_message_id
    and gm.sender_id = auth.uid()
    and public.is_group_member(gm.group_id, auth.uid());
  if not found then
    raise exception 'Message not found or you do not have permission to delete it.';
  end if;
end;
$$;

revoke all on function public.edit_group_message(uuid, text) from public;
revoke all on function public.delete_group_message(uuid) from public;
grant execute on function public.edit_group_message(uuid, text) to authenticated;
grant execute on function public.delete_group_message(uuid) to authenticated;
