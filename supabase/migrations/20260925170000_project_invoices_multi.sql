-- v1.6.20 — Multiple HubSpot invoices per chantier (project).
-- New join table public.project_invoices (1 project → N HubSpot invoices).
-- Existing single links (projects.hubspot_invoice_*) are copied in (position 0).
-- Legacy columns on projects are KEPT and mirrored to the first linked invoice
-- by trigger, so older readers / cached clients keep working.
-- Applied on novaquote via Supabase MCP apply_migration.

create table if not exists public.project_invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  hubspot_invoice_id text not null,
  invoice_number text null,
  amount_ht numeric null,
  currency text null default 'EUR',
  status text null,
  invoice_date date null,
  position integer not null default 0,
  created_by uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_invoices_project_invoice_unique unique (project_id, hubspot_invoice_id)
);

create index if not exists project_invoices_project_id_idx
  on public.project_invoices (project_id, position, created_at);
create index if not exists project_invoices_hubspot_invoice_id_idx
  on public.project_invoices (hubspot_invoice_id);

create or replace function public.set_project_invoices_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_invoices_set_updated_at on public.project_invoices;
create trigger project_invoices_set_updated_at
  before update on public.project_invoices
  for each row
  execute function public.set_project_invoices_updated_at();

-- Mirror first linked invoice into legacy projects.hubspot_invoice_* columns.
create or replace function public.sync_project_invoice_legacy_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  pid uuid;
begin
  pid := coalesce(new.project_id, old.project_id);
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    perform public.sync_project_invoice_legacy_for(old.project_id);
  end if;
  perform public.sync_project_invoice_legacy_for(pid);
  return null;
end;
$$;

create or replace function public.sync_project_invoice_legacy_for(pid uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  first_inv record;
begin
  if pid is null then return; end if;
  select hubspot_invoice_id, invoice_number, amount_ht, currency, status
    into first_inv
    from public.project_invoices
   where project_id = pid
   order by position asc, created_at asc
   limit 1;

  if found then
    update public.projects
       set hubspot_invoice_id = first_inv.hubspot_invoice_id,
           hubspot_invoice_number = first_inv.invoice_number,
           hubspot_invoice_amount = first_inv.amount_ht,
           hubspot_invoice_currency = first_inv.currency,
           hubspot_invoice_status = first_inv.status
     where id = pid
       and (hubspot_invoice_id is distinct from first_inv.hubspot_invoice_id
         or hubspot_invoice_number is distinct from first_inv.invoice_number
         or hubspot_invoice_amount is distinct from first_inv.amount_ht
         or hubspot_invoice_currency is distinct from first_inv.currency
         or hubspot_invoice_status is distinct from first_inv.status);
  else
    update public.projects
       set hubspot_invoice_id = null,
           hubspot_invoice_number = null,
           hubspot_invoice_amount = null,
           hubspot_invoice_currency = null,
           hubspot_invoice_status = null
     where id = pid
       and hubspot_invoice_id is not null;
  end if;
end;
$$;

drop trigger if exists project_invoices_sync_legacy on public.project_invoices;
create trigger project_invoices_sync_legacy
  after insert or update or delete on public.project_invoices
  for each row
  execute function public.sync_project_invoice_legacy_columns();

-- RLS: read like projects (any authenticated user; invoice fields already live on
-- projects), write Admin only (Source Facture block is admin-only).
alter table public.project_invoices enable row level security;

drop policy if exists "project_invoices_select_authenticated" on public.project_invoices;
create policy "project_invoices_select_authenticated"
  on public.project_invoices for select to authenticated
  using (true);

drop policy if exists "project_invoices_admin_insert" on public.project_invoices;
create policy "project_invoices_admin_insert"
  on public.project_invoices for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin'));

drop policy if exists "project_invoices_admin_update" on public.project_invoices;
create policy "project_invoices_admin_update"
  on public.project_invoices for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin'));

drop policy if exists "project_invoices_admin_delete" on public.project_invoices;
create policy "project_invoices_admin_delete"
  on public.project_invoices for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin'));

grant select, insert, update, delete on public.project_invoices to authenticated;

-- Backfill existing single links (no data loss; legacy columns untouched).
insert into public.project_invoices
  (project_id, hubspot_invoice_id, invoice_number, amount_ht, currency, status, position, created_at)
select id, hubspot_invoice_id, hubspot_invoice_number, hubspot_invoice_amount,
       hubspot_invoice_currency, hubspot_invoice_status, 0,
       coalesce(updated_at, now())
  from public.projects
 where hubspot_invoice_id is not null
   and btrim(hubspot_invoice_id) <> ''
on conflict (project_id, hubspot_invoice_id) do nothing;

notify pgrst, 'reload schema';
