# Configuração governada da agente

## Fluxo

`Configurações → Agente` é a única interface de configuração. O usuário edita um
rascunho com autosave; o runtime lê exclusivamente `agent_versions`, pela referência
`agents.published_version_id`. O prompt é compilado de forma determinística e permanece
somente leitura na experiência comum.

O ciclo é: configurar → revisar → testar → publicar → observar → revisar sugestões.
Um fio condutor no topo da área da agente mostra em qual passo do ciclo o workspace
está (Configurar → Testar → Publicar/No ar), com os mesmos critérios dos cards da
Visão geral.

O prompt compilado é gerado também no navegador, pelo mesmo módulo puro usado nas
Edge Functions: a aba "Prompt e comportamento" atualiza a cada edição, oferece diff
contra a versão ativa e uma conferência sob demanda com o servidor. O artefato
autoritativo continua sendo o do backend, na avaliação e na publicação.

Conflito de edição não descarta nada sozinho: a pessoa continua digitando localmente
e escolhe entre manter as próprias alterações (adota a revisão do servidor e salva por
cima) ou usar a versão da outra sessão.

## Configuração assistida

O caminho recomendado começa com perguntas e funciona sem upload. O usuário pode
combinar respostas, modelo editável do segmento, até seis URLs específicas e até oito
arquivos PDF/DOCX/TXT/CSV/XLSX. A IA devolve uma proposta por seção; identidade,
processo comercial, comportamento e fatos continuam editáveis na revisão “Foi isso que
entendemos”. Fatos críticos começam pendentes e só ficam ativos após confirmação humana.

O estado do assistente (respostas, marcações, materiais extraídos, proposta e
decisões) persiste em sessionStorage por agente: fechar o modal não perde nada e
reabrir retoma do mesmo passo. Campos aceitam marcações estruturadas ("não sei",
"responder depois", "IA pode sugerir", "depende de outra pessoa") que seguem para a
IA sem sobrescrever o texto digitado. A leitura das URLs é uma etapa separada
(`read_sources`), com status por página antes de consumir créditos, e a geração tem
progresso em etapas e cancelamento. Aplicar a proposta acontece em dois passos
visíveis (rascunho → conhecimento); a gravação de conhecimento é deduplicada, então
repetir após uma falha parcial não duplica fatos, documentos nem perguntas.

Arquivos são extraídos no navegador e enviados como texto limitado. A Edge Function
busca URLs públicas com proteção contra SSRF, usa o rascunho lido no servidor e trata o
conteúdo das fontes como dados não confiáveis. A mesma fonte recebe fingerprint para que
uma repetição do fluxo não duplique a ingestão.

## Segurança da publicação

- Uma rodada de avaliação guarda agente, rascunho, revisão, configuração, compilador e modelo.
- A publicação exige a rodada concluída da revisão atual.
- Alertas do compilador aparecem listados no card de publicação antes do clique; o
  aceite só é exibido quando existem alertas. O servidor revalida na publicação.
- Rodada aberta por aba fechada pode ser retomada (executa só os casos restantes) ou
  descartada na hora, sem esperar a expiração de 15 minutos; o runner executa 4 casos
  simultâneos e aceita cancelamento, que descarta a rodada.
- Falha crítica, instabilidade ou falha técnica bloqueiam.
- Alertas exigem aceite explícito do usuário autorizado.
- A publicação cria uma versão imutável e um evento de auditoria.
- Restaurar apenas copia uma versão para o rascunho; exige nova avaliação e publicação.

## Ações

Agendamento e handoff são expostos pelo snapshot publicado. Criação, alteração,
cancelamento e transferência exigem evidência literal de confirmação do lead. As ações
são idempotentes e auditadas em `agent_action_runs`. O opt-out é uma regra fixa da
plataforma: pausa a conversa e registra o contato. Simulador e avaliação usam os mesmos
contratos, mas executores sem escrita.

## Aprendizado assistido

`prompt-insights` resolve o workspace pelo usuário autenticado, limita as conversas aos
owners do tenant, redige e-mail/telefone/documento e persiste sugestões deduplicadas.
Sugestões começam em `pending`. Fatos sugeridos entram inativos como `needs_review`;
regras só entram no rascunho após clique humano; testes sugeridos viram novas situações.

## Métricas e privacidade

Eventos do assistente registram início, etapa visitada, proposta gerada, aplicação e
abandono na trilha append-only. O painel avançado combina esses eventos com versões,
avaliações, sugestões e eventos de runtime para mostrar adoção, bloqueios, restaurações,
tempo até a primeira publicação, falhas de ferramenta e latência p50/p95. Metadados de
produto são limitados e não incluem respostas, documentos ou dados pessoais do lead.

## Ordem de deploy atômico

As migrations de 14h a 22h devem ser aplicadas junto do código que as
consome. A ordem é:

1. `20260801140000_workspace_knowledge_governance.sql`
2. `20260801150000_agent_action_governance.sql`
3. `20260801160000_evaluation_governance.sql`
4. `20260801170000_assisted_learning.sql`
5. `20260801180000_lead_state_observability.sql`
6. `20260801190000_knowledge_ingestion_idempotency.sql`
7. `20260801200000_agent_operation_rate_limits.sql`
8. `20260801210000_knowledge_atomic_writes.sql`
9. `20260801220000_agent_product_metrics.sql`
10. Deploy de `agent-setup-assistant`, `lara-orchestrator`, `lara-simulator`,
   `lara-eval`, `agent-configuration`, `analyze-conversation`, `health-check`,
   `validate-setup`, `initialize-system` e `prompt-insights`. A varredura da fila é
   feita pelos jobs `pg_cron` (`lara-orchestrator-sweep`, `send-queue-sweep`), que leem
   URL e chave do Vault — não existe function de gatilho separada.

Não aplique uma migration isoladamente antes de o frontend e as Edge Functions desta
branch estarem prontos para entrar juntos.

## Verificação

- `bun run test` (Vitest, 22 suítes)
- `bun run build`
- `npx tsc --noEmit`
- `deno check` nas Edge Functions alteradas
- SQL transacional com rollback em `supabase/tests/`

Os testes SQL cobrem editor, observador, isolamento de workspace, escrita exclusiva do
backend, conflitos de agenda, publicação governada, revisão de sugestões,
observabilidade imutável, rate limits, telemetria de produto e escrita transacional e
deduplicada de conhecimento.
