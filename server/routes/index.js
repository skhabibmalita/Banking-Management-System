import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import adminAuthRoutes from './adminAuth.routes.js';
import customerRoutes from './customer.routes.js';
import notificationRoutes from './notification.routes.js';
import accountRoutes from './account.routes.js';
import transactionRoutes from './transaction.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/admin/auth', adminAuthRoutes); // must stay before /admin so login is reachable without a session
router.use('/customers', customerRoutes);
router.use('/notifications', notificationRoutes);
router.use('/accounts', accountRoutes);
router.use('/transactions', transactionRoutes);
router.use('/admin', adminRoutes);
export default router;
