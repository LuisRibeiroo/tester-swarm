import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { TesterSwarm } from '@testerswarm/react-native';
import simulatorPkg from '../src/simulator.js';

const {
  createTesterSwarm,
  createSimulatedAndroidBridge,
  createLoopSimulator,
  runLiveServerScenario,
} = simulatorPkg;

test('imports @testerswarm/react-native safely as no-op outside Android runtime', async () => {
  assert.equal(await TesterSwarm.status(), 'DISABLED');
  await assert.doesNotReject(() => TesterSwarm.setEnabled(false));
});

test('simulates full 12x14 closed-testing flow through @testerswarm/react-native bridge', async () => {
  const bridge = createSimulatedAndroidBridge();
  const sdk = createTesterSwarm(bridge.getBridge);
  const sim = createLoopSimulator(sdk);

  assert.equal(await sim.readStatus(), 'NOT_ENROLLED');

  const handshake = await sim.advance(bridge);
  assert.equal(handshake.phase.name, 'HANDSHAKE');
  assert.equal(handshake.status, 'TRACKING');

  const session = await sim.advance(bridge);
  assert.equal(session.phase.name, 'SESSION_60S');
  assert.equal(session.status, 'TRACKING');

  const killSwitch = await sim.advance(bridge);
  assert.equal(killSwitch.phase.name, 'KILL_SWITCH');
  assert.equal(killSwitch.status, 'DISABLED');

  const reboot = await sim.advance(bridge);
  assert.equal(reboot.phase.name, 'INITIALIZED');
  assert.equal(reboot.status, 'NOT_ENROLLED');
});

test('runs live server scenario against ephemeral HTTP backend', async () => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const body = rawBody ? JSON.parse(rawBody) : null;
    requests.push({ method: req.method, url: req.url, body });

    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'POST' && req.url === '/functions/v1/sdk-handshake') {
      const status = body.token ? 'tracking' : 'not_enrolled';
      res.end(JSON.stringify({ status, enabled: true, flushIntervalSec: 30 }));
      return;
    }

    if (req.method === 'POST' && req.url === '/functions/v1/sdk-events') {
      res.end(
        JSON.stringify({
          accepted: body.events.map((ev) => ev.id),
          enabled: true,
        })
      );
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/functions/v1/sdk-config?')) {
      res.end(JSON.stringify({ enabled: true, flushIntervalSec: 30 }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const apiUrl = `http://127.0.0.1:${port}/functions/v1`;
    const result = await runLiveServerScenario({
      apiUrl,
      appKey: 'ts_pk_example_rn_0001',
      token: 'eyJhbGciOiJFUzI1NiJ9.test.sig',
    });

    assert.deepEqual(result.initialHandshake, {
      status: 'not_enrolled',
      enabled: true,
      flushIntervalSec: 30,
    });
    assert.deepEqual(result.enrolledHandshake, {
      status: 'tracking',
      enabled: true,
      flushIntervalSec: 30,
    });
    assert.equal(result.events.enabled, true);
    assert.equal(result.events.accepted.length, 2);
    assert.deepEqual(result.config, { enabled: true, flushIntervalSec: 30 });

    assert.equal(requests.length, 4);
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].url, '/functions/v1/sdk-handshake');
    assert.equal(requests[0].body.token, null);
    assert.equal(requests[0].body.packageName, 'dev.testerswarm.example.rn');
    assert.deepEqual(requests[0].body.sdk, {
      platform: 'android',
      version: '1.0.0',
      wrapper: 'react_native',
    });

    assert.equal(requests[1].method, 'POST');
    assert.equal(requests[1].url, '/functions/v1/sdk-handshake');
    assert.equal(requests[1].body.token, 'eyJhbGciOiJFUzI1NiJ9.test.sig');
    assert.deepEqual(requests[1].body.sdk, {
      platform: 'android',
      version: '1.0.0',
      wrapper: 'react_native',
    });

    assert.equal(requests[2].method, 'POST');
    assert.equal(requests[2].url, '/functions/v1/sdk-events');
    assert.equal(requests[2].body.installId, 'rn-sim-install-1');
    assert.equal(requests[2].body.token, 'eyJhbGciOiJFUzI1NiJ9.test.sig');
    assert.equal(requests[2].body.events[0].type, 'ping');
    assert.equal(requests[2].body.events[1].type, 'session');
    assert.equal(requests[2].body.events[1].foregroundMs, 65000);

    assert.equal(requests[3].method, 'GET');
    assert.equal(
      requests[3].url,
      '/functions/v1/sdk-config?appKey=ts_pk_example_rn_0001'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
