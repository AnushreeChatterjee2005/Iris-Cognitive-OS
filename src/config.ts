const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';

function resolveLoopbackBackendUrl(): string {
  const configured = import.meta.env.VITE_IRIS_BACKEND_URL?.trim();
  if (!configured) return DEFAULT_BACKEND_URL;
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
      throw new Error('Backend URL must use HTTP on a loopback host');
    }
    return configured.replace(/\/$/, '');
  } catch (error) {
    console.error('[IRIS] Ignoring unsafe VITE_IRIS_BACKEND_URL:', error);
    return DEFAULT_BACKEND_URL;
  }
}

export const IRIS_BACKEND_URL = resolveLoopbackBackendUrl();

export function irisApiUrl(path: string): string {
  return `${IRIS_BACKEND_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
