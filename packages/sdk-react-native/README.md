# `@testerswarm/react-native`

Zero-code React Native wrapper for the Tester Swarm Android closed-testing verification SDK.

- **Android-only** (`react-native.config.js` sets `platforms.ios: null`).
- **Safe no-op** on iOS, Web, and non-Android test environments.
- **No JS/TS code required**: `androidx.startup` auto-initializes from `dev.testerswarm.APP_KEY` in `android/app/src/main/AndroidManifest.xml`.

## Install

```bash
pnpm add @testerswarm/react-native
# or: npm install @testerswarm/react-native
```

Add inside `<application>` in `android/app/src/main/AndroidManifest.xml`:

```xml
<meta-data
    android:name="dev.testerswarm.APP_KEY"
    android:value="ts_pk_your_app_key_here" />
```

Ensure `minSdkVersion >= 23` in `android/build.gradle`.

## Optional JavaScript / TypeScript API

```ts
import { Tester Swarm } from '@testerswarm/react-native';

const status = await TesterSwarm.status(); // 'NOT_ENROLLED' | 'TRACKING' | 'DISABLED'
await TesterSwarm.setEnabled(false);
```
