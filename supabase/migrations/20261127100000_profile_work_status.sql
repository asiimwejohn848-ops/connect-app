-- CONNECT: role, current activity, and availability settings.
-- Existing profile access policies keep these fields visible only to signed-in members.

alter table public.profiles
  add column if not exists team_role text not null default '',
  add column if not exists current_activity text not null default '',
  add column if not exists availability_status text not null default 'available';

alter table public.profiles
  drop constraint if exists profiles_team_role_length,
  drop constraint if exists profiles_current_activity_length,
  drop constraint if exists profiles_availability_status_check;

alter table public.profiles
  add constraint profiles_team_role_length
    check (char_length(team_role) <= 80),
  add constraint profiles_current_activity_length
    check (char_length(current_activity) <= 120),
  add constraint profiles_availability_status_check
    check (availability_status in ('available', 'busy', 'away', 'offline'));

create index if not exists profiles_availability_status_idx
  on public.profiles (availability_status, display_name);
