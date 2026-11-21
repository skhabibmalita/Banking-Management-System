import { Router } from 'express';
import { deposit, detail, history, receipt, transfer, withdraw } from '../controllers/transaction.controller.js';
import { authenticateCustomer } from '../middleware/auth.js';
import requireIdempotencyKey from '../middleware/idempotency.js';
import { moneyLimiter } from '../middleware/rateLimiters.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { depositSchema, historyQuery, transferSchema, withdrawSchema } from '../validators/transaction.validators.js';

const router = Router();
router.use(authenticateCustomer);

// Order: sign-in (+CSRF) -> rate limit -> Idempotency-Key -> body validation -> handler.
router.post('/deposit', moneyLimiter, requireIdempotencyKey, validate({ body: depositSchema }), deposit);
router.post('/withdraw', moneyLimiter, requireIdempotencyKey, validate({ body: withdrawSchema }), withdraw);
router.post('/transfer', moneyLimiter, requireIdempotencyKey, validate({ body: transferSchema }), transfer);

router.get('/history', validate({ query: historyQuery }), history); // before /:id
router.get('/:id', validate({ params: idParam }), detail);
router.get('/:id/receipt', validate({ params: idParam }), receipt);

export default router;
