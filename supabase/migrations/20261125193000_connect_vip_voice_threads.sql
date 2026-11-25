-- Replace VIP saved-message/theme extras with voice notes and threaded replies.
alter table public.connect_vip_messages
  add column if not exists reply_to_message_id uuid references public.connect_vip_messages(id) on delete set null,
  add column if not exists message_type text not null default 'text',
  add column if not exists audio_path text;

alter table public.connect_vip_messages
  drop constraint if exists connect_vip_messages_message_type_check;
alter table public.connect_vip_messages
  add constraint connect_vip_messages_message_type_check
  check (message_type in ('text','voice'));
alter table public.connect_vip_messages
  drop constraint if exists connect_vip_messages_voice_audio_check;
alter table public.connect_vip_messages
  add constraint connect_vip_messages_voice_audio_check
  check ((message_type = 'text' and audio_path is null) or (message_type = 'voice' and audio_path is not null));

create index if not exists connect_vip_messages_reply_idx
  on public.connect_vip_messages(reply_to_message_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('connect-vip-voice','connect-vip-voice',false,10485760,
  array['audio/webm','audio/webm;codecs=opus','audio/ogg','audio/mp4','audio/mpeg','audio/wav'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "VIP members upload own voice notes" on storage.objects;
create policy "VIP members upload own voice notes" on storage.objects
for insert to authenticated
with check (bucket_id = 'connect-vip-voice'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_active_connect_vip());

drop policy if exists "VIP members read voice notes" on storage.objects;
create policy "VIP members read voice notes" on storage.objects
for select to authenticated
using (bucket_id = 'connect-vip-voice' and public.has_active_connect_vip());

drop policy if exists "VIP members delete own voice notes" on storage.objects;
create policy "VIP members delete own voice notes" on storage.objects
for delete to authenticated
using (bucket_id = 'connect-vip-voice'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_active_connect_vip());

-- Remove the retired saved-message feature; no chat messages are deleted.
drop table if exists public.connect_vip_saved_messages;
