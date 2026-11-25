-- CONNECT VIP Chat and payment-request foundation.
-- MTN MoMo payments are manually verified until official merchant API credentials/webhooks are configured.

create table if not exists public.connect_vip_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_code text not null check (plan_code in ('weekly','monthly','quarterly','annual')),
  amount_ugx integer not null check (amount_ugx in (1000,3000,8000,30000)),
  payment_provider text not null default 'MTN Mobile Money',
  transaction_reference text not null unique,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  created_at timestamptz not null default now()
);

alter table public.connect_vip_payment_submissions enable row level security;
drop policy if exists "Users can view their own VIP payment submissions" on public.connect_vip_payment_submissions;
create policy "Users can view their own VIP payment submissions"
  on public.connect_vip_payment_submissions for select to authenticated
  using (user_id = auth.uid());
revoke all on public.connect_vip_payment_submissions from anon, authenticated;
grant select on public.connect_vip_payment_submissions to authenticated;

create or replace function public.submit_connect_vip_payment(
  p_plan_code text,
  p_transaction_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_amount integer;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if p_plan_code not in ('weekly','monthly','quarterly','annual') then
    raise exception 'Choose a valid VIP plan.';
  end if;
  if char_length(trim(coalesce(p_transaction_reference,''))) not between 5 and 100 then
    raise exception 'Enter the transaction ID from your Mobile Money receipt.';
  end if;
  v_amount := case p_plan_code
    when 'weekly' then 1000
    when 'monthly' then 3000
    when 'quarterly' then 8000
    when 'annual' then 30000
  end;
  insert into public.connect_vip_payment_submissions(user_id,plan_code,amount_ugx,transaction_reference)
  values(auth.uid(),p_plan_code,v_amount,upper(trim(p_transaction_reference)))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'That transaction ID has already been submitted.';
end;
$$;

revoke all on function public.submit_connect_vip_payment(text,text) from public, anon;
grant execute on function public.submit_connect_vip_payment(text,text) to authenticated;

create table if not exists public.connect_vip_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.connect_vip_notifications enable row level security;
drop policy if exists "Users can view their VIP notifications" on public.connect_vip_notifications;
create policy "Users can view their VIP notifications"
  on public.connect_vip_notifications for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "Users can mark their VIP notifications read" on public.connect_vip_notifications;
create policy "Users can mark their VIP notifications read"
  on public.connect_vip_notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.connect_vip_notifications from anon, authenticated;
grant select on public.connect_vip_notifications to authenticated;
grant update(read_at) on public.connect_vip_notifications to authenticated;

create or replace function public.notify_connect_vip_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'active' then
      insert into public.connect_vip_notifications(user_id,title,body)
      values (
        new.user_id,
        'Welcome to CONNECT VIP',
        'Your payment has been verified and your CONNECT VIP membership is now active. Welcome! You can now enter VIP Chat and enjoy your Premium benefits.'
      );
    end if;
  elsif new.status = 'active' and old.status is distinct from 'active' then
    insert into public.connect_vip_notifications(user_id,title,body)
    values (
      new.user_id,
      'Welcome to CONNECT VIP',
      'Your payment has been verified and your CONNECT VIP membership is now active. Welcome! You can now enter VIP Chat and enjoy your Premium benefits.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists connect_vip_activation_notice on public.connect_subscriptions;
create trigger connect_vip_activation_notice
after insert or update of status on public.connect_subscriptions
for each row execute function public.notify_connect_vip_activation();

create or replace function public.has_active_connect_vip()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connect_subscriptions s
    where s.user_id = auth.uid()
      and s.status = 'active'
      and s.starts_at <= now()
      and s.ends_at > now()
  );
$$;
revoke all on function public.has_active_connect_vip() from public, anon;
grant execute on function public.has_active_connect_vip() to authenticated;

create table if not exists public.connect_vip_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index if not exists connect_vip_messages_created_idx
  on public.connect_vip_messages(created_at desc);
alter table public.connect_vip_messages enable row level security;
drop policy if exists "Active VIP members can read VIP chat" on public.connect_vip_messages;
create policy "Active VIP members can read VIP chat"
  on public.connect_vip_messages for select to authenticated
  using (public.has_active_connect_vip());
drop policy if exists "Active VIP members can send VIP chat messages" on public.connect_vip_messages;
create policy "Active VIP members can send VIP chat messages"
  on public.connect_vip_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.has_active_connect_vip());
revoke all on public.connect_vip_messages from anon, authenticated;
grant select, insert on public.connect_vip_messages to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.connect_vip_messages;
exception when duplicate_object then null;
end
$$;
