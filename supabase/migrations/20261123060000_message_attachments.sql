-- CONNECT private image and document attachments
-- Run this migration in the Supabase SQL Editor.

alter table public.messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'connect-message-attachments',
  'connect-message-attachments',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own CONNECT attachments" on storage.objects;
create policy "Users can upload their own CONNECT attachments"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'connect-message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Conversation participants can view CONNECT attachments" on storage.objects;
create policy "Conversation participants can view CONNECT attachments"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'connect-message-attachments'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.messages as message
        where message.attachment_path = storage.objects.name
          and (message.sender_id = auth.uid() or message.recipient_id = auth.uid())
      )
    )
  );

drop policy if exists "Users can delete their own CONNECT attachments" on storage.objects;
create policy "Users can delete their own CONNECT attachments"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'connect-message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
