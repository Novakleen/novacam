-- Google Calendar intervention link on projects (hello@novakleen.be)
-- Applied live via MCP to project ghgfeiwbjjfxozqyjyfb (novaquote).

alter table public.projects
  add column if not exists google_calendar_event_id text,
  add column if not exists google_calendar_title text,
  add column if not exists google_calendar_start timestamptz,
  add column if not exists google_calendar_end timestamptz,
  add column if not exists google_calendar_attendees jsonb,
  add column if not exists google_calendar_html_link text,
  add column if not exists google_calendar_id text;

create index if not exists projects_google_calendar_event_id_idx
  on public.projects (google_calendar_event_id);

comment on column public.projects.google_calendar_event_id is
  'Google Calendar event id linked as intervention';
comment on column public.projects.google_calendar_title is
  'Snapshot of event summary/title';
comment on column public.projects.google_calendar_start is
  'Snapshot of event start (dateTime or date as timestamptz)';
comment on column public.projects.google_calendar_end is
  'Snapshot of event end';
comment on column public.projects.google_calendar_attendees is
  'Snapshot of invited attendees (field workers): [{email, displayName, responseStatus}]';
comment on column public.projects.google_calendar_html_link is
  'Google Calendar htmlLink to open the event';
comment on column public.projects.google_calendar_id is
  'Calendar id (default hello@novakleen.be)';
