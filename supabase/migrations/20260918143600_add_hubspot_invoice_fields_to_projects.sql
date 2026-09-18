-- HubSpot contact cache + invoice link fields on projects
-- Already applied on novaquote (live Supabase). This file documents the schema in git only.
-- Do not re-apply via CLI unless recreating an empty environment.
-- Prerequisite: projects.hubspot_contact_id already exists.

alter table public.projects
  add column if not exists hubspot_invoice_id text,
  add column if not exists hubspot_invoice_number text,
  add column if not exists hubspot_invoice_amount numeric,
  add column if not exists hubspot_invoice_currency text,
  add column if not exists hubspot_invoice_status text,
  add column if not exists hubspot_contact_name text,
  add column if not exists hubspot_contact_email text;

create index if not exists projects_hubspot_invoice_id_idx
  on public.projects (hubspot_invoice_id);

create index if not exists projects_hubspot_contact_id_idx
  on public.projects (hubspot_contact_id);

create index if not exists projects_companycam_project_id_idx
  on public.projects (companycam_project_id);
