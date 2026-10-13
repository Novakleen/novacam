#!/bin/bash
# Postgres local (pas le projet Supabase de production).
# Usage : supabase/tests/run_treso_v117.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=novacam_treso_v117
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists ${DB};" -c "create database ${DB};"

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role treso_migrator_sim nologin; exception when duplicate_object then null; end $$;
do $$ begin create role spatial_owner nologin; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role, treso_migrator_sim to postgres;
grant usage on schema public to treso_migrator_sim;

create schema if not exists auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users (id),
  role text
);
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select using (true);
grant select on public.profiles to anon, authenticated;

create table public.projects (id uuid primary key default gen_random_uuid());

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');
insert into public.profiles (id, role) values
  ('11111111-1111-1111-1111-111111111111', 'Member'),
  ('22222222-2222-2222-2222-222222222222', 'Manager'),
  ('33333333-3333-3333-3333-333333333333', 'Admin');

create schema if not exists storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

create table public.spatial_ref_sys (
  srid integer primary key,
  auth_name varchar(256),
  auth_srid integer,
  srtext varchar(2048),
  proj4text varchar(2048)
);
insert into public.spatial_ref_sys (srid, auth_name, auth_srid) values (4326, 'EPSG', 4326);
grant select on public.spatial_ref_sys to anon, authenticated;

create table public.spatial_ref_sys_unowned (like public.spatial_ref_sys including all);
alter table public.spatial_ref_sys_unowned owner to spatial_owner;
SQL

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/20261013120000_treso_foundation.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/20261013120000_treso_foundation.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f supabase/seeds/treso_echeancier_v1.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f supabase/seeds/treso_echeancier_v1.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/treso_v117_proof.sql

# Non-propriétaire : ALTER RLS refusé (même situation que supabase_admin en prod).
if sudo -u postgres psql -d "$DB" -c "set role treso_migrator_sim; alter table public.spatial_ref_sys_unowned enable row level security;" >/tmp/spatial_fallback.txt 2>&1; then
  echo "FAIL spatial fallback: non-owner altered RLS" >&2
  cat /tmp/spatial_fallback.txt >&2
  exit 1
fi
echo "PASS spatial fallback (non-owner ALTER refused):"
cat /tmp/spatial_fallback.txt
