-- CONNECT VIP Lounge: premium reactions for VIP messages.
create table if not exists public.connect_vip_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.connect_vip_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('💜','🔥','👏','😂','✨','🚀')),
  created_at timestamptz not null default now(),
  constraint connect_vip_reaction_once unique(message_id,user_id,emoji)
);
create index if not exists connect_vip_reactions_message_idx
  on public.connect_vip_message_reactions(message_id);
alter table public.connect_vip_message_reactions enable row level security;
drop policy if exists "VIP members can view VIP reactions" on public.connect_vip_message_reactions;
create policy "VIP members can view VIP reactions"
  on public.connect_vip_message_reactions for select to authenticated
  using (public.has_active_connect_vip());
drop policy if exists "VIP members can react to VIP messages" on public.connect_vip_message_reactions;
create policy "VIP members can react to VIP messages"
  on public.connect_vip_message_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.has_active_connect_vip()
    and exists (select 1 from public.connect_vip_messages m where m.id = message_id));
drop policy if exists "VIP members can remove their own reactions" on public.connect_vip_message_reactions;
create policy "VIP members can remove their own reactions"
  on public.connect_vip_message_reactions for delete to authenticated
  using (user_id = auth.uid() and public.has_active_connect_vip());
revoke all on public.connect_vip_message_reactions from anon, authenticated;
grant select, insert, delete on public.connect_vip_message_reactions to authenticated;
do $$
begin
  alter publication supabase_realtime add table public.connect_vip_message_reactions;
exception when duplicate_object then null;
end
$$;
