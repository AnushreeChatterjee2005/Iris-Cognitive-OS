import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { IRIS_BACKEND_URL } from './config.ts'

type TokenBridge = { getLaunchToken?: () => Promise<string> };

async function bootstrap() {
  const nativeFetch = window.fetch.bind(window);
  let launchToken = '';
  const bridge = (window as unknown as { electronAPI?: TokenBridge }).electronAPI;
  if (bridge?.getLaunchToken) {
    try {
      launchToken = await bridge.getLaunchToken();
    } catch (error) {
      console.error('[IRIS] Secure backend token is unavailable:', error);
    }
  }

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    if (!requestUrl.startsWith(`${IRIS_BACKEND_URL}/`)) {
      return nativeFetch(input, init);
    }
    if (!launchToken && bridge?.getLaunchToken) {
      try {
        launchToken = await bridge.getLaunchToken();
      } catch {
        return nativeFetch(input, init);
      }
    }
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    headers.set('X-IRIS-Token', launchToken);
    const isEventStream = headers.get('Accept')?.includes('text/event-stream');
    const timeoutController = new AbortController();
    const callerSignal = init.signal || (input instanceof Request ? input.signal : undefined);
    const abortFromCaller = () => timeoutController.abort(callerSignal?.reason);
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeoutId = isEventStream ? undefined : window.setTimeout(
      () => timeoutController.abort(new DOMException('IRIS backend request timed out', 'TimeoutError')),
      15_000,
    );
    const requestInit = { ...init, headers, signal: timeoutController.signal };
    let response: Response;
    try {
      response = await nativeFetch(input, requestInit);
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
    if (response.status === 401 && bridge?.getLaunchToken) {
      try {
        launchToken = await bridge.getLaunchToken();
        headers.set('X-IRIS-Token', launchToken);
        const retrySignal = isEventStream
          ? callerSignal
          : callerSignal
            ? AbortSignal.any([callerSignal, AbortSignal.timeout(15_000)])
            : AbortSignal.timeout(15_000);
        response = await nativeFetch(input, { ...init, headers, signal: retrySignal });
      } catch {
        // Return the original authorization failure to the caller.
      }
    }
    return response;
  };

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
