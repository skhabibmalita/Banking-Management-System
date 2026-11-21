import { Router } from 'express';
import * as c from '../controllers/admin.controller.js';
import { authenticateAdmin, requirePermission as need } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import * as v from '../validators/admin.validators.js';

// Every route: signed-in admin (cookie + CSRF on changes) first, then the specific permission.
const router = Router();
router.use(authenticateAdmin);

router.get('/dashboard', c.dashboard); // sections are filtered by the admin's permissions

router.get('/customers', need('customers:read'), validate({ query: v.customerListQuery }), c.customers);

router.get('/accounts', need('accounts:read'), validate({ query: v.adminAccountListQuery }), c.accounts);
router.put('/accounts/:id/freeze', need('accounts:freeze'), validate({ params: idParam, body: v.freezeSchema }), c.freeze);
router.put('/accounts/:id/status', need('accounts:freeze'), validate({ params: idParam, body: v.adminStatusSchema }), c.setAccountStatus);

router.get('/transactions', need('transactions:read'), validate({ query: v.adminTransactionQuery }), c.transactions);

router.get('/kyc', need('kyc:review'), validate({ query: v.kycListQuery }), c.kycList);
router.put('/kyc/:id', need('kyc:review'), validate({ params: idParam, body: v.kycDecisionSchema }), c.kycDecision);
router.get('/kyc/:id/file', need('kyc:review'), validate({ params: idParam }), c.kycFile);

router.get('/fraud', need('fraud:read'), validate({ query: v.fraudListQuery }), c.fraud);
router.put('/fraud/:id/review', need('fraud:review'), validate({ params: idParam, body: v.fraudReviewSchema }), c.fraudReview);

router.get('/audit-logs', need('audit:read'), validate({ query: v.auditLogQuery }), c.auditLogs);

router.get('/admins', need('admins:manage'), c.adminList);
router.post('/admins', need('admins:manage'), validate({ body: v.createAdminSchema }), c.adminCreate);
router.put('/admins/:id', need('admins:manage'), validate({ params: idParam, body: v.updateAdminSchema }), c.adminUpdate);
router.post('/admins/:id/reset-password', need('admins:manage'), validate({ params: idParam }), c.adminResetPassword);

router.get('/reports/:type', need('reports:read'), validate({ params: v.reportParams, query: v.reportQuery }), c.report);

export default router;
