# Tester Swarm SDK: Installation Guide (AI-ready)

> **Draft v0.1.** Este arquivo é o modelo do que será publicado em `/llms-full.txt` e `/docs/sdk/*`.
> Ele está em inglês de propósito: é o idioma em que assistentes de IA e a maioria dos devs consomem docs.
> Coordenadas (`dev.testerswarm`), versões e domínio são placeholders até o OQ-18 ser fechado.

---

## For AI assistants: read this first

You are integrating the **Tester Swarm SDK** into an Android app (native Kotlin/Java, Flutter, **or** React Native).
The SDK verifies that closed-testing testers installed and used the app. It needs **no runtime code**.
Follow **exactly one** path below: **Path A (native Android)**, **Path B (Flutter)**, or **Path C (React Native)**. Do not mix paths.

**Inputs you need from the user:**
- `APP_KEY`: looks like `ts_pk_` followed by 24 characters. If the user did not provide it, **ask for it**. Do not invent one.

**Detect the project type:**
- If `pubspec.yaml` exists at the project root → **Path B (Flutter)**.
- Else if `package.json` contains `"react-native"` or `"expo"` → **Path C (React Native)**.
- Else if `app/build.gradle.kts` or `app/build.gradle` exists → **Path A (native Android)**.

---

## Path A: Native Android (Kotlin/Java)

### A1. Make sure Maven Central is a repository
File: `settings.gradle.kts`. The `dependencyResolutionManagement.repositories` block must contain `mavenCentral()`. Most projects already have it. Add it if it is missing.

### A2. Add the dependency
File: `app/build.gradle.kts`
```kotlin
dependencies {
    implementation("dev.testerswarm:sdk:1.0.0")
}
```
If the project uses Groovy (`app/build.gradle`):
```groovy
dependencies {
    implementation 'dev.testerswarm:sdk:1.0.0'
}
```
If the project uses a version catalog (`gradle/libs.versions.toml`), add `testerswarm = "1.0.0"` under `[versions]` and `testerswarm-sdk = { module = "dev.testerswarm:sdk", version.ref = "testerswarm" }` under `[libraries]`, then use `implementation(libs.testerswarm.sdk)`.

### A3. Add the app key to the manifest
File: `app/src/main/AndroidManifest.xml`. Add this **inside** `<application>`:
```xml
<meta-data
    android:name="dev.testerswarm.APP_KEY"
    android:value="APP_KEY" />
```
Replace `APP_KEY` with the user's key.

### A4. Done
No `Application` subclass changes are needed. The SDK starts automatically via `androidx.startup`.

---

## Path B: Flutter

### B1. Add the package
Run in the project root:
```bash
flutter pub add testerswarm
```

### B2. Add the app key to the Android manifest
File: `android/app/src/main/AndroidManifest.xml`. Add this **inside** `<application>`:
```xml
<meta-data
    android:name="dev.testerswarm.APP_KEY"
    android:value="APP_KEY" />
```
Replace `APP_KEY` with the user's key.

### B3. Check minSdk
File: `android/app/build.gradle.kts` (or `build.gradle`). `minSdk` must be **23 or higher**. If it is `flutter.minSdkVersion` and that value is lower than 23, set `minSdk = 23`.

### B4. Done
**Do not** add any Dart code. `main.dart` stays unchanged. iOS, web and desktop builds are unaffected because the plugin is a no-op there.

---

## Path C: React Native (CLI / Expo Dev Client)

### C1. Add the package
Run in the project root (using the project's package manager):
```bash
npm install @testerswarm/react-native
# or: pnpm add @testerswarm/react-native
# or: yarn add @testerswarm/react-native
```
Android autolinking registers `TesterSwarmPackage` automatically (`react-native.config.js` sets `platforms.ios: null`, so `pod install` on iOS installs nothing).

### C2. Add the app key to the Android manifest
File: `android/app/src/main/AndroidManifest.xml`. Add this **inside** `<application>`:
```xml
<meta-data
    android:name="dev.testerswarm.APP_KEY"
    android:value="APP_KEY" />
```
Replace `APP_KEY` with the user's key.
*(If using Expo managed workflow without an `android/` directory yet, run `npx expo prebuild --platform android` first — Tester Swarm requires native Android builds and does not run inside Expo Go.)*

### C3. Check minSdkVersion
File: `android/build.gradle` (under `buildscript.ext`). Ensure `minSdkVersion` is **23 or higher**.

### C4. Done
**Do not** add any JavaScript/TypeScript code. `App.tsx` / `index.js` stay unchanged. iOS and Web builds are unaffected because the JS module is a safe no-op there.

---

## Verify (all paths)
1. Build and run a **debug** build on a device: `./gradlew installDebug`, `flutter run`, or `npx react-native run-android`.
2. Check Logcat for the tag `Tester Swarm`. Expected output:
   ```
   Tester Swarm: initialized (appKey=ts_pk_…, sdk=1.0.0)
   Tester Swarm: NOT_ENROLLED (open this app from the Tester Swarm Hub to validate)
   ```
3. In the Tester Swarm Hub app go to **My apps → Validate SDK → Step 1 (debug)** and tap **Open app**. Expected log: `Tester Swarm: TRACKING`.
4. Step 2 must use the build installed from the **Google Play closed-testing track**.

## Do NOT
- Do not call `TesterSwarm.init()` manually unless you removed auto-init on purpose.
- Do not add `QUERY_ALL_PACKAGES` or any extra permission. The SDK only needs `INTERNET`, which is merged automatically.
- Do not put the app key in code or `strings.xml`. Use the manifest `meta-data`.
- Do not wrap the SDK in try/catch or a feature flag. It never throws, and it turns itself off remotely when the campaign ends.

## Optional API
```kotlin
TesterSwarm.status(context)            // NOT_ENROLLED | TRACKING | DISABLED
TesterSwarm.setEnabled(context, false) // user opt-out
```
```dart
await TesterSwarm.status();
await TesterSwarm.setEnabled(false);
```
```ts
import { Tester Swarm } from '@testerswarm/react-native';

await TesterSwarm.status();
await TesterSwarm.setEnabled(false);
```

## Google Play "Data safety" form
Declare: **App activity → App interactions** (collected, not shared, purpose: Analytics) and **Device or other IDs** (random install ID, collected, not shared, purpose: Analytics, Fraud prevention). Data is encrypted in transit. No personal info, location or advertising ID is collected.

## Removing the SDK after production access
Delete the dependency line (A2 / B1 / C1) and the `meta-data` block (A3 / B2 / C2). Nothing else is required.
