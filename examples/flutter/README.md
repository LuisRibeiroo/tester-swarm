# Tester Swarm Flutter Example App

Aplicativo Flutter mínimo importando `testerswarm` (`path: ../../packages/sdk-flutter`) e simulando o ciclo de teste fechado 12×14.

## Configuração aplicada
- `pubspec.yaml`: dependência local `testerswarm`.
- `android/app/build.gradle.kts`: `minSdk = 23`.
- `android/app/src/main/AndroidManifest.xml`: tag `<meta-data android:name="dev.testerswarm.APP_KEY" ... />`.
- `lib/main.dart`: chama `TesterSwarm.status()` e `TesterSwarm.setEnabled()`, além de simular handshake, sessão de 60s e kill-switch.

## Rodar testes e análise
```bash
flutter pub get
flutter analyze --no-fatal-infos
flutter test
```
