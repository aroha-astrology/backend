import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { birthProfilesRouter } from './modules/birth-profiles/birth-profiles.routes.js';
import { deviceTokensRouter } from './modules/device-tokens/device-tokens.routes.js';
import { astroRouter } from './modules/astro/astro.routes.js';
import { legalRouter } from './modules/legal/legal.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { preferencesRouter } from './modules/preferences/preferences.routes.js';
import { feedbackRouter } from './modules/feedback/feedback.routes.js';
import { kundliRouter } from './modules/kundli/kundli.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requestLogger } from './middleware/logger.js';
import { corsMiddleware } from './middleware/cors.js';

export function createApp(): OpenAPIHono {
  const app = new OpenAPIHono();

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.use('*', corsMiddleware);
  app.use('*', requestLogger);

  app.route('/', healthRouter);
  app.route('/v1/auth', authRouter);
  app.route('/v1', usersRouter);
  app.route('/v1', birthProfilesRouter);
  app.route('/v1', deviceTokensRouter);
  app.route('/v1', astroRouter);
  app.route('/v1', legalRouter);
  app.route('/v1', billingRouter);
  app.route('/v1', preferencesRouter);
  app.route('/v1', feedbackRouter);
  app.route('/v1', kundliRouter);

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'Firebase ID token',
  });

  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      title: 'Aroha Astrology Backend',
      version: '0.1.0',
      description:
        'HTTP API for the Aroha Astrology client. Authentication is via Firebase Auth — pass the Firebase ID token as `Authorization: Bearer <token>`.',
    },
    servers: [
      { url: 'http://13.232.179.137:3000', description: 'EC2 (Mumbai) — staging' },
      { url: 'http://localhost:3000', description: 'Local development' },
    ],
  });

  app.get('/docs', swaggerUI({ url: '/openapi.json' }));

  return app;
}
