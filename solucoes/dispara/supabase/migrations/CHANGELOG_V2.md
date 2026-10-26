# Schema V2 Changelog

**Data**: 2026-01-22
**Arquivo**: `20260122100000_schema_init_v2.sql`

## Objetivo

Consolidar todas as otimizações de performance e correções de segurança aplicadas ao schema do Dispara em um único arquivo de migração atualizado.

---

## Mudanças Aplicadas

### 1. Novas Funções de Performance (Performance Optimizations)

Funções criadas para reduzir round-trips ao banco e melhorar performance de queries:

#### `get_campaign_contact_stats(p_campaign_id TEXT)`
- **Benefício**: Substitui 7 queries COUNT separadas por uma única query com agregação
- **Economia**: 6 round-trips por visualização de campanha
- **Retorna**: JSON com contadores (total, pending, sent, delivered, read, skipped, failed)

#### `get_contact_stats()`
- **Benefício**: Retorna estatísticas sem carregar todos os contatos
- **Economia**: 100% de memória (não carrega dados, apenas conta)
- **Retorna**: JSON com contadores (total, optIn, optOut)

#### `get_contact_tags()`
- **Benefício**: Extrai tags únicas diretamente no SQL
- **Economia**: Processa no banco, retorna apenas tags únicas
- **Retorna**: JSON array de tags ordenadas alfabeticamente

#### `get_campaigns_with_all_tags(p_tag_ids UUID[])`
- **Benefício**: Busca campanhas com TODAS as tags em uma única query
- **Economia**: Substitui N queries (uma por tag) por uma única query com GROUP BY/HAVING
- **Retorna**: Array de campaign_ids que possuem todas as tags especificadas

---

### 2. Correções de Search Path (Security Fix)

Todas as funções `SECURITY DEFINER` agora incluem `SET search_path = public` para prevenir ataques de injeção via search_path:

- `get_dashboard_stats()`
- `get_campaign_contact_stats(p_campaign_id TEXT)`
- `get_contact_stats()`
- `get_contact_tags()`
- `get_campaigns_with_all_tags(p_tag_ids UUID[])`
- `increment_campaign_stat(campaign_id_input TEXT, field TEXT)`
- `search_embeddings(...)` (função RAG pgvector)
- `update_campaign_dispatch_metrics()` (trigger function)

---

### 3. Novos Indexes de Foreign Keys

Indexes criados para melhorar performance de JOINs e operações CASCADE DELETE (identificados pelo Supabase Advisor):

```sql
-- campaign_contacts
CREATE INDEX idx_campaign_contacts_contact_id ON campaign_contacts(contact_id);

-- inbox_conversations
CREATE INDEX idx_inbox_conversations_ai_agent_id ON inbox_conversations(ai_agent_id);

-- inbox_conversation_labels
CREATE INDEX idx_inbox_conversation_labels_label_id ON inbox_conversation_labels(label_id);

-- whatsapp_status_events
CREATE INDEX idx_whatsapp_status_events_campaign_contact_id ON whatsapp_status_events(campaign_contact_id);
CREATE INDEX idx_whatsapp_status_events_campaign_id ON whatsapp_status_events(campaign_id);

-- workflows
CREATE INDEX idx_workflows_active_version_id ON workflows(active_version_id);
```

**Impacto**: Esses indexes são críticos para queries que fazem JOIN com essas FKs e para performance de DELETE CASCADE.

---

## Estrutura do Arquivo

O arquivo segue o mesmo padrão do `20251201000000_schema_init.sql`:

1. **PARTE 0**: Extensões (vector)
2. **PARTE 1**: Functions (11 funções)
3. **PARTE 2**: Tables - baseline (27 tabelas core)
4. **PARTE 3**: Tables - inbox/ai (9 tabelas inbox)
5. **PARTE 3.1**: Tables - attendant tokens (2 tabelas)
6. **PARTE 4**: Tables - campaign folders/tags (3 tabelas)
7. **PARTE 5**: Sequence defaults
8. **PARTE 6**: Primary keys
9. **PARTE 7**: Indexes (150+ indexes, incluindo 6 novos de FK)
10. **PARTE 8**: Triggers (5 triggers)
11. **PARTE 9**: Foreign keys (29 FKs)
12. **PARTE 10**: Check constraints (inbox)
13. **PARTE 11**: RLS policies
14. **PARTE 12**: Realtime publication
15. **PARTE 13**: Storage bucket
16. **PARTE 14**: Seed data (strategy prompts)

---

## Como Usar Este Schema

### Opção 1: Fresh Install (novo banco)
```bash
supabase db reset
# Irá executar todas as migrações incluindo esta
```

### Opção 2: Migração Incremental (banco existente)
```bash
# As migrações anteriores já foram aplicadas:
# - 20260122000000_performance_optimizations.sql
# - 20260122000001_add_missing_fk_indexes.sql
# - 20260122000002_fix_function_search_path.sql

# Este arquivo V2 é um snapshot consolidado para referência/documentação
# Não precisa ser aplicado se você já aplicou as 3 migrações acima
```

### Opção 3: Wizard/Onboarding (recomendado)
Use este arquivo como referência para gerar o schema inicial em novos ambientes (staging, produção, etc.).

---

## Métricas de Performance Esperadas

### Dashboard Stats
- **Antes**: 7 queries separadas (~70-100ms total)
- **Depois**: 1 query RPC (~15-20ms)
- **Economia**: ~75% de latência

### Contact Stats
- **Antes**: Carrega todos os contatos + filtra no frontend (~200-500ms)
- **Depois**: 1 query COUNT (~10-15ms)
- **Economia**: ~95% de latência + 100% de memória

### Campaign Tags Filter (AND logic)
- **Antes**: N queries paralelas + merge no frontend (~50-100ms por tag)
- **Depois**: 1 query GROUP BY/HAVING (~20-30ms total)
- **Economia**: ~80% de latência para 3+ tags

### FK Joins (geral)
- **Antes**: Full table scans em algumas queries
- **Depois**: Index seeks
- **Economia**: Variável, mas crítico para escala (10-100x em tabelas grandes)

---

## Validações Recomendadas

Após aplicar o schema:

1. **Verificar funções**:
   ```sql
   SELECT proname, prosecdef FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
   AND proname LIKE 'get_%';
   ```

2. **Verificar indexes de FK**:
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE schemaname = 'public'
   AND indexname LIKE 'idx_%_fk' OR indexname LIKE 'idx_%_id';
   ```

3. **Testar RPCs**:
   ```sql
   SELECT get_campaign_contact_stats('c_xxx');
   SELECT get_contact_stats();
   SELECT get_contact_tags();
   ```

---

## Breaking Changes

**Nenhum breaking change.** Todas as mudanças são aditivas (novas funções, novos indexes) ou correções internas (search_path).

---

## Referências

- Migração original: `20251201000000_schema_init.sql`
- Performance opts: `20260122000000_performance_optimizations.sql`
- FK indexes: `20260122000001_add_missing_fk_indexes.sql`
- Search path fix: `20260122000002_fix_function_search_path.sql`
