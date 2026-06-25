import { env } from './env.js';

export type ModelTier = 'routing' | 'structured' | 'conversational';

export interface GenerationProfile {
  name: string;
  modelTier: ModelTier;
  temperature: number;
  jsonMode: boolean;
  stream: boolean;
  maxTokens: number;
}

export const ROUTING_PROFILE: GenerationProfile = {
  name: 'routing',
  modelTier: 'routing',
  temperature: 0.0,
  jsonMode: true,
  stream: false,
  maxTokens: 256,
};

export const FORECAST_PROFILE: GenerationProfile = {
  name: 'forecast',
  modelTier: 'structured',
  temperature: 0.2,
  jsonMode: true,
  stream: false,
  maxTokens: 2048,
};

export const CHAT_PROFILE: GenerationProfile = {
  name: 'chat',
  modelTier: 'conversational',
  temperature: 0.7,
  jsonMode: false,
  stream: true,
  maxTokens: 1024,
};

export function modelForTier(tier: ModelTier): string {
  const map: Record<ModelTier, string> = {
    routing: env.MODEL_ROUTING,
    structured: env.MODEL_STRUCTURED,
    conversational: env.MODEL_CONVERSATIONAL,
  };
  return map[tier];
}
