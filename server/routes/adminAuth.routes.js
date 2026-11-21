import { Router } from 'express';
import { makeAuthController } from '../controllers/auth.controller.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiters.js';
import validate from '../middleware/validate.js';
import { changePasswordSchema, loginSchema } from '../validators/auth.validators.js';

// No registration route on purpose: admins are created by a super admin or the createAdmin script.
const c = makeAuthController('admin');
const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), c.login);
router.post('/refresh', c.refresh);
router.post('/logout', c.logout);
router.get('/me', authenticateAdmin, c.me);
router.put('/password', authenticateAdmin, validate({ body: changePasswordSchema }), c.changePassword);

export default router;
