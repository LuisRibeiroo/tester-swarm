import { TesterSwarm } from '@testerswarm/react-native';
import simulatorPkg from './simulator.js';

const {
  createTesterSwarm,
  createSimulatedAndroidBridge,
  createLoopSimulator,
  runLiveServerScenario,
} = simulatorPkg;

async function main() {
  // 1. Call the real imported @testerswarm/react-native singleton (safe no-op outside Android runtime)
  const runtimeStatus = await TesterSwarm.status();
  console.log(`[1/5] Runtime import (@testerswarm/react-native) outside Android -> ${runtimeStatus}`);

  // 2. Wire package factory against a simulated Android bridge and step through 12x14 lifecycle
  const bridge = createSimulatedAndroidBridge();
  const androidSdk = createTesterSwarm(bridge.getBridge);
  const sim = createLoopSimulator(androidSdk);

  console.log(`[2/5] Boot (${sim.getCurrentPhase().name}) -> ${await sim.readStatus()}`);

  const s1 = await sim.advance(bridge);
  console.log(`[3/5] ${s1.phase.name} -> ${s1.status} (${s1.phase.summary})`);

  const s2 = await sim.advance(bridge);
  console.log(`[4/5] ${s2.phase.name} -> ${s2.status} (${s2.phase.summary})`);

  const s3 = await sim.advance(bridge);
  console.log(`[5/5] ${s3.phase.name} -> ${s3.status} (${s3.phase.summary})`);

  const apiUrl = process.env.TESTERSWARM_API_URL?.trim();
  if (apiUrl) {
    const appKey = process.env.TESTERSWARM_APP_KEY?.trim() || 'ts_pk_example_rn_0001';
    const packageName = process.env.TESTERSWARM_PACKAGE_NAME?.trim() || 'dev.testerswarm.example.rn';
    const token = process.env.TESTERSWARM_TRACKING_TOKEN?.trim() || 'demo-tracking-token';

    console.log(`[live] Running live server scenario against ${apiUrl}`);
    const live = await runLiveServerScenario({ apiUrl, appKey, packageName, token });
    console.log(
      `[live 1/4] POST /sdk-handshake (no token) -> status=${live.initialHandshake?.status}, enabled=${live.initialHandshake?.enabled}`
    );
    console.log(
      `[live 2/4] POST /sdk-handshake (token + wrapper=react_native) -> status=${live.enrolledHandshake?.status}, enabled=${live.enrolledHandshake?.enabled}`
    );
    console.log(
      `[live 3/4] POST /sdk-events -> accepted=${JSON.stringify(live.events?.accepted)}, enabled=${live.events?.enabled}`
    );
    console.log(
      `[live 4/4] GET /sdk-config -> enabled=${live.config?.enabled}, flushIntervalSec=${live.config?.flushIntervalSec}`
    );
  }
}

main();
