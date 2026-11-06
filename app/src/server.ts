import { createApp } from './app.js';

const port = Number(process.env['PORT'] ?? 3001);
const app = createApp();

const server = app.listen(port, () => {
  console.log(`AdBoardQA API listening on http://localhost:${port}`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}, shutting down`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
