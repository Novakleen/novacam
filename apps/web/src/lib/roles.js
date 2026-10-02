/**
 * v1.13.0 role helpers (profiles.role: 'Admin' | 'Manager' | 'Member' | 'Viewer').
 * Manager = full access to the Marges module (params, simulator, project Marge tab)
 * and per-project HubSpot / Calendar linking (deal, quote, invoices) so they can generate margins.
 * NOT user management, fleet admin, or global admin-only pages.
 */
export const MARGIN_ROLES = ['Admin', 'Manager'];

export function canManageMargins(role) {
  return MARGIN_ROLES.includes(role);
}
