-- Secure group administration: rename groups and remove ordinary members.
create or replace function public.rename_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null or not public.is_group_admin(p_group_id, auth.uid()) then
    raise exception 'Only a group admin can rename this group.';
  end if;
  if char_length(v_name) not between 2 and 80 then
    raise exception 'Group names must contain between 2 and 80 characters.';
  end if;
  update public.group_conversations
  set name = v_name
  where id = p_group_id;
  if not found then raise exception 'Group not found.'; end if;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_group_admin(p_group_id, auth.uid()) then
    raise exception 'Only a group admin can remove members.';
  end if;
  if p_member_id = auth.uid() then
    raise exception 'Use Leave group to remove yourself.';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_member_id and role = 'member'
  ) then
    raise exception 'Only ordinary members can be removed. Admins are protected.';
  end if;
  delete from public.group_members
  where group_id = p_group_id and user_id = p_member_id and role = 'member';
  if not found then raise exception 'Member not found.'; end if;
end;
$$;

revoke all on function public.rename_group(uuid, text) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
