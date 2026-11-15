# Tester Swarm React Native Example App

Aplicativo React Native mínimo importando `@testerswarm/react-native` (`file:../../packages/sdk-react-native`) e simulando o ciclo de teste fechado 12×14.

## Configuração aplicada
- `package.json`: dependência local `@testerswarm/react-native`.
- `android/build.gradle` e `android/settings.gradle`: autolinking apontando para `packages/sdk-react-native/android` com `minSdkVersion = 23`.
- `android/app/src/main/AndroidManifest.xml`: tag `<meta-data android:name="dev.testerswarm.APP_KEY" ... />`.
- `src/App.js` / `src/simulator.js`: importa `Tester Swarm`, chama `status()` / `setEnabled()` e simula handshake + sessão de 60s + kill-switch.

## Rodar simulação CLI e testes
```bash
pnpm install
pnpm run simulate
pnpm test
```
