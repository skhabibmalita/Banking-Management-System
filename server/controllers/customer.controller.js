import asyncHandler from '../middleware/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import { updateProfile } from '../services/customer.service.js';
import { getKycStatus, submitKycDocument } from '../services/kyc.service.js';
import { customerDashboard } from '../services/dashboard.service.js';

// Every handler works on req.customer, set from the session. No customer id is ever read from the request.
export const getProfile = (req, res) => ok(res, { customer: req.customer });

export const putProfile = asyncHandler(async (req, res) => {
  const customer = await updateProfile(req.customer, req.body, req);
  return ok(res, { customer }, { message: 'Profile updated' });
});

export const postKyc = asyncHandler(async (req, res) => {
  const result = await submitKycDocument({ customer: req.customer, file: req.file, docType: req.body.docType, req });
  return created(res, result, { message: 'Document submitted for review' });
});

export const kycStatus = asyncHandler(async (req, res) => ok(res, await getKycStatus(req.customer)));

export const dashboard = asyncHandler(async (req, res) => ok(res, await customerDashboard(req.customer)));
