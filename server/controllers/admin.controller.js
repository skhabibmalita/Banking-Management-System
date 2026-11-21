import asyncHandler from '../middleware/asyncHandler.js';
import { created, ok, pageMeta } from '../utils/response.js';
import { toCsv } from '../utils/csv.js';
import { accountDTO, changeAccountStatus } from '../services/account.service.js';
import { adminDashboard } from '../services/adminDashboard.service.js';
import {
  getAccountForAdmin, listAccounts, listAuditLogs, listCustomers, listFraud, listTransactions, reviewFraud,
} from '../services/adminList.service.js';
import { adminDTO, createAdmin, listAdmins, resetAdminPassword, updateAdmin } from '../services/adminUser.service.js';
import { getKycFile, listKyc, reviewKyc } from '../services/kycReview.service.js';
import { logAudit } from '../services/audit.service.js';
import { buildReport } from '../services/report.service.js';

// Paginated list helper: runs a list service and wraps it in the standard response.
const paged = (service) => asyncHandler(async (req, res) => {
  const { items, total } = await service(req.query);
  return ok(res, items, { meta: pageMeta({ page: req.query.page, limit: req.query.limit, total }) });
});

export const dashboard = asyncHandler(async (req, res) => ok(res, await adminDashboard(req.admin)));
export const customers = paged(listCustomers);
export const accounts = paged(listAccounts);
export const transactions = paged(listTransactions);
export const auditLogs = paged(listAuditLogs);
export const fraud = paged(listFraud);
export const kycList = paged(listKyc);

const actor = (req) => ({ type: 'admin', id: req.admin._id });

async function applyStatus(req, res, to) {
  const account = await getAccountForAdmin(req.params.id);
  const updated = await changeAccountStatus({ account, to, reason: req.body.reason, actor: actor(req), req });
  return ok(res, { account: { ...accountDTO(updated), statusReason: updated.statusReason } }, { message: 'Account updated' });
}
export const freeze = asyncHandler((req, res) => applyStatus(req, res, req.body.frozen ? 'frozen' : 'active'));
export const setAccountStatus = asyncHandler((req, res) => applyStatus(req, res, req.body.status));

export const kycDecision = asyncHandler(async (req, res) => {
  const doc = await reviewKyc({ admin: req.admin, docId: req.params.id, decision: req.body.decision, reason: req.body.reason, req });
  return ok(res, { id: doc.id, status: doc.status }, { message: req.body.decision === 'approve' ? 'KYC approved' : 'KYC rejected' });
});

export const kycFile = asyncHandler(async (req, res, next) => {
  const file = await getKycFile({ admin: req.admin, docId: req.params.id, req });
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(file.path, {
    dotfiles: 'deny',
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.downloadName}"`, // download only, never rendered in the page
      'X-Content-Type-Options': 'nosniff',
    },
  }, (err) => err && next(err));
});

export const fraudReview = asyncHandler(async (req, res) => {
  const txn = await reviewFraud({ admin: req.admin, id: req.params.id, note: req.body.note });
  await logAudit({ req, actorId: req.admin._id, actorModel: 'Admin', action: 'FRAUD_REVIEWED', entityType: 'Transaction', entityId: txn._id, meta: { reference: txn.reference } });
  return ok(res, { id: txn.id, reviewedAt: txn.reviewedAt }, { message: 'Alert marked as reviewed' });
});

export const adminList = asyncHandler(async (req, res) => ok(res, await listAdmins()));
export const adminCreate = asyncHandler(async (req, res) => {
  const { admin, temporaryPassword } = await createAdmin({ actor: req.admin, data: req.body, req });
  return created(res, { admin, temporaryPassword }, { message: 'Admin created. Share the temporary password securely; it is shown only once.' });
});
export const adminUpdate = asyncHandler(async (req, res) => {
  const admin = await updateAdmin({ actor: req.admin, id: req.params.id, changes: req.body, req });
  return ok(res, { admin: adminDTO(admin) }, { message: 'Admin updated' });
});
export const adminResetPassword = asyncHandler(async (req, res) => {
  const { temporaryPassword } = await resetAdminPassword({ actor: req.admin, id: req.params.id, req });
  return ok(res, { temporaryPassword }, { message: 'Password reset. Share the temporary password securely; it is shown only once.' });
});

export const report = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { format, from, to } = req.query;
  const { columns, rows } = await buildReport(type, { from, to });
  await logAudit({ req, actorId: req.admin._id, actorModel: 'Admin', action: 'REPORT_GENERATED', entityType: 'Report', entityId: type, meta: { format, from, to, rows: rows.length } });
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(toCsv(columns, rows));
  }
  return ok(res, { type, columns, rows }, { meta: { from, to, rows: rows.length } });
});
