-- Builder novo (Fase A): coluna para a árvore canônica do fluxo (Flow, schemaVersion 1).
-- A árvore é a fonte de verdade do editor; nodes/edges continuam sendo o formato
-- compilado consumido pelo executor (lib/builder/flow/compile.ts).
alter table public.workflow_versions add column if not exists tree jsonb;

comment on column public.workflow_versions.tree is
  'Árvore canônica do builder novo (lib/builder/flow/types.ts, schemaVersion 1). nodes/edges são derivados via compileFlow().';
