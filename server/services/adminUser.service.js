import { Admin } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { permissionsFor } from '../config/rbac.js';
import { hashPassword } from '../utils/password.js';
import { generateTempPassword } from '../utils/tempPassword.js';
import { logAudit } from './audit.service.js';
import { revokeAllSessions } from './session.service.js';

export const adminDTO = (a) => ({
  id: a.id, name: a.name, email: a.email, role: a.role,
  permissions: a.permissions, effectivePermissions: permissionsFor(a),
  isActive: a.isActive, lastLoginAt: a.lastLoginAt, createdAt: a.createdAt,
});

export async function listAdmins() {
  return (await Admin.find().sort({ createdAt: 1 })).map(adminDTO);
}

// Only a super admin may create or change super admins, so permissions cannot be escalated sideways.
const guardSuper = (actor, targetRole) => {
  if (targetRole === 'superadmin' && actor.role !== 'superadmin') {
    throw ApiError.forbidden('Only a super admin can manage super admins', { code: 'SUPERADMIN_ONLY' });
  }
};

export async function createAdmin({ actor, data, req }) {
  guardSuper(actor, data.role);
  const temporaryPassword = generateTempPassword();
  let admin;
  try {
    admin = await Admin.create({ ...data, passwordHash: await hashPassword(temporaryPassword), createdBy: actor._id });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('An admin with this email already exists', { code: 'EMAIL_TAKEN' });
    throw err;
  }
  await logAudit({ req, actorId: actor._id, actorModel: 'Admin', action: 'ADMIN_CREATED', entityType: 'Admin', entityId: admin._id, meta: { role: admin.role } });
  return { admin: adminDTO(admin), temporaryPassword }; // shown once, never stored in plain text
}

async function load(id) {
  const admin = await Admin.findById(id);
  if (!admin) throw ApiError.notFound('Admin not found');
  return admin;
}

async function otherActiveSupers(admin) {
  return Admin.countDocuments({ role: 'superadmin', isActive: true, _id: { $ne: admin._id } });
}

export async function updateAdmin({ actor, id, changes, req }) {
  const target = await load(id);
  guardSuper(actor, target.role);
  if (changes.role) guardSuper(actor, changes.role);

  const isSelf = String(target._id) === String(actor._id);
  const touchesAccess = (changes.role !== undefined && changes.role !== target.role) || changes.isActive === false || changes.permissions !== undefined;
  if (isSelf && touchesAccess) throw ApiError.forbidden('You cannot change your own role, permissions or status', { code: 'CANNOT_MODIFY_SELF' });

  const losesSuper = target.role === 'superadmin' && target.isActive && ((changes.role && changes.role !== 'superadmin') || changes.isActive === false);
  if (losesSuper && (await otherActiveSupers(target)) === 0) {
    throw ApiError.conflict('There must always be at least one active super admin', { code: 'LAST_SUPERADMIN' });
  }

  const changed = Object.keys(changes).filter((k) => JSON.stringify(changes[k]) !== JSON.stringify(target[k]));
  if (!changed.length) return target;
  Object.assign(target, changes);
  await target.save();
  if (changes.isActive === false) await revokeAllSessions(target._id, 'Admin'); // sign them out everywhere now
  await logAudit({
    req, actorId: actor._id, actorModel: 'Admin',
    action: changes.isActive === false ? 'ADMIN_DEACTIVATED' : 'ADMIN_UPDATED',
    entityType: 'Admin', entityId: target._id, meta: { fields: changed },
  });
  return target;
}

export async function resetAdminPassword({ actor, id, req }) {
  const target = await load(id);
  guardSuper(actor, target.role);
  if (String(target._id) === String(actor._id)) {
    throw ApiError.forbidden('Use "change password" for your own account', { code: 'CANNOT_MODIFY_SELF' });
  }
  const temporaryPassword = generateTempPassword();
  await Admin.updateOne({ _id: target._id }, { $set: { passwordHash: await hashPassword(temporaryPassword), failedLoginAttempts: 0 }, $unset: { lockUntil: 1 } });
  await revokeAllSessions(target._id, 'Admin');
  await logAudit({ req, actorId: actor._id, actorModel: 'Admin', action: 'ADMIN_PASSWORD_RESET', entityType: 'Admin', entityId: target._id });
  return { temporaryPassword };
}
