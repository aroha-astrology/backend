import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isProduction } from './env.js';
import * as schema from '../db/schema.js';

// Default when DB_SSL is unset: opportunistic transport encryption in
// production — use TLS if the server offers it, without hard-failing the
// connection if it doesn't. `'require'` was tried first and confirmed
// (2026-07-17, live) to break the connection entirely against the EC2
// Postgres instance — its TLS support/cert configuration was never
// independently verified, so only set DB_SSL=require for a host known to
// support it (Supabase does).
function sslMode(): 'prefer' | 'require' | false {
  if (env.DB_SSL === 'off') return false;
  if (env.DB_SSL) return env.DB_SSL;
  return isProduction ? 'prefer' : false;
}

const client = postgres(env.DATABASE_URL, {
  max: env.DB_POOL_MAX ?? (isProduction ? 10 : 5),
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,
  ssl: sslMode(),
});

export const db = drizzle(client, { schema });
export const sqlClient = client;

export type Database = typeof db;
