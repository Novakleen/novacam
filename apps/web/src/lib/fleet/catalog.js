/** v1.10.0 catalog helpers shared by the UI (mirror of public.fleet_norm in SQL). */
export function fleet_norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Øø]/g, 'o')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
