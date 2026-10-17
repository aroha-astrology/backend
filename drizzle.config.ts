import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// DATABASE_MIGRATE_URL wins when set: on a pooled host (Supabase) the app uses
// the transaction pooler, which can't run migrations, so drizzle-kit gets the
// session pooler or a direct connection instead.
const databaseUrl = process.env.DATABASE_MIGRATE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL (or DATABASE_MIGRATE_URL) must be set in the environment to run drizzle-kit.',
  );
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
