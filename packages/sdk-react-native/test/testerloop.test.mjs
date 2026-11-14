import test from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../src/index.js';

const { createTesterLoop } = pkg;

test('returns DISABLED on non-Android platforms without touching native module', async () => {
  let called = false;
  const sdk = createTesterLoop(() => ({
    platformOS: 'ios',
    nativeModule: {
      async status() {
        called = true;
        return 'TRACKING';
      },
      async setEnabled() {
        called = true;
      },
    },
  }));

  const status = await sdk.status();
  await sdk.setEnabled(false);

  assert.equal(status, 'DISABLED');
  assert.equal(called, false);
});

test('returns DISABLED safely when Android native bridge is missing', async () => {
  const sdk = createTesterLoop(() => ({
    platformOS: 'android',
    nativeModule: undefined,
  }));

  assert.equal(await sdk.status(), 'DISABLED');
  await assert.doesNotReject(() => sdk.setEnabled(false));
});

test('delegates status and setEnabled to Android NativeModules.TesterLoop', async () => {
  const calls = [];
  const sdk = createTesterLoop(() => ({
    platformOS: 'android',
    nativeModule: {
      async status() {
        calls.push(['status']);
        return 'TRACKING';
      },
      async setEnabled(enabled) {
        calls.push(['setEnabled', enabled]);
      },
    },
  }));

  const status = await sdk.status();
  await sdk.setEnabled(false);

  assert.equal(status, 'TRACKING');
  assert.deepEqual(calls, [['status'], ['setEnabled', false]]);
});

test('falls back to DISABLED on unknown native wire value or thrown error', async () => {
  const sdk = createTesterLoop(() => ({
    platformOS: 'android',
    nativeModule: {
      async status() {
        return 'UNKNOWN_VALUE';
      },
      async setEnabled() {
        throw new Error('bridge error');
      },
    },
  }));

  assert.equal(await sdk.status(), 'DISABLED');
  await assert.doesNotReject(() => sdk.setEnabled(true));
});
