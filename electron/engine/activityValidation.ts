import type { CollectorSource, EventPayload, EventType } from '../shared/types.ts';

export const TRUSTED_EXTENSION_ORIGIN = 'chrome-extension://gfpconidbjcgokdmmfbnfgmcmcmigbog';

const EVENT_TYPES: ReadonlySet<string> = new Set([
  'window.focus', 'window.blur', 'app.switch', 'session.start', 'session.end',
  'browser.navigation', 'browser.tab.focus', 'browser.tab.close',
  'ide.file.open', 'ide.file.save', 'ide.file.close', 'terminal.command',
  'user.intent_anchor',
]);

const COLLECTOR_SOURCES: ReadonlySet<string> = new Set([
  'window', 'browser', 'ide', 'terminal', 'system', 'user',
]);

export interface IncomingActivity {
  type: EventType;
  source: CollectorSource;
  payload: EventPayload;
}

function isBoundedString(value: unknown, maxLength = 4096): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

export function isValidActivityOrigin(origin: string | undefined): boolean {
  return !origin || origin === TRUSTED_EXTENSION_ORIGIN;
}

export function isValidPayload(source: string, type: string, value: unknown): value is EventPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (type.startsWith('browser.') && source !== 'browser') return false;
  if (source === 'browser') {
    if (!isBoundedString(payload.url) || !isBoundedString(payload.title, 1000)
      || !isBoundedString(payload.domain, 255) || !isBoundedString(payload.browser, 100)) return false;
    try {
      const parsed = new URL(payload.url);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname === payload.domain;
    } catch {
      return false;
    }
  }
  if (source === 'window') {
    return isBoundedString(payload.appName, 255)
      && isBoundedString(payload.windowTitle, 2000)
      && typeof payload.processId === 'number';
  }
  if (source === 'ide') return isBoundedString(payload.editor, 255) && isBoundedString(payload.filePath);
  if (source === 'terminal') return isBoundedString(payload.shell, 255) && isBoundedString(payload.workingDirectory);
  return source === 'system' || source === 'user';
}

export function isIncomingActivity(value: unknown): value is IncomingActivity {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return typeof data.type === 'string'
    && EVENT_TYPES.has(data.type)
    && typeof data.source === 'string'
    && COLLECTOR_SOURCES.has(data.source)
    && isValidPayload(data.source, data.type, data.payload);
}
