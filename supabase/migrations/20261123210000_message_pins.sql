-- CONNECT personal message pins
-- Each participant can pin messages privately for their own account.

create table if not exists public.message_pins (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint message_pins_unique unique (message_id, user_id)
);

create index if not exists message_pins_user_created_idx
  on public.message_pins (user_id, created_at desc);

alter table public.message_pins enable row level security;

drop policy if exists "Users can view their own message pins" on public.message_pins;
create policy "Users can view their own message pins"
  on public.message_pins for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Participants can pin messages for themselves" on public.message_pins;
create policy "Participants can pin messages for themselves"
  on public.message_pins for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_pins.message_id
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    )
  );

drop policy if exists "Users can unpin their own messages" on public.message_pins;
create policy "Users can unpin their own messages"
  on public.message_pins for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.message_pins to authenticated;
revoke all on public.message_pins from anon;
