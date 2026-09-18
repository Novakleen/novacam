-- Fix project_expenses.user_id FK for PostgREST embed profiles:user_id(...)
-- Live bug: FK pointed at auth.users, so UI select with profiles embed failed
-- (toast « Impossible de charger les dépenses »). Already applied on novaquote.
-- This file documents the fix in git; safe to re-run (idempotent).

do $$
declare
  fk_name text;
begin
  select con.conname into fk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'project_expenses'
    and con.contype = 'f'
    and pg_get_constraintdef(con.oid) ilike '%user_id%';

  if fk_name is not null then
    execute format('alter table public.project_expenses drop constraint %I', fk_name);
  end if;
end $$;

alter table public.project_expenses
  add constraint project_expenses_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete set null;

drop policy if exists "project_expenses_insert_authenticated" on public.project_expenses;
create policy "project_expenses_insert_authenticated"
  on public.project_expenses
  for insert
  to authenticated
  with check (true);

notify pgrst, 'reload schema';
