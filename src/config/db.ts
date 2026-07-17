import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isProduction } from './env.js';
import * as schema from '../db/schema.js';

const client = postgres(env.DATABASE_URL, {
  max: isProduction ? 10 : 5,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,
  // Enforce transport encryption in production regardless of whether
  // DATABASE_URL happens to carry `sslmode=require` — don't rely on the
  // connection string alone for this.
  ssl: isProduction ? 'require' : false,
});

export const db = drizzle(client, { schema });
export const sqlClient = client;

export type Database = typeof db;
