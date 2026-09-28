-- v1.13.1 — Empêche l'escalade de privilèges via profiles.role
--
-- Bug: la policy « Users can update own profile » (USING auth.uid() = id, sans WITH CHECK)
-- laissait tout utilisateur connecté se passer Admin (vérifié sur un compte technicien).
--
-- Correctif (dur à contourner) :
--   1. Trigger BEFORE INSERT OR UPDATE : refuse tout changement de `role` (et de `email`)
--      sauf si l'appelant est Admin OU service_role (edge function admin-update-user).
--      Les Managers ne peuvent PAS changer les rôles.
--   2. Policy UPDATE Admin : les Admins peuvent mettre à jour n'importe quel profil
--      (la gestion utilisateurs passe déjà par l'edge function service_role ; la policy
--      couvre aussi un UPDATE client direct).
-- Compatible avec la v1.13.0 live (additive : trigger + policy Admin ; la policy
-- « update own » reste, le trigger bloque l'escalade).

create or replace function public.profiles_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'Admin'
  );
$$;

revoke all on function public.profiles_is_admin() from public, anon;
grant execute on function public.profiles_is_admin() to authenticated;

create or replace function public.profiles_protect_privileged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allow boolean;
begin
  -- service_role (edge functions admin-*) and Admins may change privileged columns
  allow := coalesce(auth.role(), '') = 'service_role' or public.profiles_is_admin();

  if tg_op = 'INSERT' then
    if not allow
       and new.role is not null
       and new.role not in ('Member', 'Viewer') then
      raise exception 'PROFILES_ROLE_LOCKED: only an Admin can set profiles.role'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if not allow then
    if new.role is distinct from old.role then
      raise exception 'PROFILES_ROLE_LOCKED: only an Admin can change profiles.role'
        using errcode = '42501';
    end if;
    if new.email is distinct from old.email then
      raise exception 'PROFILES_EMAIL_LOCKED: only an Admin can change profiles.email'
        using errcode = '42501';
    end if;
    if new.id is distinct from old.id then
      raise exception 'PROFILES_ID_LOCKED: profiles.id cannot be changed'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.profiles_protect_privileged() from public, anon;

drop trigger if exists profiles_protect_privileged on public.profiles;
create trigger profiles_protect_privileged
  before insert or update on public.profiles
  for each row
  execute function public.profiles_protect_privileged();

-- Admins may update any profile (role included). Managers cannot.
drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
  on public.profiles
  for update
  to authenticated
  using (public.profiles_is_admin())
  with check (public.profiles_is_admin());
