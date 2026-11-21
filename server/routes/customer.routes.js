import { Router } from 'express';
import { dashboard, getProfile, kycStatus, postKyc, putProfile } from '../controllers/customer.controller.js';
import { authenticateCustomer } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimiters.js';
import { kycUpload } from '../middleware/upload.js';
import validate from '../middleware/validate.js';
import { kycSubmitSchema, updateProfileSchema } from '../validators/customer.validators.js';

const router = Router();
router.use(authenticateCustomer);

router.get('/dashboard', dashboard);
router.get('/profile', getProfile);
router.put('/profile', validate({ body: updateProfileSchema }), putProfile);
router.get('/kyc-status', kycStatus);
// Order matters: authenticate (cookie + CSRF header) first, then parse the file, then validate the text fields.
router.post('/kyc', uploadLimiter, kycUpload, validate({ body: kycSubmitSchema }), postKyc);

export default router;
