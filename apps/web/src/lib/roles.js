/**
 * v1.13.0 role helpers (profiles.role: 'Admin' | 'Manager' | 'Member' | 'Viewer').
 * Manager = full access to the Marges module (params, simulator, project Marge tab),
 * plus the Admin/Manager tools that already existed; NOT user management / fleet admin / HubSpot admin panel.
 */
export const MARGIN_ROLES = ['Admin', 'Manager'];

export function canManageMargins(role) {
  return MARGIN_ROLES.includes(role);
}
