import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

const STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
export const dbState = () => STATES[mongoose.connection.readyState] ?? 'unknown';

// Financial operations use multi-document transactions, which MongoDB only supports on a replica set.
export async function assertReplicaSet() {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName) {
    throw new Error(
      'MongoDB is not running as a replica set, so transactions will fail. ' +
      'Use `npm run db:up` (Docker) or a MongoDB Atlas cluster.'
    );
  }
}

export async function connectDB(uri = env.MONGODB_URI) {
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 20,
    // In production, build indexes deliberately with `npm run db:indexes` instead of on every boot.
    autoIndex: !env.isProd,
  });
  await assertReplicaSet();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}

export const disconnectDB = () => mongoose.disconnect();
