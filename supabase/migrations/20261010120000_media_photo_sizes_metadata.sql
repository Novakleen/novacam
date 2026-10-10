-- v1.15.0 — Tailles photo (web + miniature) et métadonnées de prise de vue.
-- À appliquer AVANT le merge / le déploiement du client : les uploads écrivent ces colonnes.
-- web_url = variante ~1600 px (file_url reste l'original, thumbnail_url la miniature).

alter table public.media
  add column if not exists web_url text,
  add column if not exists captured_at timestamptz,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists width integer,
  add column if not exists height integer;

comment on column public.media.web_url is 'Variante web (~1600 px de grand côté) servie dans le visionneur avant le zoom.';
comment on column public.media.captured_at is 'Date de prise de vue EXIF (ou géolocalisée). Distinct de created_at.';
comment on column public.media.latitude is 'Latitude WGS84, EXIF ou position de l''appareil si la capture n''a pas de GPS.';
comment on column public.media.longitude is 'Longitude WGS84.';
comment on column public.media.width is 'Largeur source après orientation EXIF, en pixels.';
comment on column public.media.height is 'Hauteur source après orientation EXIF, en pixels.';

create index if not exists media_project_id_captured_at_idx
  on public.media (project_id, captured_at);
