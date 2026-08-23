function loopbackUrl(value: string | undefined, fallback: string): string {
  if (!value?.trim()) return fallback;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) return fallback;
    return value.trim().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

function localPort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535 ? parsed : fallback;
}

export const BACKEND_URL = loopbackUrl(process.env.IRIS_BACKEND_URL, 'http://127.0.0.1:8000');
export const DEV_RENDERER_ORIGIN = loopbackUrl(process.env.IRIS_UI_URL, 'http://localhost:5173');
export const ACTIVITY_GATEWAY_PORT = localPort(process.env.IRIS_ACTIVITY_GATEWAY_PORT, 32000);
