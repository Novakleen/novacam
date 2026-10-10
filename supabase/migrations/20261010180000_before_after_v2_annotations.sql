-- v1.16.0 — Avant/après v2 et annotations vectorielles.
-- À appliquer AVANT le déploiement du client. Ne pas lancer depuis l'agent :
-- le fichier est la migration, il n'est pas appliqué ici.
--
-- media.kind : photo | before_after | annotated
-- media.annotations : document vectoriel (le fichier original dans file_url reste intact)
-- media.annotated_url : JPEG aplati (variante web du pipeline) pour l'affichage et le partage
-- before_after_comparisons.template : side-by-side | stacked | diagonal | slider
-- before_after_comparisons.export_media_id : média JPEG exporté (kind = before_after)
-- before_after_comparisons.layout : transforms, curseur, langue des libellés, coin du logo
-- company_branding : logo téléversé par un admin (repli : mot-symbole NovaKleen)

alter table public.media
  add column if not exists kind text not null default 'photo',
  add column if not exists annotations jsonb,
  add column if not exists annotated_url text;

comment on column public.media.kind is 'photo, before_after (JPEG composé) ou annotated (photo avec tracés).';
comment on column public.media.annotations is 'Annotations vectorielles. file_url reste la photo d''origine.';
comment on column public.media.annotated_url is 'JPEG aplati servi dans la grille et le visionneur.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'media_kind_check') then
    alter table public.media
      add constraint media_kind_check
      check (kind in ('photo', 'before_after', 'annotated'));
  end if;
end $$;

alter table public.before_after_comparisons
  add column if not exists template text not null default 'slider',
  add column if not exists export_media_id uuid,
  add column if not exists layout jsonb;

comment on column public.before_after_comparisons.template is 'side-by-side, stacked, diagonal ou slider.';
comment on column public.before_after_comparisons.export_media_id is 'Média JPEG produit par le compositeur.';
comment on column public.before_after_comparisons.layout is 'Réglages du compositeur : transforms, slider, labelLang, logoCorner, showDateStrip.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'before_after_comparisons_template_check') then
    alter table public.before_after_comparisons
      add constraint before_after_comparisons_template_check
      check (template in ('side-by-side', 'stacked', 'diagonal', 'slider'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'before_after_comparisons_export_media_id_fkey') then
    alter table public.before_after_comparisons
      add constraint before_after_comparisons_export_media_id_fkey
      foreign key (export_media_id) references public.media (id) on delete set null;
  end if;
end $$;

create table if not exists public.company_branding (
  id text primary key,
  logo_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.company_branding (id)
values ('default')
on conflict (id) do nothing;

comment on table public.company_branding is 'Logo d''entreprise pour les comparaisons avant/après.';

alter table public.company_branding enable row level security;

drop policy if exists company_branding_read on public.company_branding;
create policy company_branding_read on public.company_branding
  for select to authenticated
  using (true);

drop policy if exists company_branding_admin_write on public.company_branding;
create policy company_branding_admin_write on public.company_branding
  for all to authenticated
  using (public.profiles_is_admin())
  with check (public.profiles_is_admin());

grant select, insert, update, delete on public.company_branding to authenticated;
