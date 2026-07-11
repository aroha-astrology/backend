import { sendHealthReport } from '../../lib/notifications/telegram.js';
import { checkDb } from '../health/health.service.js';
import {
  checkRedis,
  checkGemini,
  checkMemoryUsage,
  checkDiskUsage,
  checkPm2Process,
} from './health-report.checks.js';

export async function runHealthReport(): Promise<void> {
  const checkDbWithLatency = async () => {
    const start = performance.now();
    const ok = await checkDb();
    return {
      status: ok ? ('ok' as const) : ('fail' as const),
      latencyMs: Math.round(performance.now() - start),
      message: ok ? undefined : 'Failed to select 1',
    };
  };

  const [dbRes, redisRes, geminiRes, memRes, diskRes, pm2Res] = await Promise.all([
    checkDbWithLatency(),
    checkRedis(),
    checkGemini(),
    checkMemoryUsage(),
    checkDiskUsage(),
    checkPm2Process('aroha-api'),
  ]);

  const report = {
    Database: dbRes,
    Redis: redisRes,
    Gemini: geminiRes,
    'Memory Usage': memRes,
    'Disk Usage': diskRes,
    'PM2 Process (aroha-api)': pm2Res,
  };

  await sendHealthReport(report);
}
