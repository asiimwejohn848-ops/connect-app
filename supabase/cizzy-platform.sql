-- Cizzy Technologies product directory and staff access
-- Run this script in the Supabase SQL Editor before using /admin.

create table if not exists public.cizzy_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  created_at timestamptz not null default now()
);

create table if not exists public.cizzy_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text not null default '',
  description text not null default '',
  category text not null default 'Application',
  status text not null default 'in_development'
    check (status in ('draft', 'in_development', 'coming_soon', 'available')),
  featured boolean not null default false,
  logo_url text not null default '',
  website_url text not null default '',
  android_url text not null default '',
  ios_url text not null default '',
  screenshots text[] not null default '{}',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cizzy_products_public_order
  on public.cizzy_products(status, featured desc, sort_order, created_at desc);

create or replace function public.is_cizzy_staff()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cizzy_staff
    where user_id = (select auth.uid())
  );
$$;

create or replace function public.is_cizzy_owner()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cizzy_staff
    where user_id = (select auth.uid()) and role = 'owner'
  );
$$;

revoke all on function public.is_cizzy_staff() from public;
revoke all on function public.is_cizzy_owner() from public;
grant execute on function public.is_cizzy_staff() to authenticated;
grant execute on function public.is_cizzy_owner() to authenticated;

alter table public.cizzy_staff enable row level security;
alter table public.cizzy_products enable row level security;

drop policy if exists "Staff can read own membership or owners can read all" on public.cizzy_staff;
create policy "Staff can read own membership or owners can read all"
on public.cizzy_staff for select to authenticated
using (user_id = (select auth.uid()) or public.is_cizzy_owner());

drop policy if exists "Owners can add team members" on public.cizzy_staff;
create policy "Owners can add team members"
on public.cizzy_staff for insert to authenticated
with check (public.is_cizzy_owner());

drop policy if exists "Owners can change team roles" on public.cizzy_staff;
create policy "Owners can change team roles"
on public.cizzy_staff for update to authenticated
using (public.is_cizzy_owner())
with check (public.is_cizzy_owner());

drop policy if exists "Owners can remove team members" on public.cizzy_staff;
create policy "Owners can remove team members"
on public.cizzy_staff for delete to authenticated
using (public.is_cizzy_owner() and user_id <> (select auth.uid()));

drop policy if exists "Public can view non-draft products" on public.cizzy_products;
create policy "Public can view non-draft products"
on public.cizzy_products for select to anon, authenticated
using (status <> 'draft' or public.is_cizzy_staff());

drop policy if exists "Staff can add products" on public.cizzy_products;
create policy "Staff can add products"
on public.cizzy_products for insert to authenticated
with check (public.is_cizzy_staff());

drop policy if exists "Staff can update products" on public.cizzy_products;
create policy "Staff can update products"
on public.cizzy_products for update to authenticated
using (public.is_cizzy_staff())
with check (public.is_cizzy_staff());

drop policy if exists "Staff can delete products" on public.cizzy_products;
create policy "Staff can delete products"
on public.cizzy_products for delete to authenticated
using (public.is_cizzy_staff());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cizzy-product-media', 'cizzy-product-media', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view Cizzy product media" on storage.objects;
create policy "Anyone can view Cizzy product media"
on storage.objects for select to anon, authenticated
using (bucket_id = 'cizzy-product-media');

drop policy if exists "Cizzy staff can upload product media" on storage.objects;
create policy "Cizzy staff can upload product media"
on storage.objects for insert to authenticated
with check (bucket_id = 'cizzy-product-media' and public.is_cizzy_staff());

drop policy if exists "Cizzy staff can update product media" on storage.objects;
create policy "Cizzy staff can update product media"
on storage.objects for update to authenticated
using (bucket_id = 'cizzy-product-media' and public.is_cizzy_staff())
with check (bucket_id = 'cizzy-product-media' and public.is_cizzy_staff());

drop policy if exists "Cizzy staff can delete product media" on storage.objects;
create policy "Cizzy staff can delete product media"
on storage.objects for delete to authenticated
using (bucket_id = 'cizzy-product-media' and public.is_cizzy_staff());

-- Bootstrap the first owner after creating and confirming their account:
-- insert into public.cizzy_staff (user_id, role)
-- values ('YOUR-AUTH-USER-UUID', 'owner');
