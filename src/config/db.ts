import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isProduction } from './env.js';
import * as schema from '../db/schema.js';

const client = postgres(env.DATABASE_URL, {
  max: isProduction ? 10 : 5,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,
  // Opportunistic transport encryption in production: use TLS if the server
  // offers it, without hard-failing the connection if it doesn't. `'require'`
  // was tried first and confirmed (2026-07-17, live) to break the connection
  // entirely against the actual production Postgres instance — its TLS
  // support/cert configuration was never independently verified before that
  // attempt, so don't re-enable 'require' without confirming that first.
  ssl: isProduction ? 'prefer' : false,
});

export const db = drizzle(client, { schema });
export const sqlClient = client;

export type Database = typeof db;
