// Builds or updates indexes explicitly. Run once per deployment: npm run db:indexes
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import * as models from '../models/index.js';

try {
  await connectDB();
  for (const [name, model] of Object.entries(models)) {
    await model.syncIndexes();
    console.log(`indexes synced: ${name}`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
