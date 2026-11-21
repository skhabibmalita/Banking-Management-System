import { Router } from 'express';
import { makeAuthController, register } from '../controllers/auth.controller.js';
import { authenticateCustomer } from '../middleware/auth.js';
import { authLimiter, registerLimiter } from '../middleware/rateLimiters.js';
import validate from '../middleware/validate.js';
import { changePasswordSchema, loginSchema, registerSchema } from '../validators/auth.validators.js';

const c = makeAuthController('customer');
const router = Router();

router.post('/register', registerLimiter, validate({ body: registerSchema }), register);
router.post('/login', authLimiter, validate({ body: loginSchema }), c.login);
router.post('/refresh', c.refresh);
router.post('/logout', c.logout);
router.get('/me', authenticateCustomer, c.me);
router.put('/password', authenticateCustomer, validate({ body: changePasswordSchema }), c.changePassword);

export default router;
