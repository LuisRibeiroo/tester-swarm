import { TesterLoop } from '@testerloop/react-native';
import simulatorPkg from './simulator.js';

const { createTesterLoop, createSimulatedAndroidBridge, createLoopSimulator } = simulatorPkg;

async function main() {
  // 1. Call the real imported @testerloop/react-native singleton (safe no-op outside Android runtime)
  const runtimeStatus = await TesterLoop.status();
  console.log(`[1/5] Runtime import (@testerloop/react-native) outside Android -> ${runtimeStatus}`);

  // 2. Wire package factory against a simulated Android bridge and step through 12x14 lifecycle
  const bridge = createSimulatedAndroidBridge();
  const androidSdk = createTesterLoop(bridge.getBridge);
  const sim = createLoopSimulator(androidSdk);

  console.log(`[2/5] Boot (${sim.getCurrentPhase().name}) -> ${await sim.readStatus()}`);

  const s1 = await sim.advance(bridge);
  console.log(`[3/5] ${s1.phase.name} -> ${s1.status} (${s1.phase.summary})`);

  const s2 = await sim.advance(bridge);
  console.log(`[4/5] ${s2.phase.name} -> ${s2.status} (${s2.phase.summary})`);

  const s3 = await sim.advance(bridge);
  console.log(`[5/5] ${s3.phase.name} -> ${s3.status} (${s3.phase.summary})`);
}

main();
