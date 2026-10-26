-- =============================================================================
-- Paridade GHL: settings de workflow, listas de contatos (smart lists) e
-- CRM (pipelines > etapas > oportunidades).
--
-- 1. workflows.settings — configurações estilo GHL (allowReentry,
--    stopOnResponse, timeWindow) lidas pelo runtime (webhook/executor/enroll).
-- 2. contact_lists — filtros salvos (membros dinâmicos, como Smart List do GHL).
-- 3. pipelines/pipeline_stages/opportunities — modelo CRM mínimo: opportunity
--    pertence a 1 pipeline + 1 etapa, tem status open|won|lost|abandoned,
--    valor monetário e contato vinculado (contato pode ter várias).
-- =============================================================================

ALTER TABLE public.workflows
    ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE TABLE IF NOT EXISTS public.contact_lists (
    id text DEFAULT concat('cl_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    name text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT contact_lists_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.pipelines (
    id text DEFAULT concat('pl_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    name text NOT NULL,
    position integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT pipelines_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
    id text DEFAULT concat('pls_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    pipeline_id text NOT NULL,
    name text NOT NULL,
    position integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id),
    CONSTRAINT pipeline_stages_pipeline_fkey FOREIGN KEY (pipeline_id)
        REFERENCES public.pipelines(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline
    ON public.pipeline_stages (pipeline_id, position);

CREATE TABLE IF NOT EXISTS public.opportunities (
    id text DEFAULT concat('op_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    pipeline_id text NOT NULL,
    stage_id text NOT NULL,
    contact_id text,
    phone text,
    name text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    value numeric(14,2),
    source text,
    stage_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT opportunities_pkey PRIMARY KEY (id),
    CONSTRAINT opportunities_status_check CHECK (status IN ('open', 'won', 'lost', 'abandoned')),
    CONSTRAINT opportunities_pipeline_fkey FOREIGN KEY (pipeline_id)
        REFERENCES public.pipelines(id) ON DELETE CASCADE,
    CONSTRAINT opportunities_stage_fkey FOREIGN KEY (stage_id)
        REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    CONSTRAINT opportunities_contact_fkey FOREIGN KEY (contact_id)
        REFERENCES public.contacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_opportunities_pipeline_stage
    ON public.opportunities (pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_contact
    ON public.opportunities (contact_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_phone
    ON public.opportunities (phone);

-- RLS habilitado como nas demais tabelas (service_role bypassa; sem policy anon).
ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
