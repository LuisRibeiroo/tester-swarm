import test from 'node:test';
import assert from 'node:assert/strict';
import { TesterLoop } from '@testerloop/react-native';
import simulatorPkg from '../src/simulator.js';

const { createTesterLoop, createSimulatedAndroidBridge, createLoopSimulator } = simulatorPkg;

test('imports @testerloop/react-native safely as no-op outside Android runtime', async () => {
  assert.equal(await TesterLoop.status(), 'DISABLED');
  await assert.doesNotReject(() => TesterLoop.setEnabled(false));
});

test('simulates full 12x14 closed-testing flow through @testerloop/react-native bridge', async () => {
  const bridge = createSimulatedAndroidBridge();
  const sdk = createTesterLoop(bridge.getBridge);
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
