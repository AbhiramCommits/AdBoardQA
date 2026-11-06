import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { AppError } from './errors.js';
import { createCampaignsRouter } from './routes/campaigns.js';
import { createScreensRouter } from './routes/screens.js';
import { Store } from './store.js';

export interface AppOptions {
  store?: Store;
  filePath?: string | null;
}

export function createApp(options: AppOptions = {}): express.Express {
  const filePath =
    options.filePath === undefined
      ? (process.env['DATA_FILE'] ?? path.resolve(process.cwd(), 'data/db.json'))
      : options.filePath;
  const store = options.store ?? new Store({ filePath });
  const app = express();

  app.use((request, response, next) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-user,x-reviewer');
    if (request.method === 'OPTIONS') {
      response.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.post('/api/test/reset', (_request, response) => {
    const counts = store.reset();
    response.status(200).json({ ok: true, ...counts });
  });

  app.use('/api/screens', createScreensRouter(store));
  app.use('/api/campaigns', createCampaignsRouter(store));

  app.use((_request, response) => {
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  app.use(
    (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      if (error instanceof AppError) {
        response.status(error.status).json({
          error: { code: error.code, message: error.message, field: error.field },
        });
        return;
      }
      if (error instanceof SyntaxError && 'body' in error) {
        response.status(400).json({
          error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' },
        });
        return;
      }
      console.error(error);
      response.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' },
      });
    },
  );

  return app;
}
