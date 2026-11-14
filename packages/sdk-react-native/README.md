# `@testerloop/react-native`

Zero-code React Native wrapper for the TesterLoop Android closed-testing verification SDK.

- **Android-only** (`react-native.config.js` sets `platforms.ios: null`).
- **Safe no-op** on iOS, Web, and non-Android test environments.
- **No JS/TS code required**: `androidx.startup` auto-initializes from `io.testerloop.APP_KEY` in `android/app/src/main/AndroidManifest.xml`.

## Install

```bash
pnpm add @testerloop/react-native
# or: npm install @testerloop/react-native
```

Add inside `<application>` in `android/app/src/main/AndroidManifest.xml`:

```xml
<meta-data
    android:name="io.testerloop.APP_KEY"
    android:value="tl_pk_your_app_key_here" />
```

Ensure `minSdkVersion >= 23` in `android/build.gradle`.

## Optional JavaScript / TypeScript API

```ts
import { TesterLoop } from '@testerloop/react-native';

const status = await TesterLoop.status(); // 'NOT_ENROLLED' | 'TRACKING' | 'DISABLED'
await TesterLoop.setEnabled(false);
```
