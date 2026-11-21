// Operational error with an HTTP status. Thrown anywhere, rendered by middleware/errorHandler.js.
export default class ApiError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code || ApiError.defaultCode(status);
    this.details = details;
  }

  static defaultCode(status) {
    return ({
      400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND",
      409: "CONFLICT", 413: "PAYLOAD_TOO_LARGE", 422: "UNPROCESSABLE", 429: "RATE_LIMITED",
    })[status] || "ERROR";
  }

  static badRequest(msg, opts) { return new ApiError(400, msg, opts); }
  static unauthorized(msg = "Authentication required", opts) { return new ApiError(401, msg, opts); }
  static forbidden(msg = "You do not have permission to do this", opts) { return new ApiError(403, msg, opts); }
  static notFound(msg = "Resource not found", opts) { return new ApiError(404, msg, opts); }
  static conflict(msg, opts) { return new ApiError(409, msg, opts); }
}
