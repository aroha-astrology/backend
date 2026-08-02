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

    // Local disk directory for palm-reading photographs (biometric data — never served
    // publicly, only through the authenticated frame routes; see lib/palm/storage.ts).
    // Lives on the same EC2 instance as the API process itself — no separate cloud storage
    // service. Relative paths resolve against process.cwd(). Untracked (see .gitignore) so a
    // `git reset --hard` deploy never touches previously-uploaded frames.
    PALM_UPLOAD_DIR: z.string().min(1).default('uploads'),

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

    // --- Razorpay (web/UPI/card checkout) ----------------------------------
    // Both optional: with either missing, the Razorpay routes refuse and only
    // the Google Play path stays available (that's the state on any box that
    // hasn't been given gateway keys yet). The secret NEVER leaves the server
    // — the key id alone is handed to the browser by the checkout route.
    RAZORPAY_KEY_ID: z.string().min(1).optional(),
    RAZORPAY_KEY_SECRET: z.string().min(1).optional(),

    // --- Gemini (sole LLM provider) ----------------------------------------
    // Multi-key rotation pool (see lib/llm/gemini-key-pool.ts): comma-separated
    // list of Gemini API keys, same convention as CORS_ORIGINS/
    // TELEGRAM_ADMIN_CHAT_IDS above. Takes precedence over the single
    // GEMINI_API_KEY below when non-empty — see GEMINI_KEY_POOL.
    GEMINI_API_KEYS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean),
      ),
    // Single-key fallback, kept for back-compat with existing deployments that
    // haven't migrated to GEMINI_API_KEYS yet. Optional now — validated below
    // (superRefine) so boot only fails if BOTH this and GEMINI_API_KEYS are
    // unset, not because this alone is missing.
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_BASE_URL: z.string().default('https://generativelanguage.googleapis.com/v1beta/openai'),
    GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),

    // --- Gemini Live (realtime voice) --------------------------------------
    // A SEPARATE model from GEMINI_MODEL above, not a variant of it.
    // `gemini-3.1-flash-lite` is the text/batch tier and cannot do realtime
    // audio at all; `gemini-3.1-flash-live-preview` is a native audio-to-audio
    // model reached over a WebSocket rather than the OpenAI-compatible
    // /chat/completions endpoint every other call site here uses. Nothing
    // outside the voice module reads these, and GEMINI_MODEL is untouched.
    //
    // The native (non-OpenAI-compat) base URL, because ephemeral-token minting
    // and the Live socket both live under v1beta directly.
    GEMINI_LIVE_BASE_URL: z.string().default('https://generativelanguage.googleapis.com/v1beta'),
    GEMINI_LIVE_MODEL: z.string().default('gemini-3.1-flash-live-preview'),
    // A kill switch that sits BELOW the `paid.voiceChat` feature flag: the flag
    // is the product control (admin-togglable, per-user/per-group), this is the
    // operational one. It exists so voice can be cut instantly from the box —
    // without a deploy or a DB write — if it starts eating the shared Gemini
    // free-tier quota that every text feature also depends on. Defaults off:
    // the model is a preview whose quota Google does not publish, so it must be
    // switched on deliberately after watching it against real traffic.
    GEMINI_LIVE_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    // --- Redis -------------------------------------------------------------
    REDIS_URL: z.string().default('redis://localhost:6379/0'),

    // Whether an upstream reverse proxy (ALB/nginx/Cloudflare) terminates
    // connections and sets `x-forwarded-for`. Defaults to false because the
    // production box is currently addressed directly on :3000 — trusting the
    // header without a proxy in front lets any client forge a fresh identity
    // per request and walk straight through the rate limiter.
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

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
    // Extra recipients for the chat-downvote alert specifically (on top of
    // TELEGRAM_ALERT_CHAT_ID) — deliberately separate from TELEGRAM_ADMIN_CHAT_IDS,
    // which grants webhook command authority and shouldn't be widened just to
    // add a notification recipient.
    TELEGRAM_DOWNVOTE_EXTRA_CHAT_IDS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    // Extra recipients for the new-support-ticket alert specifically — same
    // reasoning as TELEGRAM_DOWNVOTE_EXTRA_CHAT_IDS, kept as its own env var
    // rather than folded into it so the two alert fan-outs can be tuned
    // independently (e.g. a support-only Telegram group).
    TELEGRAM_SUPPORT_EXTRA_CHAT_IDS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),

    // Phone allowlist (E.164) gating the HTTP admin API (/v1/admin/*) — see
    // requireAdmin in middleware/auth.ts. Checked against the Firebase ID
    // token's own `phone_number` claim, NOT a DB column (a DB column would
    // let phone-recycling silently hand admin access to whoever picks up a
    // once-admin number later — see the phone-recycling-takeover finding in
    // the 2026-07-17 security audit). Same comma-split/trim/filter/default
    // pattern as TELEGRAM_ADMIN_CHAT_IDS above.
    ADMIN_PHONE_E164: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      ),

    // Nightly horoscope batch skips users with no activity in this many days
    // (lastActiveAt, falling back to createdAt) — a dormant user's reading is
    // instead generated on the fly the next time they actually open the app
    // (GET /v1/horoscope's existing cache-miss path). See horoscope.repo.ts
    // listRecentlyActiveUsersAfter.
    HOROSCOPE_ACTIVE_WINDOW_DAYS: z.coerce.number().int().positive().default(7),
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

    // At least one key pool source is required — any pool size from 1 up to
    // however many keys are configured is valid, this is not a fixed-size
    // requirement. GEMINI_API_KEYS wins when both are set (see GEMINI_KEY_POOL).
    if (value.GEMINI_API_KEYS.length === 0 && !value.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GEMINI_API_KEYS'],
        message: 'Provide GEMINI_API_KEYS (comma-separated) or GEMINI_API_KEY',
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

// Derived Gemini key pool for lib/llm/gemini-key-pool.ts's round-robin
// rotation: prefer the comma-separated GEMINI_API_KEYS list when set, else
// fall back to the single GEMINI_API_KEY, else an empty pool (only reachable
// if the superRefine check above were ever bypassed, e.g. in a test that
// constructs Env by hand rather than through loadEnv()).
export const GEMINI_KEY_POOL: readonly string[] =
  env.GEMINI_API_KEYS.length > 0
    ? env.GEMINI_API_KEYS
    : env.GEMINI_API_KEY
      ? [env.GEMINI_API_KEY]
      : [];
