-- v1.14.1 — Restreint la lecture de sms_logs / whatsapp_logs aux Admin et Manager.
--
-- Avant : tout utilisateur authentifié pouvait lire (et, pour sms_logs, modifier)
-- l'historique Direct7. L'UI ne consulte ces tables que depuis /direct7-debug
-- (Admin, Manager). Les écritures passent par les edge functions en service_role,
-- qui contourne la RLS.

create or replace function public.profiles_is_admin_or_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Admin', 'Manager')
  );
$$;

revoke all on function public.profiles_is_admin_or_manager() from public, anon;
grant execute on function public.profiles_is_admin_or_manager() to authenticated;

revoke all on table public.sms_logs from anon, authenticated;
revoke all on table public.whatsapp_logs from anon, authenticated;
grant select on table public.sms_logs to authenticated;
grant select on table public.whatsapp_logs to authenticated;

drop policy if exists "Auth users full access sms_logs" on public.sms_logs;
create policy "Office can read sms_logs"
  on public.sms_logs
  for select
  to authenticated
  using (public.profiles_is_admin_or_manager());

drop policy if exists "Authenticated users can insert whatsapp logs" on public.whatsapp_logs;
drop policy if exists "Authenticated users can read whatsapp logs" on public.whatsapp_logs;
create policy "Office can read whatsapp_logs"
  on public.whatsapp_logs
  for select
  to authenticated
  using (public.profiles_is_admin_or_manager());
