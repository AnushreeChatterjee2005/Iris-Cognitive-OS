import path from 'path';
import { readFile } from 'fs/promises';
import { BACKEND_URL } from './config';

export const launchTokenPath = path.join(
  process.env.LOCALAPPDATA || process.cwd(),
  'IRIS',
  'launch-token',
);

export async function readLaunchToken(attempts = 20): Promise<string> {
  const configuredToken = process.env.IRIS_LAUNCH_TOKEN?.trim();
  if (configuredToken) return configuredToken;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const token = (await readFile(launchTokenPath, 'utf8')).trim();
      if (token) {
        const validation = await fetch(`${BACKEND_URL}/api/pipelines`, {
          headers: { 'X-IRIS-Token': token },
          signal: AbortSignal.timeout(3000),
        });
        if (validation.status !== 401) return token;
      }
    } catch {
      // The Python backend may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('IRIS backend launch token is unavailable.');
}

export async function authenticatedBackendFetch(url: string, init: RequestInit = {}) {
  const token = await readLaunchToken();
  const headers = new Headers(init.headers);
  headers.set('X-IRIS-Token', token);
  const signal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
    : AbortSignal.timeout(15_000);
  return fetch(url, { ...init, headers, signal });
}
