import axios from 'axios';

// Cookies carry the session (HTTP-only), so withCredentials is required.
// No default Content-Type: axios sends JSON for objects and sets the multipart boundary for FormData.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

const isAdmin = (url = '') => url.startsWith('/admin');
const csrfCookie = (name) =>
  document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.split('=')[1];

// The server issues a CSRF token in a readable cookie; every state-changing request must echo it.
api.interceptors.request.use((config) => {
  if (!['get', 'head', 'options'].includes((config.method || 'get').toLowerCase())) {
    const token = csrfCookie(isAdmin(config.url) ? 'bank_admin_csrf' : 'bank_csrf');
    if (token) config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

// Called when the session is truly gone (refresh failed), so the app can send the user to sign in.
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

// When the short-lived access token expires, refresh once (shared across parallel calls) and retry.
const refreshing = { customer: null, admin: null };
const AUTH_CALL = /\/(login|register|refresh|logout)$/;

// Blob responses (PDF, CSV) carry their error as a Blob; turn it back into JSON.
async function readBody(response) {
  const data = response?.data;
  if (data instanceof Blob) { try { return JSON.parse(await data.text()); } catch { return null; } }
  return data;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const { config, response } = err;
    const realm = isAdmin(config?.url) ? 'admin' : 'customer';
    const body = await readBody(response);

    if (response?.status === 401 && ['TOKEN_EXPIRED', 'UNAUTHENTICATED'].includes(body?.code) && !config._retried && !AUTH_CALL.test(config?.url || '')) {
      config._retried = true;
      refreshing[realm] ??= api
        .post(realm === 'admin' ? '/admin/auth/refresh' : '/auth/refresh')
        .finally(() => { refreshing[realm] = null; });
      try {
        await refreshing[realm];
        return api(config);
      } catch {
        // Refresh failed: the session is over.
      }
    }

    if (response?.status === 401 && !AUTH_CALL.test(config?.url || '') && !(config?.url || '').endsWith('/me')) onUnauthorized?.(realm);

    const error = new Error(body?.message || err.message || 'Something went wrong');
    error.status = response?.status;
    error.code = body?.code;
    error.details = body?.details;
    return Promise.reject(error);
  }
);

export default api;
