-- CONNECT Gift Messages: private, sender-controlled message unlocks.
-- Apply this migration in the Supabase SQL Editor before enabling the feature.
-- Gift message bodies are never selectable by recipients directly. They are returned
-- only by read_approved_gift_message() after the sender approves access.

create table if not exists public.connect_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_code text not null,
  status text not null default 'pending',
  starts_at timestamptz,
  ends_at timestamptz,
  payment_provider text,
  provider_reference text unique,
  created_at timestamptz not null default now(),
  constraint connect_subscriptions_plan check (plan_code in ('weekly', 'monthly', 'quarterly', 'annual')),
  constraint connect_subscriptions_status check (status in ('pending', 'active', 'expired', 'cancelled'))
);

create index if not exists connect_subscriptions_user_active_idx
  on public.connect_subscriptions (user_id, ends_at desc)
  where status = 'active';

alter table public.connect_subscriptions enable row level security;
drop policy if exists "Users can view their own CONNECT subscriptions" on public.connect_subscriptions;
create policy "Users can view their own CONNECT subscriptions"
  on public.connect_subscriptions for select to authenticated
  using (user_id = auth.uid());
revoke all on public.connect_subscriptions from anon, authenticated;
grant select on public.connect_subscriptions to authenticated;

create table if not exists public.connect_gift_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'A special gift message',
  body text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint connect_gift_messages_not_self check (sender_id <> recipient_id),
  constraint connect_gift_messages_title_length check (char_length(trim(title)) between 1 and 100),
  constraint connect_gift_messages_body_length check (char_length(trim(body)) between 1 and 5000),
  constraint connect_gift_messages_expiry check (expires_at is null or expires_at > created_at)
);

create index if not exists connect_gift_messages_sender_idx
  on public.connect_gift_messages (sender_id, created_at desc);
create index if not exists connect_gift_messages_recipient_idx
  on public.connect_gift_messages (recipient_id, created_at desc);

alter table public.connect_gift_messages enable row level security;
drop policy if exists "Only senders can read their CONNECT gift message bodies" on public.connect_gift_messages;
create policy "Only senders can read their CONNECT gift message bodies"
  on public.connect_gift_messages for select to authenticated
  using (sender_id = auth.uid());

-- No direct client inserts, updates, or deletes. All creation is subscription-checked
-- through the RPC below; gift content cannot be changed after sending.
revoke all on public.connect_gift_messages from anon, authenticated;
grant select on public.connect_gift_messages to authenticated;

