# CRM Empreende IA

CRM comercial para qualquer segmento, com contatos, empresas, oportunidades e atividades. A interface segue o Design System Empreende.IA V2: Manrope, identidade oficial, temas claro/escuro, componentes acessíveis e orientação contextual.

## O que está implementado

- Hoje com tarefas, compromissos e fila de atenção baseada em regras configuráveis.
- Contatos e empresas com ficha 360, histórico, próxima ação, filtros e visões salvas.
- Funis configuráveis, oportunidades por ID, movimentação acessível, ganho/perda e histórico.
- Agenda, atividades e tarefas sobre os mesmos registros, com responsáveis e prazos.
- Financeiro comercial e relatórios que distinguem recebimento, valor de oportunidades e previsão ponderada.
- Automações de criação de tarefas a partir de eventos de oportunidades, com ativação revisada e logs.
- Templates de rascunhos, importação/exportação CSV e exportação de reuniões por ICS.
- Equipe, convites por link, papéis, auditoria e configuração inicial baseada em dados reais.
- Oito tours com pausa, retomada, replay, preferências e isolamento por conta/organização.
- Copiloto de rotina com fontes e revisão de sugestões. A análise atual usa regras verificáveis; nenhum modelo externo de IA está conectado.

O ambiente exclusivo está conectado ao projeto **CRM Empreende IA** (`ldahvopyqkdiecchukwz`), na organização **HG - Aulas**, região São Paulo. As oito migrações estão aplicadas, com RLS nas 19 tabelas. Auth e PostgREST passaram por 105 verificações com contas fictícias de duas organizações. Consulte [a validação remota e seus limites](docs/QA-CRM-SUPABASE.md).

O aceite técnico local está concluído, incluindo fluxos comerciais, recuperação de erros, permissões e tours. Publicação e piloto com participantes são etapas posteriores. [Evidências do aceite](docs/EXECUCAO-CRM.md).

## Desenvolvimento

```bash
bun install --frozen-lockfile
cp .env.example .env.local
# Preencha somente com as credenciais públicas do projeto exclusivo do CRM.
bun run dev
```

Variáveis:

- `VITE_CRM_ENVIRONMENT=dedicated`
- `VITE_SUPABASE_URL`: URL do novo projeto.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave `sb_publishable_…` ou JWT público `anon`.
- `VITE_SUPPORT_EMAIL`: destino opcional de suporte.

Sem configuração, a tela de acesso informa a pendência e não faz chamadas ao banco anterior. O build rejeita configurações inválidas e chaves privilegiadas. Nunca coloque `service_role`, chaves `sb_secret_` ou credenciais de provedores em variáveis `VITE_`.

## Banco independente

As migrações ativas ficam em `supabase/migrations`. Elas criam o modelo comercial, RLS por organização, permissões, vínculos compostos, RPCs e histórico. A criação de uma organização ocorre após autenticação, pelo fluxo `create_workspace`; nome e metadata de cadastro não concedem permissões.

Para testar toda a cadeia em um PostgreSQL descartável, instale PostgreSQL 17 e Python 3 e execute:

```bash
./scripts/test-database.sh
```

O script inicia um cluster temporário restrito a `127.0.0.1`, aplica todas as migrações, testa permissões e regras, e remove o cluster ao terminar. Nunca aponte `local-bootstrap.sql` para um banco remoto.

O projeto remoto foi criado vazio, sem importar dados do sistema anterior. As versões das migrações locais correspondem ao histórico remoto. Arquivos em `docs/legacy` estão arquivados e não devem ser implantados.

Para acesso compartilhado, ainda é preciso definir a URL do frontend e conferir os redirecionamentos de autenticação e a entrega de e-mails. O login por senha de contas confirmadas já foi validado. A configuração `.env.local` fica fora do Git.

## Validação

```bash
bunx tsc --noEmit -p tsconfig.app.json
bun run lint
bun run test
bun run build
bunx playwright test
```

O Playwright inicia um servidor de teste independente na porta configurada em `playwright.config.ts`, intercepta a API com fixtures e não usa dados ou credenciais reais. Screenshots e relatório ficam em `/tmp/crm-qa`.

## Documentação

- [Contrato do Design System](DESIGN.md)
- [Plano aprovado de produto e UX](docs/PLANO-CRM.md)
- [Execução, decisões e pendências](docs/EXECUCAO-CRM.md)
- [Validação do Supabase real](docs/QA-CRM-SUPABASE.md)
- [Roteiro do primeiro piloto](docs/PILOTO-CRM.md)
- [Configuração de publicação preparada](docs/PUBLICACAO-CRM.md)
- [Tours e âncoras](src/components/tours/README.md)
- [Configuração inicial](src/components/onboarding/README.md)

## Licença

Proprietário — todos os direitos reservados. Manrope mantém a licença OFL em `public/fonts/Manrope-OFL.txt`.
