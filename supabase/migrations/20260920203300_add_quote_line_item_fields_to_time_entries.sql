-- Link time entries to exact HubSpot quote line items (postes du devis)
-- for partial job tracking: remaining = quote_quantity − sum(quantity_done).
-- Applied live via MCP to project ghgfeiwbjjfxozqyjyfb (novacam).

alter table public.time_entries
  add column if not exists hubspot_line_item_id text,
  add column if not exists quote_quantity numeric,
  add column if not exists quantity_done numeric;

create index if not exists time_entries_hubspot_line_item_id_idx
  on public.time_entries (hubspot_line_item_id);

create index if not exists time_entries_project_line_item_idx
  on public.time_entries (project_id, hubspot_line_item_id)
  where hubspot_line_item_id is not null;

comment on column public.time_entries.hubspot_line_item_id is
  'HubSpot line item id from the project devis snapshot (projects.hubspot_quote_line_items)';
comment on column public.time_entries.quote_quantity is
  'Planned quantity from the devis line at encoding time';
comment on column public.time_entries.quantity_done is
  'Quantity completed in this time entry (partial jobs allowed)';
