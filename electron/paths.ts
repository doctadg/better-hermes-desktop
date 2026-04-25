/**
 * Centralized path resolution.
 * userData       → app's persisted store, sqlite cache, logs
 * hermesHome     → ~/.hermes (the Hermes Agent runtime data dir)
 * profileHome(p) → ~/.hermes/profiles/<p> (or hermesHome for default)
 */

import { app } from 'electron';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export function userDataDir(): string {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function logsDir(): string {
  const dir = path.join(userDataDir(), 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function cacheDbPath(): string {
  return path.join(userDataDir(), 'cache.db');
}

export function hermesHome(): string {
  return process.env.HERMES_HOME || path.join(os.homedir(), '.hermes');
}

export function profileHome(profile?: string | null): string {
  const home = hermesHome();
  if (!profile || profile === 'default') return home;
  return path.join(home, 'profiles', profile);
}

export function trackedFile(profile: string | null | undefined, name: 'memory' | 'user' | 'soul'): string {
  const base = profileHome(profile);
  switch (name) {
    case 'memory':
      return path.join(base, 'memories', 'MEMORY.md');
    case 'user':
      return path.join(base, 'memories', 'USER.md');
    case 'soul':
      return path.join(base, 'SOUL.md');
  }
}
