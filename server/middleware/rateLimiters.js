import rateLimit from "express-rate-limit";
import ApiError from "../utils/ApiError.js";
import { env } from "../config/env.js";

export const make = ({ windowMs, limit, message, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res, next) => next(new ApiError(429, message)),
  });

// Applied to every request. Generous: it only stops floods. The sensitive routes have their own tight limits.
export const globalLimiter = make({ windowMs: 15 * 60 * 1000, limit: env.isTest ? 100_000 : env.isProd ? 600 : 5_000, message: "Too many requests. Try again in a few minutes." });
// Login: only FAILED attempts count, so brute-forcing is slowed while normal sign-ins never are.
export const authLimiter = make({ windowMs: 15 * 60 * 1000, limit: env.isTest ? 1000 : 10, skipSuccessfulRequests: true, message: "Too many failed sign-in attempts. Try again in 15 minutes." });
// Registration: every attempt counts.
export const registerLimiter = make({ windowMs: 60 * 60 * 1000, limit: env.isTest ? 1000 : 10, message: "Too many sign-up attempts. Try again later." });
// Used on deposit, withdraw and transfer routes (Phase 8).
export const moneyLimiter = make({ windowMs: 60 * 1000, limit: env.isTest ? 1000 : 20, message: "Too many transactions. Slow down and try again shortly." });
// KYC uploads are heavy and rarely needed more than a few times.
export const uploadLimiter = make({ windowMs: 60 * 60 * 1000, limit: env.isTest ? 1000 : 10, message: "Too many uploads. Try again later." });
// Opening accounts is rare; this stops scripted account creation.
export const accountOpenLimiter = make({ windowMs: 60 * 60 * 1000, limit: env.isTest ? 1000 : 10, message: "Too many new accounts requested. Try again later." });
