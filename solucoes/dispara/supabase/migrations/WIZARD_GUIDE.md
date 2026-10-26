# Guia de Schema para Wizard de Onboarding

## Visão Geral

O arquivo `00000000000000_init.sql` contém o schema completo e atualizado do Dispara, incluindo:
- 38 tabelas (campaigns, contacts, inbox, workflows, etc.)
- 13 funções (incluindo 4 RPCs de performance)
- 100 indexes (incluindo indexes de FK)
- 29 foreign keys
- 9 triggers
- Seed data (strategy prompts)

---

## Quick Start para Wizard

### Passo 1: Criar Database Connection

```typescript
// lib/wizard/database-setup.ts
import { createClient } from '@supabase/supabase-js'

export async function setupDatabase(credentials: {
  supabaseUrl: string
  supabaseKey: string
}) {
  const supabase = createClient(credentials.supabaseUrl, credentials.supabaseKey)

  // Verificar conexão
  const { error } = await supabase.from('settings').select('key').limit(1)
  if (error) throw new Error('Falha ao conectar ao banco: ' + error.message)

  return supabase
}
```

### Passo 2: Aplicar Schema (via Supabase CLI)

```bash
# 1. Inicializar Supabase no projeto do usuário
supabase init

# 2. Copiar arquivo de schema para o projeto
cp 00000000000000_init.sql ./supabase/migrations/

# 3. Conectar ao projeto Supabase do usuário
supabase link --project-ref <USER_PROJECT_REF>

# 4. Aplicar migração
supabase db push
```

### Passo 3: Verificar Schema Aplicado

```typescript
// lib/wizard/schema-validator.ts
export async function validateSchema(supabase: SupabaseClient) {
  const checks = {
    tables: await checkTables(supabase),
    functions: await checkFunctions(supabase),
    indexes: await checkIndexes(supabase),
    rls: await checkRLS(supabase)
  }

  return checks
}

async function checkTables(supabase: SupabaseClient) {
  const requiredTables = [
    'campaigns', 'contacts', 'templates', 'flows',
    'inbox_conversations', 'ai_agents', 'campaign_folders'
  ]

  const { data, error } = await supabase
    .rpc('exec_sql', {
      query: `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN (${requiredTables.map(t => `'${t}'`).join(',')})
      `
    })

  return {
    ok: data?.length === requiredTables.length,
    found: data?.length || 0,
    expected: requiredTables.length
  }
}

async function checkFunctions(supabase: SupabaseClient) {
  const requiredFunctions = [
    'get_campaign_contact_stats',
    'get_contact_stats',
    'get_contact_tags',
    'get_campaigns_with_all_tags'
  ]

  const { data } = await supabase
    .rpc('exec_sql', {
      query: `
        SELECT proname
        FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
        AND proname IN (${requiredFunctions.map(f => `'${f}'`).join(',')})
      `
    })

  return {
    ok: data?.length === requiredFunctions.length,
    found: data?.length || 0,
    expected: requiredFunctions.length
  }
}
```

---

## Configurações Essenciais Pós-Migração

### 1. WhatsApp Credentials

```typescript
// Inserir credenciais do WhatsApp na tabela settings
await supabase.from('settings').upsert([
  { key: 'WHATSAPP_TOKEN', value: userProvidedToken },
  { key: 'WHATSAPP_PHONE_ID', value: userProvidedPhoneId },
  { key: 'WHATSAPP_BUSINESS_ACCOUNT_ID', value: userProvidedWabaId }
])
```

### 2. Default AI Agent

```typescript
// Criar agente de IA padrão
await supabase.from('ai_agents').insert({
  name: 'Agente Principal',
  system_prompt: 'Você é um assistente útil...',
  model: 'gemini-2.5-flash',
  is_default: true,
  is_active: true
})
```

### 3. Storage Bucket

O schema já cria o bucket `wa-template-media`, mas verifique se foi criado:

```typescript
const { data: buckets } = await supabase.storage.listBuckets()
const hasMediaBucket = buckets?.some(b => b.name === 'wa-template-media')

if (!hasMediaBucket) {
  await supabase.storage.createBucket('wa-template-media', {
    public: true,
    fileSizeLimit: 52428800 // 50MB
  })
}
```

