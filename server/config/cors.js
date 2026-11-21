import { env } from "./env.js";
import ApiError from "../utils/ApiError.js";

// Credentialed CORS (cookies) only for the configured frontend origins.
// Requests with no Origin header (Postman, curl, same-origin) are allowed through.
export const corsOptions = {
  origin(origin, cb) {
    if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
    cb(new ApiError(403, "Origin not allowed", { code: "CORS_BLOCKED" }));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Idempotency-Key", "X-CSRF-Token"],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 600,
};
