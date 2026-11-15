const VALID_STATUSES = new Set(['NOT_ENROLLED', 'TRACKING', 'DISABLED']);

function loadReactNativeBridge() {
  try {
    // Loaded dynamically so web/SSR or pure JS test runtimes without RN never fail on import.
    const rn = require('react-native');
    return {
      platformOS: rn && rn.Platform ? rn.Platform.OS : undefined,
      nativeModule: rn && rn.NativeModules ? rn.NativeModules.TesterSwarm : undefined,
    };
  } catch {
    return { platformOS: undefined, nativeModule: undefined };
  }
}

function normalizeStatus(value) {
  return VALID_STATUSES.has(value) ? value : 'DISABLED';
}

/**
 * Creates a TesterSwarm facade backed by a custom platform/bridge resolver.
 * Primarily exported for unit testing; host apps should use `TesterSwarm`.
 */
function createTesterSwarm(getBridge = loadReactNativeBridge) {
  return {
    async status() {
      try {
        const { platformOS, nativeModule } = getBridge() || {};
        if (platformOS !== 'android' || !nativeModule || typeof nativeModule.status !== 'function') {
          return 'DISABLED';
        }
        const raw = await nativeModule.status();
        return normalizeStatus(raw);
      } catch {
        return 'DISABLED';
      }
    },

    async setEnabled(enabled) {
      try {
        const { platformOS, nativeModule } = getBridge() || {};
        if (platformOS !== 'android' || !nativeModule || typeof nativeModule.setEnabled !== 'function') {
          return;
        }
        await nativeModule.setEnabled(Boolean(enabled));
      } catch {
        // Safe no-op when native bridge is unavailable or running outside Android
      }
    },
  };
}

const TesterSwarm = createTesterSwarm();

exports.TesterSwarm = TesterSwarm;
exports.createTesterSwarm = createTesterSwarm;
exports.default = TesterSwarm;
