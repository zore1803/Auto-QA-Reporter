import { existsSync } from 'fs';

export function playwrightEnv(): Record<string, string> {
  return process.env as Record<string, string>;
}
