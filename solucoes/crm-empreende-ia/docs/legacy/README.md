# Referência técnica arquivada

Estes arquivos pertencem ao código-base anterior e estão fora da aplicação ativa, do build, dos testes de produto e do deploy do Supabase. Não executar suas migrações ou funções no novo projeto.

- `source-migrations`: esquema e alterações do sistema anterior, preservados apenas para consulta técnica.
- `source-functions`: funções anteriores, desconectadas do ambiente novo.
- `source-ui`: telas clínicas e componentes que não fazem parte do CRM comercial.

O CRM da Empreende IA usa somente `supabase/migrations/20260906*` para provisionar sua base comercial, com tipos em `src/integrations/supabase/commercial-types.ts`. Nenhum dado clínico foi convertido ou importado.
