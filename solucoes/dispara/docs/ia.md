# IA

Dois usos distintos: **agentes** que atendem no WhatsApp e **geração de conteúdo** para
templates e fluxos. Tudo sobre o Vercel AI SDK v6, com provedor e modelo escolhidos pelo
cliente (BYOK — a chave é dele).

## Provedores de LLM

`lib/ai/providers.ts`:

| Provedor | Modelos expostos |
| --- | --- |
| **Google (Gemini)** | Gemini 3 Flash Preview (padrão), 3 Pro Preview, 2.5 Pro, 2.5 Flash, 2.5 Flash Lite |
| **OpenAI (GPT)** | GPT-5.2 Pro, 5.2 Chat Latest, GPT-5, 5 Mini, 5 Nano |
| **Anthropic (Claude)** | Opus 4.5, Sonnet 4.5, Haiku 4.5 |

O padrão é Gemini Flash: rápido e barato, que é o que importa quando a resposta tem de sair
antes de o cliente desistir. A chave vem de `settings` (UI) ou da env `GEMINI_API_KEY`.

A fábrica de provedores (`lib/ai/provider-factory.ts`, `unified-ai-service.ts`) carrega o
pacote do provedor por **import dinâmico** — o bundle não carrega os três.

Falta de chave levanta `MissingAIKeyError`, tratada na UI como "configure a IA" em vez de
erro genérico.

## Agentes

Tabela `ai_agents`. Cada agente tem:

### Comportamento
| Campo | Papel |
| --- | --- |
| `system_prompt` | A instrução do agente |
| `model` · `temperature` · `max_tokens` | Configuração do LLM |
| `is_active` · `is_default` | Qual agente atende |
| `debounce_ms` | Espera antes de responder — agrupa mensagens picadas em uma resposta só |

O `debounce` resolve um problema real do WhatsApp: as pessoas mandam "oi", "tudo bem?",
"queria saber o preço" em três mensagens. Sem ele, o agente responde três vezes.

### RAG
| Campo | Papel |
| --- | --- |
| `embedding_provider` · `embedding_model` · `embedding_dimensions` | Geração dos vetores |
| `rag_similarity_threshold` | Piso de similaridade — abaixo dele, o trecho é descartado |
| `rag_max_results` | Quantos trechos entram no contexto |
| `rerank_enabled` · `rerank_provider` · `rerank_model` · `rerank_top_k` | Reordenação |

### Handoff
| Campo | Papel |
| --- | --- |
| `handoff_enabled` | Permite passar para humano |
| `handoff_instructions` | Quando passar |

O agente decide o handoff e o registra no log (`shouldHandoff`, `handoffReason`); a conversa
muda para modo `human` e aparece no inbox para alguém assumir.

### Permissões de ferramenta
| Campo | Papel |
| --- | --- |
| `allow_reactions` | Pode reagir à mensagem |
| `allow_quotes` | Pode citar uma mensagem anterior |
| `booking_tool_enabled` | Pode agendar no Google Calendar |

## RAG

### Embeddings

`lib/ai/embeddings.ts` — provedores: `google`, `openai`, `voyage`, `cohere`.

Padrão: `gemini-embedding-001`, **768 dimensões**. Os modelos da OpenAI
(`text-embedding-3-small`/`large`) são usados também em 768 para manter a coluna
compatível — trocar de provedor não exige reindexar o banco inteiro.

O chunking é próprio (`chunkText()`), com tamanho e sobreposição configuráveis.

### Armazenamento e busca

`ai_embeddings` com **pgvector**. A busca é a função SQL `search_embeddings()`, chamada por
`lib/ai/rag-store.ts`:

```
indexDocument()          → gera chunks, embeddings e grava
searchEmbeddings()       → similaridade de cosseno + limiar + top-k
deleteFileEmbeddings()   → remove ao excluir um arquivo
deleteAgentEmbeddings()  → remove ao excluir o agente
```

### Reranking

Opcional, com Cohere ou TogetherAI (`lib/ai/reranking.ts`). Entra quando o volume da base
faz a similaridade pura trazer ruído: busca N candidatos, reordena, mantém `rerank_top_k`.

### Base de conhecimento

`ai_knowledge_files` com status por arquivo: `pending` → `processing` → `completed` /
`failed`, mais `local_only` para arquivo guardado sem indexar. A UI mostra o status real em
vez de deixar o cliente achando que já está no ar.

OCR em `lib/ai/ocr/` para extrair texto de imagem e PDF.

## Ferramentas (tool calling)

`lib/ai/tools/`:

| Ferramenta | O que faz |
| --- | --- |
| `booking-tool.ts` | Consulta slots livres no Google Calendar e agenda |
| `template-reference.ts` | Consulta templates aprovados para citar o certo |
| `validate-utility.ts` | Valida se um template se sustenta como categoria UTILITY |

## O caminho de uma resposta

```
Webhook recebe a mensagem
    ↓
process_inbound_message()        — grava e deduplica (processed_inbound_messages)
    ↓
ai_processing_locks              — lock para não responder duas vezes
    ↓
debounce_ms                      — espera por mais mensagens do mesmo contato
    ↓
/api/ai/respond
    ├── search_embeddings()      — RAG, se habilitado
    ├── reranking                — se habilitado
    ├── Mem0                     — memória do contato, se configurado
    ├── tool calling             — booking, templates
    └── LLM
    ↓
Resposta enviada + ai_agent_logs
    └── handoff → conversa vira 'human' e sobe no inbox
```

## Memória de conversa (Mem0)

Com `MEM0_API_KEY`, o agente ganha memória de longo prazo por contato
(`@mem0/vercel-ai-provider`). As memórias são visíveis e editáveis no inbox
(`ContactMemoriesSheet`) e pela API (`/api/mem0/memories/[phone]`). Serve para o agente
lembrar na semana seguinte do que o cliente disse hoje.

## Observabilidade

### Logs próprios

`ai_agent_logs` grava por resposta: entrada, saída, tempo, modelo, tokens, **fontes do RAG
usadas**, sentimento, confiança, decisão de handoff e tool calls. Visível em
`/api/debug/ai-logs`.

### Helicone

Proxy de observabilidade de LLM (`@helicone/ai-sdk-provider`), configurável em
Configurações → IA. Dá custo por chamada, latência e cache do lado do provedor.

### AI DevTools

```bash
npm run dev:ai        # dev server com AI_DEVTOOLS=1
npm run ai:devtools   # painel do @ai-sdk/devtools
```

## Geração de conteúdo

| Rota | O que gera |
| --- | --- |
| `/api/ai/generate-utility-templates` | Templates de utilidade a partir de um briefing |
| `/api/ai/extract-content` | Conteúdo estruturado de uma URL |
| `/api/ai/generate-flow-form` | Formulário de MiniApp |
| `/api/ai/test-strategy` | Testa a estratégia de categoria do template |

Na UI: geração de um template e **geração em lote** (`BulkGenerationModal`), com preview
fiel antes de submeter à Meta.

Estratégias (`AIStrategy`): `marketing`, `utility`, `bypass`.

## Prompts

Em `lib/ai/prompts/`, versionados com o código — não no banco. Mudança de prompt é commit,
com diff e rollback.
