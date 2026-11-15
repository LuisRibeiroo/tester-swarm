const { randomUUID } = require('node:crypto');
const { TesterSwarm, createTesterSwarm } = require('@testerswarm/react-native');

const DEFAULT_SIGNING_CERT_SHA256 =
  '00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF';

const PHASES = [
  {
    name: 'INITIALIZED',
    summary: 'Autolinking ativo via androidx.startup sem token do Hub',
    expectedStatus: 'NOT_ENROLLED',
  },
  {
    name: 'HANDSHAKE',
    summary: 'Intent dev.testerswarm.action.OPEN + token JWT ES256 (wrapper=react_native)',
    expectedStatus: 'TRACKING',
  },
  {
    name: 'SESSION_60S',
    summary: 'Sessao >= 60s em foreground enviada -> +1 ponto pendente',
    expectedStatus: 'TRACKING',
  },
  {
    name: 'KILL_SWITCH',
    summary: 'Campanha encerrada ou opt-out via setEnabled(false)',
    expectedStatus: 'DISABLED',
  },
];

function createSimulatedAndroidBridge() {
  let enabled = true;
  let enrolled = false;

  return {
    enroll() {
      enrolled = true;
    },
    reset() {
      enabled = true;
      enrolled = false;
    },
    getBridge() {
      return {
        platformOS: 'android',
        nativeModule: {
          async status() {
            if (!enabled) return 'DISABLED';
            return enrolled ? 'TRACKING' : 'NOT_ENROLLED';
          },
          async setEnabled(nextEnabled) {
            enabled = Boolean(nextEnabled);
          },
        },
      };
    },
  };
}

function createLoopSimulator(sdk = TesterSwarm) {
  let phaseIndex = 0;

  return {
    getCurrentPhase() {
      return PHASES[phaseIndex];
    },
    async readStatus() {
      return sdk.status();
    },
    async setEnabled(enabled) {
      await sdk.setEnabled(enabled);
      return sdk.status();
    },
    async advance(bridgeController) {
      phaseIndex = (phaseIndex + 1) % PHASES.length;
      const phase = PHASES[phaseIndex];

      if (phase.name === 'INITIALIZED') {
        bridgeController?.reset();
        await sdk.setEnabled(true);
      } else if (phase.name === 'HANDSHAKE' || phase.name === 'SESSION_60S') {
        bridgeController?.enroll();
        await sdk.setEnabled(true);
      } else if (phase.name === 'KILL_SWITCH') {
        await sdk.setEnabled(false);
      }

      const status = await sdk.status();
      return { phase, status };
    },
  };
}

async function requestJson(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    throw new Error(`${method} ${url} failed with HTTP ${res.status}: ${text}`);
  }
  return data;
}

async function runLiveServerScenario({
  apiUrl,
  appKey,
  packageName = 'dev.testerswarm.example.rn',
  installId = 'rn-sim-install-1',
  token,
} = {}) {
  if (!apiUrl || typeof apiUrl !== 'string') {
    throw new Error('apiUrl is required');
  }
  if (!appKey || typeof appKey !== 'string') {
    throw new Error('appKey is required');
  }

  const baseUrl = apiUrl.replace(/\/+$/, '');
  const handshakeBase = {
    appKey,
    packageName,
    versionCode: 1,
    signingCertSha256: DEFAULT_SIGNING_CERT_SHA256,
    installer: null,
    debuggable: true,
    installId,
    sdk: {
      platform: 'android',
      version: '1.0.0',
      wrapper: 'react_native',
    },
    device: {
      sdkInt: 35,
    },
  };

  const initialHandshake = await requestJson(`${baseUrl}/sdk-handshake`, {
    method: 'POST',
    body: {
      ...handshakeBase,
      token: null,
    },
  });

  const enrolledHandshake = await requestJson(`${baseUrl}/sdk-handshake`, {
    method: 'POST',
    body: {
      ...handshakeBase,
      token: token ?? null,
    },
  });

  const now = Date.now();
  const foregroundMs = 65000;
  const events = await requestJson(`${baseUrl}/sdk-events`, {
    method: 'POST',
    body: {
      appKey,
      packageName,
      installId,
      token: token ?? null,
      events: [
        {
          type: 'ping',
          id: `ping-${randomUUID()}`,
          clientTs: now - foregroundMs,
        },
        {
          type: 'session',
          id: `session-${randomUUID()}`,
          startTs: now - foregroundMs,
          foregroundMs,
        },
      ],
    },
  });

  const config = await requestJson(
    `${baseUrl}/sdk-config?appKey=${encodeURIComponent(appKey)}`,
    { method: 'GET' }
  );

  return {
    initialHandshake,
    enrolledHandshake,
    events,
    config,
  };
}

module.exports = {
  PHASES,
  TesterSwarm,
  createTesterSwarm,
  createSimulatedAndroidBridge,
  createLoopSimulator,
  runLiveServerScenario,
};
