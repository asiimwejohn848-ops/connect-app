-- CONNECT private voice-message storage
-- Run this migration in the Supabase SQL Editor.

alter table public.messages
  add column if not exists voice_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'connect-voice-messages',
  'connect-voice-messages',
  false,
  20971520,
  array['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own CONNECT voice messages" on storage.objects;
create policy "Users can upload their own CONNECT voice messages"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'connect-voice-messages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Conversation participants can listen to CONNECT voice messages" on storage.objects;
create policy "Conversation participants can listen to CONNECT voice messages"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'connect-voice-messages'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.messages as message
        where message.voice_path = storage.objects.name
          and (message.sender_id = auth.uid() or message.recipient_id = auth.uid())
      )
    )
  );

drop policy if exists "Users can delete their own CONNECT voice messages" on storage.objects;
create policy "Users can delete their own CONNECT voice messages"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'connect-voice-messages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
