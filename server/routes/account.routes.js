import { Router } from 'express';
import { create, get, list, setStatus } from '../controllers/account.controller.js';
import { authenticateCustomer } from '../middleware/auth.js';
import { accountOpenLimiter } from '../middleware/rateLimiters.js';
import validate from '../middleware/validate.js';
import { accountListQuery, createAccountSchema, statusSchema } from '../validators/account.validators.js';
import { idParam } from '../validators/common.js';

const router = Router();
router.use(authenticateCustomer);

router.post('/', accountOpenLimiter, validate({ body: createAccountSchema }), create);
router.get('/', validate({ query: accountListQuery }), list);
router.get('/:id', validate({ params: idParam }), get);
router.put('/:id/status', validate({ params: idParam, body: statusSchema }), setStatus);

export default router;
