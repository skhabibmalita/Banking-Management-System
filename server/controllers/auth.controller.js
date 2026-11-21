import asyncHandler from '../middleware/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import { REALMS } from '../config/realms.js';
import { setSessionCookies, clearSessionCookies } from '../utils/cookies.js';
import { changePassword, registerCustomer, verifyLogin } from '../services/auth.service.js';
import { logAudit } from '../services/audit.service.js';
import { revokeByRefreshToken, rotateSession, startSession } from '../services/session.service.js';
import { adminDTO } from '../services/adminUser.service.js';

// One controller factory serves both realms, so customer and admin auth behave identically.
export function makeAuthController(realmName) {
  const realm = REALMS[realmName];
  // Admins get their effective permissions in the response so the UI can hide what they cannot use.
  const present = realmName === 'admin' ? adminDTO : (u) => u;

  const signIn = async (req, res, user, send) => {
    const { cookies } = await startSession(realm, user, req);
    setSessionCookies(res, realm, cookies);
    return send({ user });
  };

  return {
    login: asyncHandler(async (req, res) => {
      const user = await verifyLogin(realm, req.body, req);
      return signIn(req, res, user, () => ok(res, { user: present(user) }, { message: 'Signed in' }));
    }),

    refresh: asyncHandler(async (req, res) => {
      const { user, cookies } = await rotateSession(realm, req.cookies?.[realm.cookies.refresh], req.get('X-CSRF-Token'), req);
      setSessionCookies(res, realm, cookies);
      return ok(res, { user: present(user) });
    }),

    // Works even when the access token has expired: it revokes the session behind the refresh cookie.
    logout: asyncHandler(async (req, res) => {
      const session = await revokeByRefreshToken(realm, req.cookies?.[realm.cookies.refresh]);
      if (session) await logAudit({ req, actorId: session.userId, actorModel: realm.modelName, action: 'LOGOUT', entityType: 'Session', entityId: session._id });
      clearSessionCookies(res, realm);
      return ok(res, null, { message: 'Signed out' });
    }),

    me: (req, res) => ok(res, { user: present(req.user) }),

    changePassword: asyncHandler(async (req, res) => {
      await changePassword(realm, req.user, req.body, req.auth.sessionId, req);
      return ok(res, null, { message: 'Password updated. Other devices were signed out.' });
    }),
  };
}

export const register = asyncHandler(async (req, res) => {
  const customer = await registerCustomer(req.body, req);
  const { cookies } = await startSession(REALMS.customer, customer, req);
  setSessionCookies(res, REALMS.customer, cookies);
  return created(res, { user: customer }, { message: 'Account created' });
});
