import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { z } from "zod";
import app from "../app.js";
import sanitize from "../middleware/sanitize.js";
import validate from "../middleware/validate.js";
import errorHandler from "../middleware/errorHandler.js";
import ApiError from "../utils/ApiError.js";

describe("API foundation", () => {
  it("GET /api/health returns the success envelope", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.database).toBe("disconnected");
  });

  it("GET /api/health/ready returns 503 until the database is connected", async () => {
    const res = await request(app).get("/api/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("NOT_READY");
  });

  it("sets security headers and hides the framework", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: "NOT_FOUND" });
  });

  it("allows the configured frontend origin with credentials", async () => {
    const res = await request(app).get("/api/health").set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("blocks unknown origins", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CORS_BLOCKED");
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await request(app).post("/api/health").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_JSON");
  });
});

describe("middleware", () => {
  const mini = express();
  mini.use(express.json());
  mini.use(sanitize);
  mini.post("/echo", (req, res) => res.json(req.body));
  mini.post(
    "/check",
    validate({ body: z.object({ amount: z.coerce.number().int().positive(), note: z.string().trim().max(10).optional() }) }),
    (req, res) => res.json(req.body)
  );
  mini.get("/boom", () => { throw new Error("secret internals"); });
  mini.get("/forbidden", (req, res, next) => next(ApiError.forbidden()));
  mini.use(errorHandler);

  it("strips operator-injection and dotted keys", async () => {
    const res = await request(mini).post("/echo").send({ email: { $gt: "" }, a: { "b.c": 1, d: 2 } });
    expect(res.body).toEqual({ email: {}, a: { d: 2 } });
  });

  it("returns field-level validation errors", async () => {
    const res = await request(mini).post("/check").send({ amount: -5 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.details[0].path).toBe("amount");
  });

  it("passes coerced values to the controller", async () => {
    const res = await request(mini).post("/check").send({ amount: "250", note: "  hi  " });
    expect(res.body).toEqual({ amount: 250, note: "hi" });
  });

  it("hides internal error messages", async () => {
    const res = await request(mini).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.message).not.toContain("secret internals");
  });

  it("renders ApiError with its status", async () => {
    const res = await request(mini).get("/forbidden");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });
});
