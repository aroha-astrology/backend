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

    // --- NVIDIA NIM LLM ---------------------------------------------------
    NVIDIA_NIM_API_KEY: z.string().min(1).optional(),
    NVIDIA_NIM_BASE_URL: z.string().default('https://integrate.api.nvidia.com/v1'),
    NVIDIA_NIM_API_KEY_2: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_3: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_4: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_5: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_6: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_7: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_8: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_9: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_10: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_11: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_12: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_13: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_14: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_15: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_16: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_17: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_18: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_19: z.string().min(1).optional(),
    NVIDIA_NIM_API_KEY_20: z.string().min(1).optional(),

    // --- Groq (Primary for some tiers) -------------------------------------
    GROQ_API_KEY: z.string().min(1).optional(),
    GROQ_API_KEY_2: z.string().min(1).optional(),
    GROQ_API_KEY_3: z.string().min(1).optional(),
    GROQ_API_KEY_4: z.string().min(1).optional(),
    GROQ_API_KEY_5: z.string().min(1).optional(),
    GROQ_API_KEY_6: z.string().min(1).optional(),
    GROQ_API_KEY_7: z.string().min(1).optional(),
    GROQ_API_KEY_8: z.string().min(1).optional(),
    GROQ_API_KEY_9: z.string().min(1).optional(),
    GROQ_API_KEY_10: z.string().min(1).optional(),
    GROQ_API_KEY_11: z.string().min(1).optional(),
    GROQ_API_KEY_12: z.string().min(1).optional(),
    GROQ_API_KEY_13: z.string().min(1).optional(),
    GROQ_API_KEY_14: z.string().min(1).optional(),
    GROQ_API_KEY_15: z.string().min(1).optional(),
    GROQ_API_KEY_16: z.string().min(1).optional(),
    GROQ_API_KEY_17: z.string().min(1).optional(),
    GROQ_API_KEY_18: z.string().min(1).optional(),
    GROQ_API_KEY_19: z.string().min(1).optional(),
    GROQ_API_KEY_20: z.string().min(1).optional(),
    GROQ_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
    GROQ_MODEL_CONVERSATIONAL: z.string().default('llama-3.3-70b-versatile'),
    GROQ_MODEL_ROUTING: z.string().default('llama-3.1-8b-instant'),
    GROQ_RPM_LIMIT: z.coerce.number().int().positive().default(40),

    // --- NIM model routing -------------------------------------------------
    MODEL_ROUTING: z.string().default('meta/llama-3.1-8b-instruct'),
    // mistralai/mixtral-8x22b-instruct was retired from the NIM catalog (404s
    // on every call) — verified 2026-07-02 that llama-3.3-70b-instruct is live.
    MODEL_STRUCTURED: z.string().default('meta/llama-3.3-70b-instruct'),
    MODEL_CONVERSATIONAL: z.string().default('meta/llama-3.1-70b-instruct'),

    // --- Gemini (cross-provider fallback, used only if NIM is down entirely) --
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_BASE_URL: z.string().default('https://generativelanguage.googleapis.com/v1beta/openai'),
    GEMINI_MODEL: z.string().default('gemini-2.0-flash'),

    // --- Redis -------------------------------------------------------------
    REDIS_URL: z.string().default('redis://localhost:6379/0'),

    // --- Operations --------------------------------------------------------
    CRON_SECRET: z.string().min(1).optional(),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    TELEGRAM_ALERT_CHAT_ID: z.string().min(1).optional(),
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
