import { logger } from '../logger.js';

export interface UsageRecord {
  userId: string;
  agent: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  createdAt: Date;
}

const usageLog: UsageRecord[] = [];

export function logUsage(record: Omit<UsageRecord, 'createdAt'>): void {
  usageLog.push({ ...record, createdAt: new Date() });
  logger.debug(
    { agent: record.agent, model: record.model, tokensIn: record.tokensIn, tokensOut: record.tokensOut },
    'usage:logged',
  );
}

export function getUsageLog(): readonly UsageRecord[] {
  return usageLog;
}

export function clearUsageLog(): void {
  usageLog.length = 0;
}
