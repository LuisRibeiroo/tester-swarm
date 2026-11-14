const { TesterLoop, createTesterLoop } = require('@testerloop/react-native');

const PHASES = [
  {
    name: 'INITIALIZED',
    summary: 'Autolinking ativo via androidx.startup sem token do Hub',
    expectedStatus: 'NOT_ENROLLED',
  },
  {
    name: 'HANDSHAKE',
    summary: 'Intent io.testerloop.action.OPEN + token JWT ES256 (wrapper=react_native)',
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

function createLoopSimulator(sdk = TesterLoop) {
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

module.exports = {
  PHASES,
  TesterLoop,
  createTesterLoop,
  createSimulatedAndroidBridge,
  createLoopSimulator,
};
