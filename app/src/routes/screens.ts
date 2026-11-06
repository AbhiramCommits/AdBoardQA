import { Router } from 'express';
import type { Store } from '../store.js';

export function createScreensRouter(store: Store): Router {
  const router = Router();

  router.get('/', (_request, response) => {
    response.status(200).json({ screens: store.listScreens() });
  });

  return router;
}
