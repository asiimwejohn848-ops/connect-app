-- CONNECT contact request foundation
-- Run this migration in the Supabase SQL Editor for the CONNECT project.

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint contact_requests_not_self check (sender_id <> recipient_id),
  constraint contact_requests_status check (status in ('pending', 'accepted', 'declined'))
);

-- Prevent duplicate active requests in either direction.
create unique index if not exists contact_requests_active_pair_idx
  on public.contact_requests (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id)
  )
  where status in ('pending', 'accepted');

create index if not exists contact_requests_recipient_status_idx
  on public.contact_requests (recipient_id, status, created_at desc);

create index if not exists contact_requests_sender_status_idx
  on public.contact_requests (sender_id, status, created_at desc);

alter table public.contact_requests enable row level security;

drop policy if exists "Users can view their own contact requests" on public.contact_requests;
create policy "Users can view their own contact requests"
  on public.contact_requests
  for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "Users can send contact requests" on public.contact_requests;
create policy "Users can send contact requests"
  on public.contact_requests
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and recipient_id <> auth.uid()
    and status = 'pending'
  );

drop policy if exists "Recipients can respond to contact requests" on public.contact_requests;
create policy "Recipients can respond to contact requests"
  on public.contact_requests
  for update
  to authenticated
  using (recipient_id = auth.uid() and status = 'pending')
  with check (
    recipient_id = auth.uid()
    and status in ('accepted', 'declined')
  );

drop policy if exists "Senders can cancel pending contact requests" on public.contact_requests;
create policy "Senders can cancel pending contact requests"
  on public.contact_requests
  for delete
  to authenticated
  using (sender_id = auth.uid() and status = 'pending');

grant select, insert, update, delete on public.contact_requests to authenticated;
revoke all on public.contact_requests from anon;

create or replace function public.set_contact_request_response_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status in ('accepted', 'declined') then
    new.responded_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_contact_request_response_time on public.contact_requests;
create trigger set_contact_request_response_time
before update on public.contact_requests
for each row execute function public.set_contact_request_response_time();
