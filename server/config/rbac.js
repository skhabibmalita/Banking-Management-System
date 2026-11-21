// Role-Based Access Control definition. Roles map to permissions; an admin may also hold
// extra permissions granted individually (Admin.permissions). Enforced by middleware in Phase 5.
export const PERMISSIONS = [
  'customers:read',
  'accounts:read',
  'accounts:freeze',
  'transactions:read',
  'kyc:review',
  'fraud:read',
  'fraud:review',
  'reports:read',
  'audit:read',
  'admins:manage',
];

export const ROLE_PERMISSIONS = {
  superadmin: [...PERMISSIONS],
  kyc_officer: ['customers:read', 'kyc:review'],
  operations: ['customers:read', 'accounts:read', 'accounts:freeze', 'transactions:read', 'fraud:read', 'fraud:review', 'reports:read'],
  auditor: ['customers:read', 'accounts:read', 'transactions:read', 'fraud:read', 'reports:read', 'audit:read'],
};

export const ROLES = Object.keys(ROLE_PERMISSIONS);

export function permissionsFor(admin) {
  return [...new Set([...(ROLE_PERMISSIONS[admin.role] || []), ...(admin.permissions || [])])];
}

export const can = (admin, permission) => permissionsFor(admin).includes(permission);
