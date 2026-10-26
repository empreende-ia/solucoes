# Workflows

Automação visual: um gatilho, uma árvore de passos, waits que sobrevivem a deploy. O
executor é próprio (DAG em memória) e os waits são persistidos no Postgres — não há QStash,
Temporal nem worker.

## Dois modelos no código

Existem duas representações do mesmo fluxo:

| Camada | Arquivos | Papel |
| --- | --- | --- |
| **Flow** (autoria) | `lib/builder/flow/` | O que o builder edita: árvore de `Step` com branches |
| **Workflow** (execução) | `lib/builder/workflow-executor.workflow.ts` | O grafo compilado que o executor roda |

`lib/builder/flow/compile.ts` compila Flow → Workflow; `layout.ts` cuida do posicionamento
no canvas (com dagre).

## Gatilhos

```typescript
FlowTriggerType = 'none' | 'keywords' | 'campaign_reply'
```

| Gatilho | Quando dispara |
| --- | --- |
| `keywords` | Mensagem recebida que casa com as palavras-chave |
| `campaign_reply` | Resposta a uma campanha específica |
| `none` | Nunca pelo webhook — só por `enroll` manual/API ou webhook próprio |

O trigger é **sempre** emitido no grafo compilado; "sem gatilho" vira `triggerType: "None"`,
e o webhook simplesmente não o casa. Há também o gatilho por **webhook de entrada**
(`/api/builder/workflows/[id]/webhook`), que inscreve quem chegar pela URL.

## Tipos de passo

```typescript
StepType =
  | 'whatsapp'     // envio (mensagem, template, mídia)
  | 'interactive'  // botões, lista, pergunta
  | 'wait'         // delay durável
  | 'condition'    // ramifica por campo/operador/valor
  | 'split'        // ramifica por porcentagem (teste A/B de fluxo)
  | 'tag'          // adiciona tag
  | 'tag_remove'   // remove tag
  | 'pipeline'     // move no CRM
  | 'goto'         // salta para outro passo
  | 'end'          // encerra
```

### Branches

Cada passo tem branches tipadas. Algumas são **fixas e não removíveis** (`locked`):
`None`, `Not Delivered`, `Timeout` — o caminho do erro é parte do desenho, não um
esquecimento opcional. Um `split` exige que as porcentagens somem 100.

## Ações (steps de integração)

Registradas em `lib/builder/plugins.ts`, implementadas em `lib/builder/steps/`:

### WhatsApp
| Ação | O que faz |
| --- | --- |
| `whatsapp/send-message` | Texto, com ou sem preview de URL |
| `whatsapp/ask-question` | Pergunta e salva a resposta numa variável |
| `whatsapp/send-template` | Template com parâmetros posicionais ou nomeados |
| `whatsapp/send-media` | Imagem, vídeo, áudio, documento, sticker (URL ou media ID) |
| `whatsapp/send-buttons` | Botões de resposta rápida |
| `whatsapp/send-list` | Lista de seções |

O destinatário de cada ação é **"da mensagem recebida"** ou um **número manual**.

### Contatos
`contacts/add-tag` · `contacts/remove-tag`

### CRM
`crm/move-pipeline`

### Infra
`condition` · `http-request` · `credentials` · `trigger`

O passo **Database Query foi removido** no hardening de outubro de 2026 (dava SQL
arbitrário a quem editasse um fluxo), e `actionType` passou a ter allowlist — fluxo salvo
com ação fora da lista é recusado.

`http-request` tem proteção contra SSRF: endereço interno e metadata de nuvem são
bloqueados.

Expressões e condições são avaliadas com CEL (`@marcbachmann/cel-js`), validadas por
`condition-validator.ts`. O avaliador não usa `new Function` (era RCE), tem limite de
tamanho antes das regex e as condições do grafo são revalidadas no PATCH, no create, no
publish e no rollback — não só na edição.

## Waits duráveis

Um delay não pode segurar uma função serverless. Então:

1. O executor chega num passo `wait` e **sinaliza pausa** em vez de dormir.
2. `persistDelayWait()` grava em `workflow_enrollments` o `resume_at` e onde parou.
3. A invocação termina normalmente.
4. O pg_cron bate em `/api/cron/tick`, que chama `drainWorkflowEnrollments()`.
5. `claimDueEnrollments()` pega por **CAS** os enrollments com `resume_at` vencido.
6. O executor retoma do ponto exato.

Um delay de 3 dias custa zero enquanto espera e sobrevive a redeploy.

### Robustez

| Função | Papel |
| --- | --- |
| `claimDueEnrollments()` | Claim atômico — duas invocações não retomam o mesmo |
| `reapStuckEnrollments()` | Devolve à fila o que travou no meio |
| `backoffEnrollment()` | Backoff exponencial em erro transitório |
| `rescheduleEnrollment()` | Reagenda (ex.: fora da janela de horário) |
| `completeEnrollment()` / `failEnrollment()` | Fecha com sucesso ou falha |
| `MAX_ENROLLMENT_ATTEMPTS = 5` | Teto de tentativas antes de falhar de vez |

## Settings do workflow

Em `workflows.settings` (jsonb), lidos pelo webhook, pelo `enroll` e pelo executor:

| Setting | Efeito |
| --- | --- |
| `allowReentry` | Permite reinscrever quem já passou pelo fluxo. Afeta `/enroll` em lote e o matcher de `campaign_reply` |
| `stopOnResponse` | Se o contato responder, o webhook **cancela os waits de delay** pendentes — ninguém recebe o follow-up depois de já ter respondido |
| `timeWindow` | Janela de horário. Fora dela o executor **pausa os passos de comunicação** (`whatsapp/*`) e reagenda; passos internos (tag, condição, CRM) seguem rodando |

Timezone padrão: `America/Sao_Paulo`.

## Versionamento

| Rota | O que faz |
| --- | --- |
| `/publish` | Publica a versão corrente (grava em `workflow_versions`) |
| `/versions` | Histórico |
| `/rollback` | Volta para uma versão anterior |
| `/duplicate` | Clona o fluxo |
| `/code` · `/download` | Exporta a definição |

Editar não afeta quem está no meio do fluxo — a execução segue na versão em que entrou.

## Execução e observabilidade

| Tabela | Conteúdo |
| --- | --- |
| `workflow_runs` / `workflow_run_logs` | Execuções e log passo a passo |
| `workflow_builder_executions` / `workflow_builder_logs` | Execuções disparadas do builder |
| `workflow_conversations` | Estado da conversa dentro do fluxo (variáveis, passo atual) |
| `workflow_enrollments` | Waits pendentes |

Métricas agregadas em `/api/builder/workflows/metrics`; status e logs de uma execução em
`/api/builder/workflows/executions/[id]/status` e `/logs`.

## Criando um step novo

1. Implemente o handler em `lib/builder/steps/<integração>/<slug>.ts`, exportando a função
   de step (contrato em `step-handler.ts`).
2. Registre a ação em `lib/builder/plugins.ts`: `id`, `integration`, `slug`, `label`, os
   campos do formulário e `stepImportPath` / `stepFunction`.
3. Adicione o import dinâmico em `STEP_IMPORTERS` de `lib/builder/step-registry.ts`.

O registry resolve por `id`, `slug`, `label` ou `integration/slug` — fluxos antigos não
quebram quando o identificador muda de forma.
