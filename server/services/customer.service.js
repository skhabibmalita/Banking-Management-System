import ApiError from '../utils/ApiError.js';
import { logAudit } from './audit.service.js';

export async function updateProfile(customer, changes, req) {
  if (changes.name !== undefined && changes.name !== customer.name && customer.kycStatus === 'verified') {
    throw ApiError.forbidden('Your name is locked after KYC verification. Contact support to change it.', { code: 'NAME_LOCKED' });
  }
  const changed = Object.keys(changes).filter((k) => changes[k] !== customer[k]);
  if (!changed.length) return customer;

  Object.assign(customer, changes);
  await customer.save();
  await logAudit({ req, actorId: customer._id, actorModel: 'Customer', action: 'PROFILE_UPDATED', entityType: 'Customer', entityId: customer._id, meta: { fields: changed } });
  return customer;
}
