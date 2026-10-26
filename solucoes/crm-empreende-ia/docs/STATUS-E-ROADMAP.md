# Status e roadmap

Atualizado em 26/10/2026.

## Status

| Frente | Situação |
| --- | --- |
| Produto (fases 0 a 5 do [plano](PLANO-CRM.md)) | Implementado e com aceite técnico local em 06/09/2026 |
| Banco Supabase exclusivo | Provisionado, 8 migrações aplicadas, RLS nas 19 tabelas, 105 verificações reais |
| Testes automatizados | 190 Vitest, 149 verificações SQL, 72 cenários Playwright no catálogo |
| Publicação (Vercel) | Configuração pronta; sem projeto nem URL |
| Auth em produção | Login por senha validado; Site URL, redirects e SMTP pendentes |
| Piloto com usuários | Roteiro pronto em [PILOTO-CRM.md](PILOTO-CRM.md); nenhuma sessão realizada |

Evidências completas: [EXECUCAO-CRM.md](EXECUCAO-CRM.md), [QA-CRM-SUPABASE.md](QA-CRM-SUPABASE.md), [QA-CRM-BROWSER.md](QA-CRM-BROWSER.md).

## Próximos passos

### 1. Colocar no ar

- [ ] Criar o projeto na Vercel e configurar as variáveis `VITE_*` ([PUBLICACAO-CRM.md](PUBLICACAO-CRM.md))
- [ ] Executar o aceite na URL: rotas diretas, login, criação do espaço, fluxo comercial completo
- [ ] Definir domínio

### 2. Acesso e e-mails

- [ ] Configurar Site URL e redirects do Supabase para a URL publicada
- [ ] Configurar SMTP e remetente; testar confirmação, convite e recuperação de senha
- [ ] Definir `VITE_SUPPORT_EMAIL`

### 3. Piloto

- [ ] Rodar o roteiro com participantes reais (dono, colaborador, leitura)
- [ ] Revisar tours, ajuda e textos a partir das dificuldades observadas
- [ ] Decidir sobre instrumentação de eventos de uso

### 4. Evoluções de produto

- [ ] Conectar modelo de IA ao Copiloto (provedor, custo e política de dados a definir)
- [ ] Integração de WhatsApp e e-mail (envio e registro automático)
- [ ] Sincronização contínua de agenda Google/Outlook
- [ ] Reduzir o bundle principal (~715 kB) com divisão de código

### Dívidas conhecidas

- Nove avisos de ESLint (Fast Refresh) em componentes compartilhados.
- Aviso de chunk acima de 500 kB no build.
- `PLANO-CRM.md` contém links para o diretório de trabalho original; o código citado agora está em `docs/legacy`.

## Material comercial

Apresentação para clientes: [apresentacao/crm-empreende-ia.pdf](apresentacao/crm-empreende-ia.pdf) (fonte em `apresentacao/index.html`).
