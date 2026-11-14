# TesterLoop React Native Example App

Aplicativo React Native mínimo importando `@testerloop/react-native` (`file:../../packages/sdk-react-native`) e simulando o ciclo de teste fechado 12×14.

## Configuração aplicada
- `package.json`: dependência local `@testerloop/react-native`.
- `android/build.gradle` e `android/settings.gradle`: autolinking apontando para `packages/sdk-react-native/android` com `minSdkVersion = 23`.
- `android/app/src/main/AndroidManifest.xml`: tag `<meta-data android:name="io.testerloop.APP_KEY" ... />`.
- `src/App.js` / `src/simulator.js`: importa `TesterLoop`, chama `status()` / `setEnabled()` e simula handshake + sessão de 60s + kill-switch.

## Rodar simulação CLI e testes
```bash
pnpm install
pnpm run simulate
pnpm test
```
