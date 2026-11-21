import { Router } from 'express';
import { list, markAllRead, markRead } from '../controllers/notification.controller.js';
import { authenticateCustomer } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { notificationListQuery } from '../validators/customer.validators.js';

const router = Router();
router.use(authenticateCustomer);

router.get('/', validate({ query: notificationListQuery }), list);
router.put('/read-all', markAllRead);
router.put('/:id/read', validate({ params: idParam }), markRead);

export default router;
