-- project_expenses: nacelle / hotel / parking / materiel / other costs per project
-- Already applied on novaquote (live Supabase). This file documents the schema in git only.
-- Do not re-apply via CLI unless recreating an empty environment.
-- IMPORTANT: user_id must reference public.profiles(id) (not auth.users) so PostgREST
-- can embed profiles:user_id(...). See also 20260918105000_fix_project_expenses_user_fk.sql.

create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references public.projects (id) on delete set null,
  companycam_project_id text null,
  user_id uuid null references public.profiles (id) on delete set null,
  expense_date date not null default (current_date),
  category text not null
    check (category in ('nacelle', 'hotel', 'parking', 'materiel', 'other')),
  label text not null,
  amount_ht numeric not null check (amount_ht >= 0),
  vat_rate numeric null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_expenses_project_ref_check
    check (project_id is not null or companycam_project_id is not null)
);

create index if not exists project_expenses_project_id_idx
  on public.project_expenses (project_id);

create index if not exists project_expenses_companycam_project_id_idx
  on public.project_expenses (companycam_project_id);

create index if not exists project_expenses_expense_date_idx
  on public.project_expenses (expense_date desc);

create or replace function public.set_project_expenses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_expenses_set_updated_at on public.project_expenses;
create trigger project_expenses_set_updated_at
  before update on public.project_expenses
  for each row
  execute function public.set_project_expenses_updated_at();

alter table public.project_expenses enable row level security;

drop policy if exists "project_expenses_select_authenticated" on public.project_expenses;
create policy "project_expenses_select_authenticated"
  on public.project_expenses
  for select
  to authenticated
  using (true);

drop policy if exists "project_expenses_insert_authenticated" on public.project_expenses;
create policy "project_expenses_insert_authenticated"
  on public.project_expenses
  for insert
  to authenticated
  with check (true);

drop policy if exists "project_expenses_update_authenticated" on public.project_expenses;
create policy "project_expenses_update_authenticated"
  on public.project_expenses
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "project_expenses_delete_authenticated" on public.project_expenses;
create policy "project_expenses_delete_authenticated"
  on public.project_expenses
  for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.project_expenses to authenticated;
