-- HubSpot deal (transaction) + quote (devis) link fields on projects
-- Applied live via MCP to project ghgfeiwbjjfxozqyjyfb (novacam).
-- Line items snapshot (jsonb) for reuse without re-fetching HubSpot.

alter table public.projects
  add column if not exists hubspot_deal_id text,
  add column if not exists hubspot_deal_name text,
  add column if not exists hubspot_deal_amount numeric,
  add column if not exists hubspot_deal_stage text,
  add column if not exists hubspot_deal_closedate timestamptz,
  add column if not exists hubspot_quote_id text,
  add column if not exists hubspot_quote_title text,
  add column if not exists hubspot_quote_status text,
  add column if not exists hubspot_quote_amount numeric,
  add column if not exists hubspot_quote_line_items jsonb;

create index if not exists projects_hubspot_deal_id_idx
  on public.projects (hubspot_deal_id);

create index if not exists projects_hubspot_quote_id_idx
  on public.projects (hubspot_quote_id);

comment on column public.projects.hubspot_quote_line_items is
  'Snapshot of HubSpot quote line items (name, qty, price, amount, sku) for reuse without re-fetch';
