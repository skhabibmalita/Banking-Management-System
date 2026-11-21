import { env } from '../config/env.js';
import { csrfTokenFor } from './tokens.js';

const base = () => ({ sameSite: 'lax', secure: env.cookieSecure });

// access: HTTP-only, sent to the API only. refresh: HTTP-only, sent only to the auth routes.
// csrf: readable by JavaScript on purpose; the client echoes it in the X-CSRF-Token header.
export function setSessionCookies(res, realm, { accessToken, refreshToken, refreshExpires, sessionId }) {
  const c = realm.cookies;
  // The cookie lasts as long as the session, NOT as long as the 15-minute token inside it. If the browser
  // deleted it at token expiry, the server would see "no cookie" instead of "expired token", and the
  // client would not know it should refresh. The token's own expiry is enforced by the server.
  res.cookie(c.access, accessToken, { ...base(), httpOnly: true, path: '/api', expires: refreshExpires });
  res.cookie(c.refresh, refreshToken, { ...base(), httpOnly: true, path: realm.refreshPath, expires: refreshExpires });
  res.cookie(c.csrf, csrfTokenFor(sessionId), { ...base(), httpOnly: false, path: '/', expires: refreshExpires });
}

export function clearSessionCookies(res, realm) {
  const c = realm.cookies;
  res.clearCookie(c.access, { ...base(), httpOnly: true, path: '/api' });
  res.clearCookie(c.refresh, { ...base(), httpOnly: true, path: realm.refreshPath });
  res.clearCookie(c.csrf, { ...base(), httpOnly: false, path: '/' });
}
