import asyncHandler from '../middleware/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { ok, pageMeta } from '../utils/response.js';
import { Notification } from '../models/index.js';

export const list = asyncHandler(async (req, res) => {
  const { page, limit, unread } = req.query;
  const customerId = req.customer._id;
  const filter = { customerId, ...(unread ? { read: false } : {}) };
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ customerId, read: false }),
  ]);
  return ok(res, items, { meta: { ...pageMeta({ page, limit, total }), unread: unreadCount } });
});

// The customerId in the filter means another customer's id simply looks like "not found".
export const markRead = asyncHandler(async (req, res) => {
  const item = await Notification.findOneAndUpdate(
    { _id: req.params.id, customerId: req.customer._id },
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  );
  if (!item) throw ApiError.notFound('Notification not found');
  return ok(res, item);
});

export const markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany({ customerId: req.customer._id, read: false }, { $set: { read: true, readAt: new Date() } });
  return ok(res, { updated: result.modifiedCount });
});
