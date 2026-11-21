import app from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';

let server;

async function start() {
  await connectDB();
  server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
}

async function shutdown(reason) {
  console.log(`${reason} received. Closing server...`);
  setTimeout(() => process.exit(1), 10_000).unref();
  if (server) await new Promise((res) => server.close(res));
  await disconnectDB();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  shutdown('unhandledRejection');
});

start().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
