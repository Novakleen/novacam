-- v1.20.0 — liste des contreparties hors cash (Quimesis).
-- Non appliquée en production par l'agent : à lancer avec le déploiement.

alter table public.treso_settings
  add column if not exists excluded_names text[] not null default '{Quimesis}';

comment on column public.treso_settings.excluded_names is
  'Noms ignorés à l''import des factures fournisseurs. Défaut : Quimesis.';
