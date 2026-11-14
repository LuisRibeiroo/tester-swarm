# TesterLoop Android Native Example App

Aplicativo Android nativo (Kotlin) importando `io.testerloop:sdk:1.0.0` via composite build (`../../packages/sdk-android`) e simulando o ciclo completo do SDK.

## Configuração aplicada
- `settings.gradle.kts`: substitui `io.testerloop:sdk` pelo módulo local `packages/sdk-android`.
- `app/build.gradle.kts`: `minSdk = 23` e `implementation("io.testerloop:sdk:1.0.0")`.
- `app/src/main/AndroidManifest.xml`: tag `<meta-data android:name="io.testerloop.APP_KEY" ... />`.
- `MainActivity.kt` / `SimulatedSdkFlow.kt`: consulta `TesterLoop.status(this)`, alterna `TesterLoop.setEnabled(this, ...)` e simula handshake + sessão de 60s + kill-switch.

## Rodar testes JVM
```bash
../../apps/hub/android/gradlew -p . testDebugUnitTest
```
