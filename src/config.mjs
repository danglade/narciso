import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const local = resolve(process.env.NARCISO_DATA_DIR || resolve(homedir(), '.local/share/narciso/data'));
mkdirSync(local, { recursive: true, mode: 0o700 });
export const owner = process.env.NARCISO_OWNER_PHONE || '';
export const email = process.env.NARCISO_GOOGLE_EMAIL || '';
export const timezone = process.env.NARCISO_TIMEZONE || 'America/New_York';
export function normalizePhone(value) {
  const compact = String(value || '').replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}
