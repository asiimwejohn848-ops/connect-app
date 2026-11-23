-- Enable Supabase Realtime for CONNECT private messages.
-- Run this migration in the Supabase SQL Editor.

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then
    null;
end
$$;
