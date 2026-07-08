import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { checkDb } from './health.service.js';

const HealthSchema = z
  .object({
    status: z.literal('ok'),
    uptimeSeconds: z.number(),
  })
  .openapi('HealthStatus');

const ReadySchema = z
  .object({
    status: z.enum(['ok', 'degraded']),
    checks: z.object({
      db: z.enum(['ok', 'fail']),
    }),
  })
  .openapi('ReadyStatus');

export const healthRouter = new OpenAPIHono();

const healthRoute = createRoute({
  method: 'get',
  path: '/healthz',
  tags: ['Health'],
  summary: 'Liveness probe',
  responses: {
    200: {
      description: 'Server is alive',
      content: { 'application/json': { schema: HealthSchema } },
    },
  },
});

const readyRoute = createRoute({
  method: 'get',
  path: '/readyz',
  tags: ['Health'],
  summary: 'Readiness probe (checks DB connectivity)',
  responses: {
    200: {
      description: 'Server can serve traffic',
      content: { 'application/json': { schema: ReadySchema } },
    },
    503: {
      description: 'A dependency is failing',
      content: { 'application/json': { schema: ReadySchema } },
    },
  },
});

healthRouter.openapi(healthRoute, (c) =>
  c.json({ status: 'ok' as const, uptimeSeconds: Math.round(process.uptime()) }, 200),
);

healthRouter.openapi(readyRoute, async (c) => {
  const dbOk = await checkDb();
  const body = {
    status: dbOk ? ('ok' as const) : ('degraded' as const),
    checks: { db: dbOk ? ('ok' as const) : ('fail' as const) },
  };
  return c.json(body, dbOk ? 200 : 503);
});
