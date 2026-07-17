import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    // Either point at a service account JSON file (preferred) ...
    FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1).optional(),
    // ... or provide the three fields individually.
    FIREBASE_PROJECT_ID: z.string().min(1).optional(),
    FIREBASE_CLIENT_EMAIL: z
      .string()
      .email('FIREBASE_CLIENT_EMAIL must be a valid email')
      .optional(),
    FIREBASE_PRIVATE_KEY: z
      .string()
      .min(1)
      .transform((value) => value.replace(/\\n/g, '\n'))
      .optional(),

    // Web app API key — not used by the server itself, only by dev scripts
    // that sign in as a client (scripts/dev-token.ts).
    FIREBASE_WEB_API_KEY: z.string().min(1).optional(),

    // --- Google Play Billing (Android in-app purchases) --------------------
    // Either point at a service account JSON file (preferred) ...
    GOOGLE_PLAY_SERVICE_ACCOUNT_PATH: z.string().min(1).optional(),
    // ... or provide the three fields individually.
    GOOGLE_PLAY_PROJECT_ID: z.string().min(1).optional(),
    GOOGLE_PLAY_CLIENT_EMAIL: z
      .string()
      .email('GOOGLE_PLAY_CLIENT_EMAIL must be a valid email')
      .optional(),
    GOOGLE_PLAY_PRIVATE_KEY: z
      .string()
      .min(1)
      .transform((value) => value.replace(/\\n/g, '\n'))
      .optional(),
    GOOGLE_PLAY_PACKAGE_NAME: z.string().min(1).default('com.aroha.astrology'),

    // --- Gemini (sole LLM provider) ----------------------------------------
    GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
    GEMINI_BASE_URL: z.string().default('https://generativelanguage.googleapis.com/v1beta/openai'),
    GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),

    // --- Redis -------------------------------------------------------------
    REDIS_URL: z.string().default('redis://localhost:6379/0'),

    // --- Field-level encryption ---------------------------------------------
    // Base64-encoded 32-byte keys (`openssl rand -base64 32`). ENCRYPTION_KEY
    // encrypts birth data/gotra/chat transcripts at rest; ENCRYPTION_HASH_KEY
    // is a separate key for the deterministic phone-number lookup index —
    // keep them distinct so one leaking doesn't compromise the other.
    ENCRYPTION_KEY: z.string().min(1).optional(),
    ENCRYPTION_HASH_KEY: z.string().min(1).optional(),

    // --- Operations --------------------------------------------------------
    CRON_SECRET: z.string().min(1).optional(),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    TELEGRAM_ALERT_CHAT_ID: z.string().min(1).optional(),
    // Extra admin chat IDs allowed to use the /internal/telegram/webhook commands,
    // beyond TELEGRAM_ALERT_CHAT_ID (which stays the default outgoing-alert target).
    // Admin tier can run every command, including /delete and /broadcast.
    TELEGRAM_ADMIN_CHAT_IDS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    // Read-only tier: /stats, /users, /user, /search, /jobs, /coupons — no
    // /delete, /broadcast, or /newcoupon. A separate, lower-privilege
    // allowlist from TELEGRAM_ADMIN_CHAT_IDS (RBAC, not just one flat list).
    TELEGRAM_READONLY_CHAT_IDS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasPath = Boolean(value.FIREBASE_SERVICE_ACCOUNT_PATH);
    const hasTriple = Boolean(
      value.FIREBASE_PROJECT_ID && value.FIREBASE_CLIENT_EMAIL && value.FIREBASE_PRIVATE_KEY,
    );
    if (!hasPath && !hasTriple) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FIREBASE_SERVICE_ACCOUNT_PATH'],
        message:
          'Provide FIREBASE_SERVICE_ACCOUNT_PATH, or all of FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY',
      });
    }

    const hasPlayPath = Boolean(value.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH);
    const playTripleValues = [
      value.GOOGLE_PLAY_PROJECT_ID,
      value.GOOGLE_PLAY_CLIENT_EMAIL,
      value.GOOGLE_PLAY_PRIVATE_KEY,
    ];
    const hasAnyPlayTriple = playTripleValues.some(Boolean);
    const hasFullPlayTriple = playTripleValues.every(Boolean);
    if (!hasPlayPath && hasAnyPlayTriple && !hasFullPlayTriple) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_PLAY_SERVICE_ACCOUNT_PATH'],
        message:
          'Provide GOOGLE_PLAY_SERVICE_ACCOUNT_PATH, all three of GOOGLE_PLAY_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY, or omit all Google Play config',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
