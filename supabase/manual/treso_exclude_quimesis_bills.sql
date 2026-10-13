-- One-off. Not a migration. Run by hand in the SQL editor.
-- Marks supplier bills already imported for Quimesis as excluded from cash.
-- Later imports set the flag from treso_settings.excluded_names (when that
-- column exists) and from client or supplier names already excluded.

update public.treso_supplier_bills
set excluded_from_cash = true,
    updated_at = now()
where excluded_from_cash = false
  and supplier_name ilike '%quimesis%';
