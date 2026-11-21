// The single place the UI talks to the backend. Money is always integer paise.
import api from './api.js';

const data = (res) => res.data.data;
const withMeta = (res) => ({ items: res.data.data, meta: res.data.meta });
const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== 'all'));
const download = async (url, params) => {
  const res = await api.get(url, { params: clean(params || {}), responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] || '')?.[1];
  return { blob: res.data, name };
};

// ---- Auth ----
export const apiLogin = (realm, body) => api.post(realm === 'admin' ? '/admin/auth/login' : '/auth/login', body).then(data);
export const apiRegister = (body) => api.post('/auth/register', body).then(data);
export const apiLogout = (realm) => api.post(realm === 'admin' ? '/admin/auth/logout' : '/auth/logout').then(data);
export const apiMe = (realm) => api.get(realm === 'admin' ? '/admin/auth/me' : '/auth/me').then(data);
export const changePassword = (realm, body) => api.put(realm === 'admin' ? '/admin/auth/password' : '/auth/password', body).then(data);

// ---- Customer ----
export const getCustomerDashboard = () => api.get('/customers/dashboard').then(data);
export const getProfile = () => api.get('/customers/profile').then((r) => data(r).customer);
export const updateProfile = (body) => api.put('/customers/profile', body).then((r) => data(r).customer);
export const getAccounts = () => api.get('/accounts', { params: { limit: 50 } }).then(data);
export const createAccount = (accountType) => api.post('/accounts', { accountType }).then((r) => data(r).account);
export const closeAccount = (id) => api.put(`/accounts/${id}/status`, { status: 'closed' }).then((r) => data(r).account);
export const getHistory = (params) => api.get('/transactions/history', { params: clean(params) }).then(withMeta);
export const submitMoney = ({ kind, accountId, to, amount, note, idempotencyKey }) => {
  const path = { deposit: 'deposit', withdraw: 'withdraw', transfer: 'transfer' }[kind];
  const body = kind === 'transfer'
    ? { fromAccountId: accountId, toAccountNumber: to, amount, description: note || undefined }
    : { accountId, amount, description: note || undefined };
  return api.post(`/transactions/${path}`, body, { headers: { 'Idempotency-Key': idempotencyKey } }).then(data);
};
export const downloadReceipt = (id) => download(`/transactions/${id}/receipt`);
export const getNotifications = () => api.get('/notifications', { params: { limit: 50 } }).then(withMeta);
export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`).then(data);
export const markAllNotificationsRead = () => api.put('/notifications/read-all').then(data);
export const getKyc = () => api.get('/customers/kyc-status').then(data);
export const submitKyc = (docType, file) => {
  const form = new FormData();
  form.append('docType', docType);
  form.append('document', file);
  return api.post('/customers/kyc', form).then(data);
};

// ---- Admin ----
export const getAdminOverview = () => api.get('/admin/dashboard').then(data);
export const listAdminCustomers = (p) => api.get('/admin/customers', { params: clean(p) }).then(withMeta);
export const listAdminAccounts = (p) => api.get('/admin/accounts', { params: clean(p) }).then(withMeta);
export const setAccountFrozen = (id, frozen, reason) => api.put(`/admin/accounts/${id}/freeze`, { frozen, reason: reason || undefined }).then((r) => data(r).account);
export const listAdminTransactions = (p) => api.get('/admin/transactions', { params: clean(p) }).then(withMeta);
export const listKycQueue = (p) => api.get('/admin/kyc', { params: clean(p) }).then(withMeta);
export const decideKyc = (id, decision, reason) => api.put(`/admin/kyc/${id}`, { decision, reason: reason || undefined }).then(data);
export const downloadKycFile = (id) => download(`/admin/kyc/${id}/file`);
export const listFraud = (p) => api.get('/admin/fraud', { params: clean(p) }).then(withMeta);
export const reviewFraud = (id, note) => api.put(`/admin/fraud/${id}/review`, { note: note || undefined }).then(data);
export const listAuditLogs = (p) => api.get('/admin/audit-logs', { params: clean(p) }).then(withMeta);
export const listAdmins = () => api.get('/admin/admins').then(data);
export const createAdmin = (body) => api.post('/admin/admins', body).then(data);
export const updateAdmin = (id, body) => api.put(`/admin/admins/${id}`, body).then((r) => data(r).admin);
export const resetAdminPassword = (id) => api.post(`/admin/admins/${id}/reset-password`).then(data);
export const downloadReport = (type, params) => download(`/admin/reports/${type}`, { ...params, format: 'csv' });