---

## Fluxo Completo do Wizard

```typescript
// app/wizard/setup/page.tsx
export default function WizardSetupPage() {
  const [step, setStep] = useState(1)
  const [status, setStatus] = useState<WizardStatus>('pending')

  const steps = [
    {
      id: 1,
      title: 'Credenciais Supabase',
      action: async (data) => {
        const supabase = await setupDatabase(data)
        return { supabase }
      }
    },
    {
      id: 2,
      title: 'Aplicar Schema',
      action: async ({ supabase }) => {
        // Via API ou CLI (depende da estratégia)
        await applySchema(supabase)
        return { supabase }
      }
    },
    {
      id: 3,
      title: 'Validar Schema',
      action: async ({ supabase }) => {
        const validation = await validateSchema(supabase)
        if (!validation.tables.ok) {
          throw new Error('Tabelas faltando')
        }
        return { supabase, validation }
      }
    },
    {
      id: 4,
      title: 'Configurar WhatsApp',
      action: async ({ supabase, ...data }) => {
        await configureWhatsApp(supabase, data.whatsappCreds)
        return { supabase }
      }
    },
    {
      id: 5,
      title: 'Criar AI Agent',
      action: async ({ supabase }) => {
        await createDefaultAIAgent(supabase)
        return { supabase }
      }
    },
    {
      id: 6,
      title: 'Finalizar',
      action: async ({ supabase }) => {
        // Marcar wizard como completo
        await supabase.from('settings').upsert({
          key: 'wizard_completed',
          value: 'true'
        })
        return { success: true }
      }
    }
  ]

  return <WizardUI steps={steps} currentStep={step} />
}
```

---

## Troubleshooting

### Erro: "relation does not exist"

**Causa**: Schema não foi aplicado corretamente

**Solução**:
```bash
# Verificar migrations aplicadas
supabase migration list

# Re-aplicar se necessário
supabase db reset
```

### Erro: "function does not exist"

**Causa**: Funções não foram criadas

**Solução**:
```sql
-- Verificar se funções existem
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND proname LIKE 'get_%';

-- Se vazio, aplicar novamente a migration
```

### Performance lenta em queries

**Causa**: Indexes não foram criados corretamente

**Solução**:
```sql
-- Verificar indexes
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Se faltando, re-aplicar o schema init
```

---

## Checklist de Validação Final

Antes de liberar o usuário para usar o sistema:

- [ ] Todas as tabelas criadas (38 tabelas)
- [ ] Funções criadas (13 funções)
- [ ] Indexes criados (100 indexes)
- [ ] RLS policies ativas
- [ ] Realtime habilitado para inbox
- [ ] Storage bucket criado
- [ ] Strategy prompts inseridos (3 prompts)
- [ ] Credenciais WhatsApp configuradas
- [ ] AI Agent padrão criado
- [ ] Wizard marcado como completo

---

## Exemplo de UI de Progresso

```typescript
// components/wizard/SchemaProgressBar.tsx
export function SchemaProgressBar({ validation }) {
  const progress = {
    tables: validation.tables.found / validation.tables.expected * 100,
    functions: validation.functions.found / validation.functions.expected * 100,
    indexes: validation.indexes.found / validation.indexes.expected * 100,
    rls: validation.rls.enabled ? 100 : 0
  }

  const overallProgress = Object.values(progress).reduce((a, b) => a + b) / 4

  return (
    <div>
      <h3>Progresso do Schema: {overallProgress.toFixed(0)}%</h3>

      <ProgressItem
        label="Tabelas"
        value={progress.tables}
        current={validation.tables.found}
        total={validation.tables.expected}
      />

      <ProgressItem
        label="Funções"
        value={progress.functions}
        current={validation.functions.found}
        total={validation.functions.expected}
      />

      {/* ... */}
    </div>
  )
}
```

---

## Recursos Adicionais

- **Schema consolidado**: `00000000000000_init.sql`
- **Backup de migrations anteriores**: `_backup/` (não comitado)
- **Supabase Docs**: https://supabase.com/docs/guides/cli
- **pgvector Docs**: https://github.com/pgvector/pgvector
