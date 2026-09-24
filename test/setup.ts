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
// Same for every key that talks to the outside world: a developer's .env holds
// live Telegram/email/LLM/Play credentials, and a test that forgets a mock must
// fail rather than post an alert, send mail, spend tokens or hit Play. These
// are optional in env.ts, so deleting them (not blanking — empty strings fail
// validation) leaves the suite runnable in CI with no .env at all.
for (const key of [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ALERT_CHAT_ID',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_ADMIN_CHAT_IDS',
  'TELEGRAM_READONLY_CHAT_IDS',
  'TELEGRAM_DOWNVOTE_EXTRA_CHAT_IDS',
  'TELEGRAM_SUPPORT_EXTRA_CHAT_IDS',
  'TELEGRAM_SIGNUP_EXTRA_CHAT_IDS',
  'SUPPORT_EMAIL_USER',
  'SUPPORT_EMAIL_APP_PASSWORD',
  'REPORT_RECIPIENT_EMAILS',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_PATH',
  'GOOGLE_PLAY_RTDN_SECRET',
  'GROQ_API_KEY',
  'GROQ_API_KEY_2',
  'GROQ_API_KEY_3',
  'NVIDIA_NIM_API_KEY',
  'NVIDIA_NIM_API_KEY_2',
  'NVIDIA_NIM_API_KEY_3',
  'NVIDIA_NIM_API_KEY_4',
  'GEMINI_API_KEYS',
  'GEMINI_PAID_API_KEYS',
  'REDIS_URL',
]) {
  delete process.env[key];
}
