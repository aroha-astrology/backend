import { serve } from '@hono/node-server';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { sqlClient } from './config/db.js';
import { getFirebaseApp } from './config/firebase.js';
import { closeRedis } from './config/redis.js';
import { setLunarNodeType } from './lib/astro-engine/calculations/planetPositions.core.js';

// Applied before any chart is computed: the node selection is process-wide, so
// it must be set once at boot rather than per request (see planetPositions.core).
setLunarNodeType(env.LUNAR_NODE_TYPE);

const app = createApp();

getFirebaseApp();

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
    hostname: '0.0.0.0',
  },
  (info) => {
    logger.info(
      { port: info.port, env: env.NODE_ENV, docs: `http://localhost:${info.port}/docs` },
      'server:listening',
    );
  },
);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'server:shutdown:start');
  server.close((err) => {
    if (err) logger.error({ err }, 'server:shutdown:close-error');
  });
  try {
    await sqlClient.end({ timeout: 5 });
  } catch (err) {
    logger.error({ err }, 'server:shutdown:db-error');
  }
  try {
    await closeRedis();
  } catch (err) {
    logger.error({ err }, 'server:shutdown:redis-error');
  }
  logger.info('server:shutdown:done');
  process.exit(0);
}

process.on('SIGINT', (signal) => void shutdown(signal));
process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('unhandledRejection', (reason) =>
  logger.error({ reason }, 'process:unhandledRejection'),
);
process.on('uncaughtException', (err) => logger.fatal({ err }, 'process:uncaughtException'));
