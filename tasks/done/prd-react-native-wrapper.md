# PRD: Wrapper React Native (`@testerswarm/react-native`)

> **Status:** Concluído · **Versão:** 1.0 · **Data:** 2026-11-14  
> **Referências:** [`PRD.md`](../../PRD.md) · [`SPEC.md`](../../SPEC.md) · [`SDK_AI_INSTALL.md`](../../SDK_AI_INSTALL.md)

---

## 1. Introduction/Overview

Desenvolvedores React Native (CLI e Expo Dev Client) também precisam cumprir a regra de **12 testadores por 14 dias contínuos** no Google Play sem escrever código Kotlin manual nem quebrar builds iOS/Web.

O pacote **`@testerswarm/react-native`** (`packages/sdk-react-native`) replica exatamente a ergonomia zero-code do plugin Flutter `testerswarm`:
- Instala com `npm install @testerswarm/react-native` (ou `pnpm add`) + 1 `<meta-data>` (`dev.testerswarm.APP_KEY`) em `android/app/src/main/AndroidManifest.xml`.
- Faz **autolinking** somente no Android (`react-native.config.js` com `platforms.ios = null` para não afetar `pod install`).
- Auto-detecta o wrapper no SDK Kotlin (`TesterSwarm.kt` identifica `dev.testerswarm.reactnative.TesterSwarmPackage` e envia `"wrapper": "react_native"` no handshake).
- Expõe API JS/TS opcional (`TesterSwarm.status()`, `TesterSwarm.setEnabled(enabled)`) com **no-op seguro** em iOS, Web e ambientes sem bridge nativo.

---

## 2. Goals

- Criar o pacote `packages/sdk-react-native` (`@testerswarm/react-native`) com autolinking Android e no-op em outras plataformas.
- Atualizar `packages/sdk-android` (`TesterSwarm.kt`) para reportar `"react_native"` (ou `"flutter"`) em `sdk.wrapper` no `/sdk/v1/handshake` sem exigir código JS/Dart no app hospedeiro.
- Atualizar contrato OpenAPI (`packages/shared-contracts/openapi-v1.yaml`), docs (`PRD.md`, `SPEC.md`, `SDK_AI_INSTALL.md`, `README.md`), landing page (`/docs/sdk/react-native`, navbar, `/llms.txt`, `/llms-full.txt`) e CI (`.github/workflows/ci.yml`).

---

## 3. User Stories

### US-011: Pacote `@testerswarm/react-native` com Autolinking Android e No-Op Multiplataforma
**Description:** As a React Native developer, I want to add `@testerswarm/react-native` and one manifest tag so my Android app reports closed-testing usage without touching JS/TS or breaking iOS builds.

**Acceptance Criteria:**
- [x] `packages/sdk-react-native/package.json` e `react-native.config.js` configurando apenas plataforma Android (`platforms.ios: null`)
- [x] `android/build.gradle`, `AndroidManifest.xml`, `TesterSwarmModule.kt` e `TesterSwarmPackage.kt` encapsulando `dev.testerswarm:sdk:1.0.0` com `minSdk >= 23`
- [x] `src/index.js` e `src/index.d.ts` expondo `TesterSwarm.status()` e `TesterSwarm.setEnabled(boolean)` seguros em iOS/Web/Node
- [x] `packages/sdk-android/.../TesterSwarm.kt` detectando `TesterSwarmPackage` no classpath e enviando `"wrapper": "react_native"` no handshake
- [x] Testes unitários (`pnpm test` via `node --test`) validando no-op multiplataforma, fallback de erros e delegação ao bridge Android

---

### US-012: Documentação AI-Ready, Landing Astro, Contratos e CI
**Description:** As a developer or AI coding assistant, I want consistent PRD, Spec, OpenAPI, `/docs/sdk/react-native`, `/llms.txt` and CI coverage for React Native equal to Flutter.

**Acceptance Criteria:**
- [x] `PRD.md`, `SPEC.md`, `SDK_AI_INSTALL.md`, `README.md`, `tasks/done/prd-testerswarm-mvp.md` e `tasks/prd-master.md` atualizados com React Native (Path C)
- [x] `packages/shared-contracts/openapi-v1.yaml` documentando `sdk.wrapper` (`flutter`, `react_native`)
- [x] `apps/landing` com página `/docs/sdk/react-native`, link na navbar e atualização em `/llms.txt`, `/llms-full.txt`, `/` e `/pt-br/`
- [x] `.github/workflows/ci.yml` executando `pnpm test` em `packages/sdk-react-native`

---

## 4. Functional Requirements

- **FR-1:** Instalação via `npm` / `pnpm` / `yarn` sem código JS/TS obrigatório para auto-init no Android.
- **FR-2:** `react-native.config.js` deve desabilitar vinculação nativa no iOS (`platforms.ios = null`).
- **FR-3:** `TesterSwarm.status()` deve resolver `'DISABLED'` fora do Android ou quando o módulo nativo não estiver linkado, sem lançar exceções.
- **FR-4:** O handshake `POST /sdk/v1/handshake` deve receber `"wrapper": "react_native"` quando `TesterSwarmPackage` estiver presente no app.

---

## 5. Non-Goals (Out of Scope)

- Suporte a Expo Go sem prebuild nativo (`npx expo prebuild --platform android` é necessário por causa do `AndroidManifest.xml` e `androidx.startup`).
- Rastreamento nativo em iOS / TestFlight.
