import { env } from 'cloudflare:workers';

export function getDb() {
  return (env as unknown as { DB: D1Database }).DB;
}
