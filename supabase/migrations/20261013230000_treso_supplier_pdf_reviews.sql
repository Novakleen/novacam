-- v1.22.2 — file de confirmation des échéances lues sur les PDF fournisseurs.
-- Non appliquée en production par l'agent : à lancer avec le déploiement.

create table if not exists public.treso_supplier_pdf_reviews (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid references public.treso_supplier_bills (id) on delete set null,
  pdf_path text,
  file_name text,
  supplier_name text,
  invoice_number text,
  invoice_date date,
  amount_ttc numeric(12,2),
  proposed_due_date date,
  proposed_source text check (proposed_source is null or proposed_source in ('pdf', 'estimee')),
  payment_terms text,
  confidence numeric,
  reason text not null check (reason in ('amount_mismatch', 'low_confidence', 'unmatched')),
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists treso_supplier_pdf_reviews_pending_idx
  on public.treso_supplier_pdf_reviews (status, created_at);

drop trigger if exists treso_supplier_pdf_reviews_set_updated_at on public.treso_supplier_pdf_reviews;
create trigger treso_supplier_pdf_reviews_set_updated_at
  before update on public.treso_supplier_pdf_reviews
  for each row execute function public.treso_set_updated_at();

alter table public.treso_supplier_pdf_reviews enable row level security;

drop policy if exists treso_supplier_pdf_reviews_admin_all on public.treso_supplier_pdf_reviews;
create policy treso_supplier_pdf_reviews_admin_all
  on public.treso_supplier_pdf_reviews
  for all to authenticated
  using (public.treso_can_access())
  with check (public.treso_can_access());

revoke all on table public.treso_supplier_pdf_reviews from public, anon;
grant select, insert, update, delete on table public.treso_supplier_pdf_reviews to authenticated;

comment on table public.treso_supplier_pdf_reviews is
  'Échéances PDF non appliquées (montant différent, confiance faible, ou facture non trouvée).';
