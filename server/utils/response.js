// Consistent success envelope: { success, message?, data, meta? }.
// Errors use { success:false, message, code, details?, requestId } (see errorHandler).
export function ok(res, data = null, { message, meta, status = 200 } = {}) {
  const body = { success: true };
  if (message) body.message = message;
  body.data = data;
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export const created = (res, data, opts = {}) => ok(res, data, { ...opts, status: 201 });

// Standard pagination meta used by every list endpoint.
export function pageMeta({ page, limit, total }) {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}
