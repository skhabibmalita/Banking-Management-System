import { ZodError } from "zod";
import ApiError from "../utils/ApiError.js";
import { env } from "../config/env.js";

// Single place where every error becomes a JSON response. Internals are never leaked in production.
export default function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Something went wrong on our side";
  let details;

  if (err instanceof ApiError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Some fields are invalid";
    details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  } else if (err.type === "entity.parse.failed") {
    status = 400; code = "INVALID_JSON"; message = "Request body is not valid JSON";
  } else if (err.type === "entity.too.large") {
    status = 413; code = "PAYLOAD_TOO_LARGE"; message = "Request body is too large";
  } else if (err.name === "MulterError") {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    status = tooBig ? 413 : 400;
    code = tooBig ? "FILE_TOO_LARGE" : "UPLOAD_ERROR";
    message = tooBig ? `File is larger than ${env.MAX_UPLOAD_MB} MB` : 'Upload exactly one file in the "document" field';
  }

  if (status >= 500) console.error(`[${req.id}] ${req.method} ${req.originalUrl}`, err);

  const body = { success: false, message, code, requestId: req.id };
  if (details) body.details = details;
  if (status >= 500 && !env.isProd) body.stack = err.stack;
  res.status(status).json(body);
}
