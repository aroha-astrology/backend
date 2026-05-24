import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../../apps/web/.env.local') });

export const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const INTERNAL_PROCESS_KEY = process.env.INTERNAL_PROCESS_KEY!;

export const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
export const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

export const EMAIL_PREFIX = 'stresstest+';
export const EMAIL_DOMAIN = '@jyotish.local';
export const CREDIT_TOPUP = 25;
export const POLL_INTERVAL_MS = 2000;
export const MAX_WAIT_MS = 600_000;

export type RoundConfig = {
  name: 'round_1' | 'round_2' | 'round_3';
  userIndices: number[];
  reportTier: 'basic' | 'standard';
  chatMessagesPerUser: number;
};

export const ROUNDS: RoundConfig[] = [
  { name: 'round_1', userIndices: [0, 1, 2],       reportTier: 'basic',    chatMessagesPerUser: 0 },
  { name: 'round_2', userIndices: [0, 1, 2, 3, 4], reportTier: 'standard', chatMessagesPerUser: 0 },
  { name: 'round_3', userIndices: [5, 6, 7, 8, 9], reportTier: 'basic',    chatMessagesPerUser: 3 },
];

export const CHAT_QUESTIONS = [
  'What does my career look like in the next year?',
  'When will I get married?',
  'What remedies should I do for Saturn?',
];
