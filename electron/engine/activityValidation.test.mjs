import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isIncomingActivity,
  isValidActivityOrigin,
  TRUSTED_EXTENSION_ORIGIN,
} from './activityValidation.ts';

const validBrowserEvent = {
  type: 'browser.navigation',
  source: 'browser',
  payload: {
    url: 'https://music.youtube.com/search?q=test',
    title: 'YouTube Music',
    domain: 'music.youtube.com',
    browser: 'Chrome',
    tabId: 7,
  },
};

test('accepts only the bundled extension origin or a local non-browser request', () => {
  assert.equal(isValidActivityOrigin(TRUSTED_EXTENSION_ORIGIN), true);
  assert.equal(isValidActivityOrigin(undefined), true);
  assert.equal(isValidActivityOrigin('chrome-extension://attacker'), false);
  assert.equal(isValidActivityOrigin('https://example.com'), false);
});

test('accepts a valid browser activity payload', () => {
  assert.equal(isIncomingActivity(validBrowserEvent), true);
});

test('rejects source/type mismatches, forged domains, and unsupported schemes', () => {
  assert.equal(isIncomingActivity({ ...validBrowserEvent, source: 'system' }), false);
  assert.equal(isIncomingActivity({
    ...validBrowserEvent,
    payload: { ...validBrowserEvent.payload, domain: 'attacker.example' },
  }), false);
  assert.equal(isIncomingActivity({
    ...validBrowserEvent,
    payload: { ...validBrowserEvent.payload, url: 'file:///C:/secret.txt', domain: '' },
  }), false);
});

test('rejects unknown event types and incomplete payloads', () => {
  assert.equal(isIncomingActivity({ ...validBrowserEvent, type: 'browser.execute' }), false);
  assert.equal(isIncomingActivity({ ...validBrowserEvent, payload: { url: 'https://music.youtube.com/' } }), false);
});
