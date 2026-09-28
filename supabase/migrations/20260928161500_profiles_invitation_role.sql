-- v1.13.1 (suite) — Rôle via invitation + rôle par défaut à l'inscription
--
-- 1. La colonne profiles.role a pour défaut 'technician' (handle_new_user n'écrit pas de rôle) :
--    l'INSERT à l'inscription doit rester autorisé pour ce rôle par défaut (sinon signup cassé).
-- 2. Le flux d'acceptation d'invitation mettait à jour son propre profiles.role depuis le client.
--    Désormais un non-Admin ne peut changer son propre rôle QUE vers le rôle d'une invitation
--    valide (même e-mail que le compte, statut pending — ou accepted depuis < 1 h —, non expirée)
--    créée par un Admin. Une invitation créée par un non-Admin ne donne aucun rôle.
-- 3. RPC accept_invitation(p_token) : applique le rôle de l'invitation et la marque acceptée.

create or replace function public.profiles_invitation_allows(p_user uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.invitations i
    join auth.users u on u.id = p_user
    join public.profiles c on c.id = i.created_by and c.role = 'Admin'
    where lower(i.email) = lower(u.email)
      and i.role = p_role
      and (i.expires_at is null or i.expires_at > now())
      and (
        i.status = 'pending'
        or (i.status = 'accepted' and i.accepted_at > now() - interval '1 hour')
      )
  );
$$;

revoke all on function public.profiles_invitation_allows(uuid, text) from public, anon, authenticated;

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
       and new.role not in ('technician', 'Member', 'Viewer') then
      raise exception 'PROFILES_ROLE_LOCKED: only an Admin can set profiles.role'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if not allow then
    if new.role is distinct from old.role
       and not (
         new.id = auth.uid()
         and public.profiles_invitation_allows(new.id, new.role)
       ) then
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

-- Accept an invitation for the signed-in user: sets the invited role (Admin-created invitations only)
create or replace function public.accept_invitation(p_token text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'INVITATION_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select i.* into v_inv
  from public.invitations i
  join auth.users u on u.id = v_uid and lower(u.email) = lower(i.email)
  where i.token = p_token
  limit 1;

  if not found then
    raise exception 'INVITATION_INVALID' using errcode = '42501';
  end if;

  if not public.profiles_invitation_allows(v_uid, v_inv.role) then
    raise exception 'INVITATION_INVALID' using errcode = '42501';
  end if;

  -- The trigger re-checks the invitation (auth.uid() = the invited user)
  update public.profiles
     set role = v_inv.role, updated_at = now()
   where id = v_uid and role is distinct from v_inv.role;

  update public.invitations
     set status = 'accepted', accepted_at = coalesce(accepted_at, now())
   where id = v_inv.id;

  return v_inv.role;
end;
$$;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
