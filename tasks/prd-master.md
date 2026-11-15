# PRD Master Tracker — Tester Swarm

> Registro vivo dos PRDs, telas e pontos em aberto do projeto.

## PRDs

| Documento | Escopo | Status |
|---|---|---|
| [`done/prd-testerswarm-mvp.md`](./done/prd-testerswarm-mvp.md) | MVP completo (Contratos, Backend Supabase VPS, SDK Kotlin, Wrappers Flutter & React Native, Hub App, Landing Astro, CI) | Concluído |
| [`done/prd-react-native-wrapper.md`](./done/prd-react-native-wrapper.md) | Wrapper React Native (`@testerswarm/react-native`), autolinking Android, detecção `react_native`, docs AI-ready `/docs/sdk/react-native` e CI | Concluído |

## Screen Registry (App Hub Flutter)

| Rota | Tela | Feature | Status |
|---|---|---|---|
| `/onboarding` | Onboarding + Google Sign-In + Play Integrity | `auth` | Implementada |
| `/discover` | Featured (3 slots) + Recentes + Quase completos | `discover` | Implementada |
| `/c/:id` | Detalhe da campanha | `campaign_detail` | Implementada |
| `/c/:id/join` | Stepper 4 passos de inscrição | `enrollment` | Implementada |
| `/tests` | Meus testes (calendário 14 dias + feedback) | `enrollment` | Implementada |
| `/wallet` | Carteira (disponível, pendente, expiração 360d, extrato) | `wallet` | Implementada |
| `/apps` | Meus apps + modal `/apps/new` | `my_apps` | Implementada |
| `/apps/:id` | Detalhe do app, validação SDK, publicar, relatório Play | `my_apps` | Implementada |
| `/apps/:id/featured` | Reserva e compra de slot Featured | `featured` | Implementada |
| `/settings` | Idioma, lembrete 19h, reputação, Reddit r/AndroidAppTesters, excluir conta | `settings` | Implementada |

## Open Questions

| ID | Descrição | Default adotado na implementação |
|---|---|---|
| **OQ-9** | Preços finais Featured (24h/72h/7d) | Configuráveis no banco; referência `US$ 4,99 / 11,99 / 24,99` |
| **OQ-18** | Nome definitivo e domínio | Placeholders `Tester Swarm` / `dev.testerswarm` / `testerswarm.dev` |
| **TQ-1..10** | Escolhas técnicas secundárias | Defaults do `SPEC.md §15` |
