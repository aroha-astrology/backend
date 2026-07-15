// Load .env first so the deletes below win — src/config/env.ts also imports
// 'dotenv/config', but module caching makes that a no-op after this.
import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.CORS_ORIGINS = '';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
// Never let tests pick up a real service account from the developer's .env.
delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'sa@test-project.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = 'test-key';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.GEMINI_API_KEY = 'test-gemini-key';
