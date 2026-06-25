// =============================================================================
// Swarm State - Shared state interfaces for the orchestration pipeline
// =============================================================================

export type Intent =
  | 'onboarding'
  | 'daily_forecast'
  | 'matchmaking'
  | 'panchang'
  | 'chat';

export interface BirthRecord {
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface Finding {
  id: string;
  kind: string;
  claim: string;
  evidence: Record<string, unknown>;
}

export interface ChatMessage {
  role: string;
  content: string;
  createdAt?: string;
}

export interface SwarmState {
  requestId: string;
  userId: string;
  intent: Intent;
  consent: boolean;
  locale: string;
  region: string;
  currentLocation?: { lat: number; lon: number };
  rawInput?: Record<string, unknown>;
  birthRecord?: BirthRecord;
  partnerRecord?: BirthRecord;
  asOf?: string;
  metrology?: Record<string, unknown>;
  findings: Finding[];
  synthesis?: Record<string, unknown>;
  atmosphere?: Record<string, unknown>;
  compatibility?: Record<string, unknown>;
  chatContext?: { history: ChatMessage[]; summary: string };
  response?: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export function newState(overrides: Partial<SwarmState>): SwarmState {
  return {
    requestId: '',
    userId: '',
    intent: 'onboarding',
    consent: false,
    locale: 'en',
    region: 'North_Indian',
    findings: [],
    errors: [],
    warnings: [],
    ...overrides,
  };
}
