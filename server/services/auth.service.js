import { Customer, Notification } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { burnTime, hashPassword, verifyPassword } from '../utils/password.js';
import { LOCK_MINUTES, MAX_FAILED_LOGINS } from '../config/realms.js';
import { logAudit } from './audit.service.js';
import { revokeAllSessions } from './session.service.js';

const invalidCredentials = () => ApiError.unauthorized('Invalid email or password', { code: 'INVALID_CREDENTIALS' });

export async function registerCustomer(data, req) {
  const { password, ...profile } = data;
  const passwordHash = await hashPassword(password);
  let customer;
  try {
    customer = await Customer.create({ ...profile, passwordHash });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('An account with this email already exists', { code: 'EMAIL_TAKEN' });
    throw err;
  }
  await Notification.create({
    customerId: customer._id,
    title: 'Welcome to Northwind',
    message: 'Complete KYC verification to unlock transfers.',
    type: 'info',
  }).catch((e) => console.error('welcome notification failed:', e.message));
  await logAudit({ req, actorId: customer._id, actorModel: 'Customer', action: 'REGISTER', entityType: 'Customer', entityId: customer._id });
  return customer;
}

export async function verifyLogin(realm, { email, password }, req) {
  const audit = (action, user) =>
    logAudit({ req, actorId: user?._id, actorModel: user ? realm.modelName : 'System', action, entityType: realm.modelName, entityId: user?._id, meta: user ? undefined : { email } });

  const user = await realm.model.findOne({ email }).select('+passwordHash');
  if (!user) {
    await burnTime(password);
    await audit('LOGIN_FAILED');
    throw invalidCredentials();
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    throw new ApiError(423, 'Too many failed attempts. Try again in a few minutes.', { code: 'ACCOUNT_LOCKED' });
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const updated = await realm.model.findByIdAndUpdate(user._id, { $inc: { failedLoginAttempts: 1 } }, { new: true });
    if (updated.failedLoginAttempts >= MAX_FAILED_LOGINS) {
      await realm.model.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lockUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } });
      await audit('ACCOUNT_LOCKED', user);
    }
    await audit('LOGIN_FAILED', user);
    throw invalidCredentials();
  }

  if (!user.isActive) throw ApiError.forbidden('This account has been disabled', { code: 'ACCOUNT_DISABLED' });

  await realm.model.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lastLoginAt: new Date() }, $unset: { lockUntil: 1 } });
  await audit('LOGIN_SUCCESS', user);
  return user;
}

export async function changePassword(realm, user, { currentPassword, newPassword }, sessionId, req) {
  const full = await realm.model.findById(user._id).select('+passwordHash');
  if (!(await verifyPassword(currentPassword, full.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect', { code: 'WRONG_PASSWORD' });
  }
  full.passwordHash = await hashPassword(newPassword);
  await full.save();
  await revokeAllSessions(user._id, realm.modelName, sessionId); // sign out every other device
  await logAudit({ req, actorId: user._id, actorModel: realm.modelName, action: 'PASSWORD_CHANGED', entityType: realm.modelName, entityId: user._id });
}
