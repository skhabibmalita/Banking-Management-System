// Runs before every test file. Test-only values; never real secrets.
import os from "node:os";
import path from "node:path";

process.env.UPLOAD_DIR = path.join(os.tmpdir(), `bank-test-uploads-${process.pid}`);
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/bank_test?replicaSet=rs0";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.JWT_ACCESS_SECRET = "test-access-secret-test-access-secret-0001";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-test-refresh-secret-0002";
