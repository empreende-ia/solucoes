# Arquitetura

Atualizado em 26/10/2026.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 18, TypeScript 5, Vite 5, React Router, TanStack Query |
| UI | Tailwind 3 com ponte de tokens do DS Empreende.IA V2, componentes Radix/shadcn adaptados, Manrope |
| Backend | Supabase: Postgres, Auth, PostgREST, RPCs e triggers |
| Testes | Vitest + Testing Library, Playwright com API de fixture, suíte SQL em PostgreSQL descartável |
| Hospedagem prevista | Vercel (SPA estática), configuração em `vercel.json` |

Não há servidor próprio nem Edge Functions ativas. Toda regra sensível fica no banco (RLS, constraints, triggers e RPCs `security definer` com checagem de papel).

## Estrutura do código

```
src/
  App.tsx              rotas (públicas: /, /reset-password; autenticadas: demais)
  pages/               uma página por módulo
  components/
    shell/, layout/    navegação lateral, cabeçalho, busca global, menu móvel
    commercial/        contatos, empresas, ficha 360
    pipeline/          quadro, cartões, regras de ganho/perda
    workday/           Hoje, fila de atenção, agenda, atividades
    operations/        financeiro, relatórios, automações, templates
    tours/, onboarding/, help/   orientação contextual
    ds/, brand/, ui/   design system e primitivas
  lib/                 regras de domínio puras e testadas (activity, deal, contact, operation, import, copilot-evidence)
  integrations/        cliente Supabase e tipos
supabase/
  migrations/          8 migrações ativas
  tests/               suítes SQL de segurança e integridade
tests/browser/         cenários Playwright com fixtures
docs/legacy/           código e migrações do sistema de origem, arquivados
```

## Modelo de dados

19 tabelas, todas com RLS e `organization_id`:

- **Identidade e acesso:** `organizations`, `profiles`, `user_roles`, `invitations`, `audit_logs`
- **Relacionamento:** `contacts`, `companies`
- **Comercial:** `pipelines`, `pipeline_stages`, `deals`, `deal_stage_history`
- **Rotina:** `activities`, `risk_rules`
- **Operação:** `payments`, `automations`, `automation_logs`, `email_templates`, `integration_configs`, `onboarding_progress`

Regras principais:

- Oportunidade referencia funil e etapa por ID; renomear etapa não quebra vínculos.
- Chaves estrangeiras compostas impedem vínculo entre organizações diferentes.
- E-mail de contato é único por organização (sem distinção de maiúsculas); ausência é permitida.
- Ganho exige responsável, perda exige motivo; probabilidade normaliza para 100/0.
- Autoria, identidade e cronologia de registros são imutáveis após a criação.
- Busca global via RPC parametrizada `search_crm`.
- Organização é criada após autenticação pelo RPC `create_workspace`; metadata de cadastro não concede permissão.

## Ambiente

| Item | Valor |
| --- | --- |
| Projeto Supabase | CRM Empreende IA, `ldahvopyqkdiecchukwz`, `sa-east-1`, organização HG - Aulas |
| Variáveis do frontend | `VITE_CRM_ENVIRONMENT`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPPORT_EMAIL` |
| Configuração local | `.env.local` (fora do Git), modelo em `.env.example` |

O build de produção (`bun run build:deploy`) falha se a configuração estiver ausente ou se uma chave privilegiada for usada.

## Repositórios

- Origem e desenvolvimento: [henriquegabriel-ia/crm-empreende-ia](https://github.com/henriquegabriel-ia/crm-empreende-ia)
- Cópia no guarda-chuva de soluções (sem histórico): [empreende-ia/solucoes](https://github.com/empreende-ia/solucoes), pasta `solucoes/crm-empreende-ia`
