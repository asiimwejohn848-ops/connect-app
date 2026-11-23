-- Make group creation and initial membership atomic.
-- A group is never left half-created if a contact is invalid or insertion fails.

create or replace function public.create_group_with_members(
  p_name text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_member_ids uuid[];
  v_requested_count integer;
  v_valid_count integer;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a group.';
  end if;

  if char_length(v_name) not between 2 and 80 then
    raise exception 'Group names must contain between 2 and 80 characters.';
  end if;

  select coalesce(array_agg(distinct member_id), array[]::uuid[])
    into v_member_ids
  from unnest(coalesce(p_member_ids, array[]::uuid[])) as member_id
  where member_id is not null and member_id <> v_user_id;

  v_requested_count := cardinality(v_member_ids);
  if v_requested_count < 1 then
    raise exception 'Choose at least one accepted contact.';
  end if;

  select count(*) into v_valid_count
  from public.contact_requests cr
  where cr.status = 'accepted'
    and (
      (cr.sender_id = v_user_id and cr.recipient_id = any(v_member_ids))
      or (cr.recipient_id = v_user_id and cr.sender_id = any(v_member_ids))
    );

  if v_valid_count <> v_requested_count then
    raise exception 'Every group member must be an accepted contact.';
  end if;

  insert into public.group_conversations (name, created_by)
  values (v_name, v_user_id)
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
  select v_group_id, member_id, 'member'
  from unnest(v_member_ids) as member_id;

  return v_group_id;
end;
$$;

revoke all on function public.create_group_with_members(text, uuid[]) from public;
grant execute on function public.create_group_with_members(text, uuid[]) to authenticated;
