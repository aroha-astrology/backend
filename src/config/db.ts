import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isProduction } from './env.js';
import * as schema from '../db/schema.js';

const client = postgres(env.DATABASE_URL, {
  max: isProduction ? 10 : 5,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,
});

export const db = drizzle(client, { schema });
export const sqlClient = client;

export type Database = typeof db;
