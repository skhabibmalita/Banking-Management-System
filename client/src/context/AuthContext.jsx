import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { setUnauthorizedHandler } from '../services/api.js';
import { apiLogin, apiLogout, apiMe, apiRegister } from '../services/dataService.js';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Which kind of user was signed in last. It is not a secret: it only tells us which /me endpoint to try
// on page load. The real session lives in HTTP-only cookies that JavaScript cannot read.
const HINT = 'bank_realm_hint';

const normalize = (realm, u) => realm === 'admin'
  ? { realm, role: 'admin', adminRole: u.role, id: u.id, name: u.name, email: u.email, permissions: u.effectivePermissions || [] }
  : { realm, role: 'customer', id: u.id, name: u.name, email: u.email, kycStatus: u.kycStatus };

export function AuthProvider({ children }) {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(() => { localStorage.removeItem(HINT); setUser(null); }, []);

  // On first load, ask the server who we are (this also silently refreshes an expired access token).
  useEffect(() => {
    const realm = localStorage.getItem(HINT);
    if (!realm) { setLoading(false); return; }
    apiMe(realm)
      .then((d) => setUser(normalize(realm, d.user)))
      .catch(clear)
      .finally(() => setLoading(false));
  }, [clear]);

  // If any later request finds the session gone, send the user back to sign in.
  useEffect(() => {
    setUnauthorizedHandler(() => { clear(); toast.info('Your session ended. Please sign in again.'); });
    return () => setUnauthorizedHandler(null);
  }, [clear, toast]);

  const login = async ({ email, password, role }) => {
    const realm = role === 'admin' ? 'admin' : 'customer';
    const d = await apiLogin(realm, { email, password });
    localStorage.setItem(HINT, realm);
    const u = normalize(realm, d.user);
    setUser(u);
    return u;
  };

  const register = async (form) => {
    const d = await apiRegister(form);
    localStorage.setItem(HINT, 'customer');
    const u = normalize('customer', d.user);
    setUser(u);
    return u;
  };

  const logout = async () => {
    const realm = user?.realm;
    clear();
    if (realm) await apiLogout(realm).catch(() => {}); // clear locally first; the server revokes the session
  };

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}
