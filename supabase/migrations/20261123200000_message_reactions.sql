-- CONNECT private message reactions
-- Run this migration in the Supabase SQL Editor.

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🔥')),
  created_at timestamptz not null default now(),
  constraint message_reactions_unique unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

drop policy if exists "Participants can view message reactions" on public.message_reactions;
create policy "Participants can view message reactions"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    )
  );

drop policy if exists "Participants can add their own reactions" on public.message_reactions;
create policy "Participants can add their own reactions"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    )
  );

drop policy if exists "Users can remove their own reactions" on public.message_reactions;
create policy "Users can remove their own reactions"
  on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.message_reactions to authenticated;
revoke all on public.message_reactions from anon;

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception
  when duplicate_object then null;
end
$$;
