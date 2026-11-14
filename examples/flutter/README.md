# TesterLoop Flutter Example App

Aplicativo Flutter mínimo importando `testerloop` (`path: ../../packages/sdk-flutter`) e simulando o ciclo de teste fechado 12×14.

## Configuração aplicada
- `pubspec.yaml`: dependência local `testerloop`.
- `android/app/build.gradle.kts`: `minSdk = 23`.
- `android/app/src/main/AndroidManifest.xml`: tag `<meta-data android:name="io.testerloop.APP_KEY" ... />`.
- `lib/main.dart`: chama `TesterLoop.status()` e `TesterLoop.setEnabled()`, além de simular handshake, sessão de 60s e kill-switch.

## Rodar testes e análise
```bash
flutter pub get
flutter analyze --no-fatal-infos
flutter test
```