create table if not exists public.connect_gift_access_requests (
  id uuid primary key default gen_random_uuid(),
  gift_message_id uuid not null references public.connect_gift_messages (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint connect_gift_access_status check (status in ('pending', 'approved', 'declined')),
  constraint connect_gift_access_unique unique (gift_message_id)
);

create index if not exists connect_gift_access_sender_idx
  on public.connect_gift_access_requests (sender_id, status, requested_at desc);
create index if not exists connect_gift_access_recipient_idx
  on public.connect_gift_access_requests (recipient_id, requested_at desc);

alter table public.connect_gift_access_requests enable row level security;
drop policy if exists "Gift participants can view access requests" on public.connect_gift_access_requests;
create policy "Gift participants can view access requests"
  on public.connect_gift_access_requests for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
revoke all on public.connect_gift_access_requests from anon, authenticated;
grant select on public.connect_gift_access_requests to authenticated;

create or replace function public.create_connect_gift_message(
  p_recipient_id uuid,
  p_title text,
  p_body text,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gift_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_recipient_id = auth.uid() then raise exception 'You cannot send a gift message to yourself.'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 100 then raise exception 'Title must be 1–100 characters.'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 5000 then raise exception 'Message must be 1–5000 characters.'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'Expiry must be in the future.'; end if;

  if not exists (
    select 1 from public.connect_subscriptions s
    where s.user_id = auth.uid()
      and s.status = 'active'
      and s.starts_at <= now()
      and s.ends_at > now()
  ) then
    raise exception 'An active CONNECT Premium subscription is required to send Gift Messages.';
  end if;

  if not exists (
    select 1 from public.contact_requests cr
    where cr.status = 'accepted'
      and ((cr.sender_id = auth.uid() and cr.recipient_id = p_recipient_id)
        or (cr.recipient_id = auth.uid() and cr.sender_id = p_recipient_id))
  ) then
    raise exception 'Gift Messages can only be sent to accepted CONNECT contacts.';
  end if;

  insert into public.connect_gift_messages (sender_id, recipient_id, title, body, expires_at)
  values (auth.uid(), p_recipient_id, trim(p_title), p_body, p_expires_at)
  returning id into v_gift_id;
  return v_gift_id;
end;
$$;

create or replace function public.request_connect_gift_access(p_gift_message_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_recipient uuid;
  v_sender uuid;
  v_expiry timestamptz;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  select g.recipient_id, g.sender_id, g.expires_at
    into v_recipient, v_sender, v_expiry
  from public.connect_gift_messages g where g.id = p_gift_message_id;

  if v_recipient is null or v_recipient <> auth.uid() then raise exception 'Gift message not found.'; end if;
  if v_expiry is not null and v_expiry <= now() then raise exception 'This gift message has expired.'; end if;

  insert into public.connect_gift_access_requests (gift_message_id, recipient_id, sender_id)
  values (p_gift_message_id, auth.uid(), v_sender)
  on conflict (gift_message_id) do update
    set status = 'pending', requested_at = now(), responded_at = null
    where public.connect_gift_access_requests.status = 'declined'
  returning id into v_request_id;

  if v_request_id is null then
    select id into v_request_id from public.connect_gift_access_requests
    where gift_message_id = p_gift_message_id;
  end if;
  return v_request_id;
end;
$$;

create or replace function public.respond_connect_gift_access(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  update public.connect_gift_access_requests
    set status = case when p_approve then 'approved' else 'declined' end,
        responded_at = now()
  where id = p_request_id
    and sender_id = auth.uid()
    and status = 'pending';
  if not found then raise exception 'Request not found or no longer pending.'; end if;
end;
$$;

create or replace function public.read_approved_connect_gift_message(p_gift_message_id uuid)
returns table (title text, body text, sender_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  return query
    select g.title, g.body, g.sender_id, g.created_at
    from public.connect_gift_messages g
    join public.connect_gift_access_requests r on r.gift_message_id = g.id
    where g.id = p_gift_message_id
      and g.recipient_id = auth.uid()
      and r.recipient_id = auth.uid()
      and r.status = 'approved'
      and (g.expires_at is null or g.expires_at > now());
  if not found then raise exception 'The sender has not approved access, or this gift has expired.'; end if;
end;
$$;

create or replace function public.list_received_connect_gift_messages()
returns table (
  id uuid,
  sender_id uuid,
  title text,
  created_at timestamptz,
  expires_at timestamptz,
  request_status text
)
language sql
security definer
set search_path = ''
as $$
  select g.id, g.sender_id, g.title, g.created_at, g.expires_at, r.status
  from public.connect_gift_messages g
  left join public.connect_gift_access_requests r on r.gift_message_id = g.id
  where g.recipient_id = auth.uid()
    and (g.expires_at is null or g.expires_at > now())
  order by g.created_at desc;
$$;

create or replace function public.list_sent_connect_gift_requests()
returns table (
  request_id uuid,
  gift_message_id uuid,
  recipient_id uuid,
  title text,
  requested_at timestamptz,
  status text
)
language sql
security definer
set search_path = ''
as $$
  select r.id, g.id, r.recipient_id, g.title, r.requested_at, r.status
  from public.connect_gift_access_requests r
  join public.connect_gift_messages g on g.id = r.gift_message_id
  where r.sender_id = auth.uid()
  order by r.requested_at desc;
$$;

revoke all on function public.create_connect_gift_message(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.request_connect_gift_access(uuid) from public, anon;
revoke all on function public.respond_connect_gift_access(uuid, boolean) from public, anon;
revoke all on function public.read_approved_connect_gift_message(uuid) from public, anon;
revoke all on function public.list_received_connect_gift_messages() from public, anon;
revoke all on function public.list_sent_connect_gift_requests() from public, anon;

grant execute on function public.create_connect_gift_message(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.request_connect_gift_access(uuid) to authenticated;
grant execute on function public.respond_connect_gift_access(uuid, boolean) to authenticated;
grant execute on function public.read_approved_connect_gift_message(uuid) to authenticated;
grant execute on function public.list_received_connect_gift_messages() to authenticated;
grant execute on function public.list_sent_connect_gift_requests() to authenticated;
