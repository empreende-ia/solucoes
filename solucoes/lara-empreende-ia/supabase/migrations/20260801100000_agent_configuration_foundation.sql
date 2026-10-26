-- Fundação da configuração estruturada do agente.
--
-- Esta migration cria a fronteira de workspace, separa rascunho de versão
-- publicada e concentra as mutações sensíveis em funções transacionais.
-- O prompt legado é preservado somente como dado de migração até o compilador
-- determinístico da Fase 2 assumir a geração do artefato publicado.

CREATE TYPE public.workspace_member_role AS ENUM ('admin', 'editor', 'observer');

CREATE TABLE public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'archived')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.workspace_member_role NOT NULL DEFAULT 'observer',
    can_publish_agent BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'invited', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
);

CREATE INDEX workspace_members_user_idx
    ON public.workspace_members (user_id, status);

-- As funções de autorização são SECURITY DEFINER para não recursarem nas
-- próprias políticas de workspace_members.
CREATE OR REPLACE FUNCTION public.is_workspace_member(
    _workspace_id UUID,
    _user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = _workspace_id
          AND wm.user_id = _user_id
          AND wm.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_agent(
    _workspace_id UUID,
    _user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = _workspace_id
          AND wm.user_id = _user_id
          AND wm.status = 'active'
          AND wm.role IN ('admin', 'editor')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(
    _workspace_id UUID,
    _user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = _workspace_id
          AND wm.user_id = _user_id
          AND wm.status = 'active'
          AND wm.role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_publish_agent(
    _workspace_id UUID,
    _user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = _workspace_id
          AND wm.user_id = _user_id
          AND wm.status = 'active'
          AND (wm.role = 'admin' OR wm.can_publish_agent)
    );
$$;

-- O estado atual é migrado para um workspace inicial. Isso não atribui dados a
-- workspaces novos silenciosamente; novos workspaces serão criados pelo fluxo
-- explícito de administração em uma fase posterior.
DO $$
DECLARE
    initial_workspace_id UUID;
    initial_workspace_name TEXT;
    initial_admin_id UUID;
BEGIN
    SELECT ur.user_id
      INTO initial_admin_id
      FROM public.user_roles ur
     WHERE ur.role = 'admin'
     ORDER BY ur.created_at
     LIMIT 1;

    SELECT COALESCE(NULLIF(trim(ns.company_name), ''), 'Empreende.IA')
      INTO initial_workspace_name
      FROM public.lara_settings ns
     ORDER BY ns.updated_at DESC
     LIMIT 1;

    INSERT INTO public.workspaces (name, slug, created_by)
    VALUES (COALESCE(initial_workspace_name, 'Empreende.IA'), 'default', initial_admin_id)
    RETURNING id INTO initial_workspace_id;

    INSERT INTO public.workspace_members (
        workspace_id,
        user_id,
        role,
        can_publish_agent,
        status
    )
    SELECT
        initial_workspace_id,
        users.id,
        CASE
            WHEN EXISTS (
                SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = users.id AND ur.role = 'admin'
            ) THEN 'admin'::public.workspace_member_role
            ELSE 'editor'::public.workspace_member_role
        END,
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = users.id AND ur.role = 'admin'
        ),
        'active'
    FROM auth.users AS users
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
END;
$$;

CREATE TABLE public.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL UNIQUE
        REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    name TEXT NOT NULL DEFAULT 'Lara',
    status TEXT NOT NULL DEFAULT 'configuring'
        CHECK (status IN ('configuring', 'active', 'attention', 'blocked', 'archived')),
    published_version_id UUID,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    agent_id UUID NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE RESTRICT,
    config JSONB NOT NULL DEFAULT '{"schemaVersion":1}'::jsonb,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    base_version_id UUID,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(config) = 'object'),
    CHECK (COALESCE((config ->> 'schemaVersion')::INTEGER, 0) = 1)
);

CREATE TABLE public.agent_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    config JSONB NOT NULL,
    compiled_prompt TEXT NOT NULL,
    checksum TEXT NOT NULL,
    label TEXT,
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'onboarding', 'restoration', 'migration')),
    evaluation_run_id UUID REFERENCES public.eval_runs(id) ON DELETE SET NULL,
    accepted_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    restored_from_version_id UUID REFERENCES public.agent_versions(id) ON DELETE RESTRICT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_id, version_number),
    CHECK (jsonb_typeof(config) = 'object'),
    CHECK (jsonb_typeof(accepted_warnings) = 'array')
);

ALTER TABLE public.agents
    ADD CONSTRAINT agents_published_version_fk
    FOREIGN KEY (published_version_id)
    REFERENCES public.agent_versions(id)
    ON DELETE RESTRICT;

ALTER TABLE public.agent_drafts
    ADD CONSTRAINT agent_drafts_base_version_fk
    FOREIGN KEY (base_version_id)
    REFERENCES public.agent_versions(id)
    ON DELETE RESTRICT;

CREATE INDEX agent_versions_agent_created_idx
    ON public.agent_versions (agent_id, created_at DESC);
CREATE INDEX agent_versions_workspace_idx
    ON public.agent_versions (workspace_id, created_at DESC);

CREATE TABLE public.agent_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    agent_id UUID REFERENCES public.agents(id) ON DELETE RESTRICT,
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX agent_audit_workspace_created_idx
    ON public.agent_audit_log (workspace_id, created_at DESC);
CREATE INDEX agent_audit_agent_created_idx
    ON public.agent_audit_log (agent_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.audit_workspace_membership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    membership public.workspace_members;
BEGIN
    membership := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

    INSERT INTO public.agent_audit_log (
        workspace_id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        membership.workspace_id,
        auth.uid(),
        CASE TG_OP
            WHEN 'INSERT' THEN 'workspace.member_added'
            WHEN 'UPDATE' THEN 'workspace.member_updated'
            ELSE 'workspace.member_removed'
        END,
        'workspace_member',
        membership.id,
        jsonb_build_object(
            'targetUserId', membership.user_id,
            'role', membership.role,
            'canPublishAgent', membership.can_publish_agent,
            'status', membership.status
        )
    );

    RETURN membership;
END;
$$;

CREATE TRIGGER audit_workspace_membership_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.workspace_members
    FOR EACH ROW EXECUTE FUNCTION public.audit_workspace_membership_change();

-- Migra o agente e o prompt atualmente publicados. O prompt bruto fica dentro
-- de migration.legacyPrompt apenas até a Fase 2 compilar toda a configuração.
INSERT INTO public.agents (workspace_id, name, status, created_by, updated_by)
SELECT
    w.id,
    COALESCE(NULLIF(trim(ns.sdr_name), ''), 'Lara'),
    CASE
        WHEN NULLIF(trim(ns.system_prompt_override), '') IS NULL THEN 'configuring'
        ELSE 'active'
    END,
    admin_member.user_id,
    admin_member.user_id
FROM public.workspaces w
LEFT JOIN LATERAL (
    SELECT n.sdr_name, n.system_prompt_override
    FROM public.lara_settings n
    ORDER BY n.updated_at DESC
    LIMIT 1
) ns ON true
LEFT JOIN LATERAL (
    SELECT wm.user_id
    FROM public.workspace_members wm
    WHERE wm.workspace_id = w.id AND wm.role = 'admin'
    ORDER BY wm.created_at
    LIMIT 1
) admin_member ON true;

-- Preserva o histórico já existente antes de criar o snapshot corrente.
WITH ranked_prompt_versions AS (
    SELECT
        pv.*,
        row_number() OVER (ORDER BY pv.created_at, pv.id)::INTEGER AS version_number
    FROM public.prompt_versions pv
)
INSERT INTO public.agent_versions (
    workspace_id,
    agent_id,
    version_number,
    config,
    compiled_prompt,
    checksum,
    label,
    source,
    evaluation_run_id,
    created_by,
    published_at,
    created_at
)
SELECT
    a.workspace_id,
    a.id,
    pv.version_number,
    jsonb_build_object(
        'schemaVersion', 1,
        'identity', jsonb_build_object(
            'agentName', a.name,
            'companyName', COALESCE(NULLIF(trim(ns.company_name), ''), '')
        ),
        'migration', jsonb_build_object(
            'legacyPrompt', pv.content,
            'legacyBlocks', pv.blocks
        )
    ),
    pv.content,
    md5(
        jsonb_build_object(
            'schemaVersion', 1,
            'identity', jsonb_build_object(
                'agentName', a.name,
                'companyName', COALESCE(NULLIF(trim(ns.company_name), ''), '')
            ),
            'migration', jsonb_build_object(
                'legacyPrompt', pv.content,
                'legacyBlocks', pv.blocks
            )
        )::text || E'\n' || pv.content
    ),
    pv.label,
    CASE
        WHEN pv.source = 'onboarding' THEN 'onboarding'
        WHEN pv.source = 'restauracao' THEN 'restoration'
        ELSE 'manual'
    END,
    pv.eval_run_id,
    pv.created_by,
    pv.created_at,
    pv.created_at
FROM public.agents a
CROSS JOIN ranked_prompt_versions pv
LEFT JOIN LATERAL (
    SELECT n.company_name
    FROM public.lara_settings n
    ORDER BY n.updated_at DESC
    LIMIT 1
) ns ON true;

-- Se o prompt em produção não estava no histórico, cria um snapshot explícito
-- para que o ponteiro publicado preserve exatamente o comportamento atual.
INSERT INTO public.agent_versions (
    workspace_id,
    agent_id,
    version_number,
    config,
    compiled_prompt,
    checksum,
    label,
    source,
    created_by
)
SELECT
    a.workspace_id,
    a.id,
    COALESCE((
        SELECT MAX(existing.version_number)
        FROM public.agent_versions existing
        WHERE existing.agent_id = a.id
    ), 0) + 1,
    jsonb_build_object(
        'schemaVersion', 1,
        'identity', jsonb_build_object(
            'agentName', a.name,
            'companyName', COALESCE(NULLIF(trim(ns.company_name), ''), '')
        ),
        'migration', jsonb_build_object('legacyPrompt', ns.system_prompt_override)
    ),
    ns.system_prompt_override,
    md5(
        jsonb_build_object(
            'schemaVersion', 1,
            'identity', jsonb_build_object(
                'agentName', a.name,
                'companyName', COALESCE(NULLIF(trim(ns.company_name), ''), '')
            ),
            'migration', jsonb_build_object('legacyPrompt', ns.system_prompt_override)
        )::text || E'\n' || ns.system_prompt_override
    ),
    'Configuração existente',
    'migration',
    a.created_by
FROM public.agents a
CROSS JOIN LATERAL (
    SELECT n.company_name, n.system_prompt_override
    FROM public.lara_settings n
    WHERE NULLIF(trim(n.system_prompt_override), '') IS NOT NULL
    ORDER BY n.updated_at DESC
    LIMIT 1
) ns
WHERE NOT EXISTS (
    SELECT 1
    FROM public.agent_versions existing
    WHERE existing.agent_id = a.id
      AND existing.compiled_prompt = ns.system_prompt_override
);

UPDATE public.agents a
SET published_version_id = (
        SELECT v.id
        FROM public.agent_versions v
        CROSS JOIN LATERAL (
            SELECT n.system_prompt_override
            FROM public.lara_settings n
            WHERE NULLIF(trim(n.system_prompt_override), '') IS NOT NULL
            ORDER BY n.updated_at DESC
            LIMIT 1
        ) ns
        WHERE v.agent_id = a.id
          AND v.compiled_prompt = ns.system_prompt_override
        ORDER BY v.version_number DESC
        LIMIT 1
    ),
    updated_at = now()
WHERE EXISTS (
    SELECT 1
    FROM public.agent_versions v
    CROSS JOIN LATERAL (
        SELECT n.system_prompt_override
        FROM public.lara_settings n
        WHERE NULLIF(trim(n.system_prompt_override), '') IS NOT NULL
        ORDER BY n.updated_at DESC
        LIMIT 1
    ) ns
    WHERE v.agent_id = a.id
      AND v.compiled_prompt = ns.system_prompt_override
);

INSERT INTO public.agent_drafts (
    workspace_id,
    agent_id,
    config,
    revision,
    base_version_id,
    created_by,
    updated_by
)
SELECT
    a.workspace_id,
    a.id,
    COALESCE(
        v.config,
        jsonb_build_object(
            'schemaVersion', 1,
            'identity', jsonb_build_object(
                'agentName', a.name,
                'companyName', COALESCE(NULLIF(trim(ns.company_name), ''), '')
            )
        )
    ),
    1,
    v.id,
    a.created_by,
    a.updated_by
FROM public.agents a
LEFT JOIN public.agent_versions v ON v.id = a.published_version_id
LEFT JOIN LATERAL (
    SELECT n.company_name
    FROM public.lara_settings n
    ORDER BY n.updated_at DESC
    LIMIT 1
) ns ON true;

INSERT INTO public.agent_audit_log (
    workspace_id,
    agent_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
)
SELECT
    a.workspace_id,
    a.id,
    a.created_by,
    'agent.migrated',
    'agent',
    a.id,
    jsonb_build_object(
        'publishedVersionId', a.published_version_id,
        'source', 'lara_settings'
    )
FROM public.agents a;

-- Histórico e auditoria são append-only inclusive para o service role. Novas
-- versões são criadas; nunca corrigidas ou apagadas retroativamente.
CREATE OR REPLACE FUNCTION public.prevent_immutable_agent_record_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER agent_versions_are_immutable
    BEFORE UPDATE OR DELETE ON public.agent_versions
    FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_agent_record_mutation();

CREATE TRIGGER agent_audit_log_is_immutable
    BEFORE UPDATE OR DELETE ON public.agent_audit_log
    FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_agent_record_mutation();

CREATE TRIGGER update_workspaces_updated_at
    BEFORE UPDATE ON public.workspaces
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workspace_members_updated_at
    BEFORE UPDATE ON public.workspace_members
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON public.agents
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_drafts_updated_at
    BEFORE UPDATE ON public.agent_drafts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their workspaces"
    ON public.workspaces FOR SELECT TO authenticated
    USING (public.is_workspace_member(id));
CREATE POLICY "Workspace admins can update their workspace"
    ON public.workspaces FOR UPDATE TO authenticated
    USING (public.is_workspace_admin(id))
    WITH CHECK (public.is_workspace_admin(id));

CREATE POLICY "Members can read workspace memberships"
    ON public.workspace_members FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR public.is_workspace_admin(workspace_id)
    );
CREATE POLICY "Workspace admins can manage memberships"
    ON public.workspace_members FOR ALL TO authenticated
    USING (public.is_workspace_admin(workspace_id))
    WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "Members can read agents"
    ON public.agents FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members can read agent drafts"
    ON public.agent_drafts FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members can read agent versions"
    ON public.agent_versions FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members can read agent audit"
    ON public.agent_audit_log FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- Nenhuma tabela de configuração aceita INSERT/UPDATE/DELETE direto do cliente.
-- As funções abaixo aplicam autorização, lock e auditoria atomicamente.
REVOKE ALL ON public.workspaces, public.workspace_members, public.agents,
    public.agent_drafts, public.agent_versions, public.agent_audit_log
    FROM anon, authenticated;

GRANT SELECT ON public.workspaces, public.workspace_members, public.agents,
    public.agent_drafts, public.agent_versions, public.agent_audit_log
    TO authenticated;
GRANT UPDATE ON public.workspaces TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspaces, public.workspace_members, public.agents,
    public.agent_drafts, public.agent_versions, public.agent_audit_log
    TO service_role;

CREATE OR REPLACE FUNCTION public.get_current_agent_context()
RETURNS TABLE (
    workspace_id UUID,
    workspace_name TEXT,
    member_role public.workspace_member_role,
    can_publish BOOLEAN,
    agent_id UUID,
    agent_name TEXT,
    agent_status TEXT,
    published_version_id UUID,
    draft_id UUID,
    draft_config JSONB,
    draft_revision INTEGER,
    base_version_id UUID,
    draft_updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        w.id,
        w.name,
        wm.role,
        (wm.role = 'admin' OR wm.can_publish_agent),
        a.id,
        a.name,
        a.status,
        a.published_version_id,
        d.id,
        d.config,
        d.revision,
        d.base_version_id,
        d.updated_at
    FROM public.workspace_members wm
    JOIN public.workspaces w
      ON w.id = wm.workspace_id AND w.status = 'active'
    JOIN public.agents a
      ON a.workspace_id = w.id AND a.status <> 'archived'
    JOIN public.agent_drafts d
      ON d.agent_id = a.id
    WHERE wm.user_id = auth.uid()
      AND wm.status = 'active'
    ORDER BY wm.created_at
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.save_agent_draft(
    _agent_id UUID,
    _config JSONB,
    _expected_revision INTEGER
)
RETURNS public.agent_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_draft public.agent_drafts;
    saved_draft public.agent_drafts;
    target_workspace_id UUID;
BEGIN
    SELECT a.workspace_id
      INTO target_workspace_id
      FROM public.agents a
     WHERE a.id = _agent_id;

    IF target_workspace_id IS NULL OR NOT public.can_edit_agent(target_workspace_id) THEN
        RAISE EXCEPTION 'Sem permissão para editar este agente'
            USING ERRCODE = '42501';
    END IF;

    IF jsonb_typeof(_config) <> 'object'
       OR COALESCE((_config ->> 'schemaVersion')::INTEGER, 0) <> 1 THEN
        RAISE EXCEPTION 'Configuração do agente inválida'
            USING ERRCODE = '22023';
    END IF;

    SELECT d.*
      INTO current_draft
      FROM public.agent_drafts d
     WHERE d.agent_id = _agent_id
     FOR UPDATE;

    IF current_draft.id IS NULL THEN
        RAISE EXCEPTION 'Rascunho do agente não encontrado'
            USING ERRCODE = 'P0002';
    END IF;

    IF current_draft.revision <> _expected_revision THEN
        RAISE EXCEPTION 'Rascunho alterado por outra sessão; recarregue antes de salvar'
            USING ERRCODE = '40001',
                  DETAIL = format('expected=%s actual=%s', _expected_revision, current_draft.revision);
    END IF;

    UPDATE public.agent_drafts
       SET config = _config,
           revision = revision + 1,
           updated_by = auth.uid(),
           updated_at = now()
     WHERE id = current_draft.id
     RETURNING * INTO saved_draft;

    INSERT INTO public.agent_audit_log (
        workspace_id, agent_id, actor_user_id, action, entity_type, entity_id, metadata
    ) VALUES (
        target_workspace_id,
        _agent_id,
        auth.uid(),
        'agent.draft_saved',
        'agent_draft',
        saved_draft.id,
        jsonb_build_object(
            'previousRevision', current_draft.revision,
            'revision', saved_draft.revision
        )
    );

    RETURN saved_draft;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_agent_draft(
    _agent_id UUID,
    _expected_revision INTEGER,
    _evaluation_run_id UUID DEFAULT NULL,
    _label TEXT DEFAULT NULL,
    _accepted_warnings JSONB DEFAULT '[]'::jsonb
)
RETURNS public.agent_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_agent public.agents;
    current_draft public.agent_drafts;
    current_version public.agent_versions;
    new_version public.agent_versions;
    next_version_number INTEGER;
    prompt_artifact TEXT;
BEGIN
    SELECT a.*
      INTO target_agent
      FROM public.agents a
     WHERE a.id = _agent_id
     FOR UPDATE;

    IF target_agent.id IS NULL OR NOT public.can_publish_agent(target_agent.workspace_id) THEN
        RAISE EXCEPTION 'Sem permissão para publicar este agente'
            USING ERRCODE = '42501';
    END IF;

    IF jsonb_typeof(_accepted_warnings) <> 'array' THEN
        RAISE EXCEPTION 'Alertas aceitos devem ser uma lista'
            USING ERRCODE = '22023';
    END IF;

    SELECT d.*
      INTO current_draft
      FROM public.agent_drafts d
     WHERE d.agent_id = _agent_id
     FOR UPDATE;

    IF current_draft.id IS NULL OR current_draft.revision <> _expected_revision THEN
        RAISE EXCEPTION 'O rascunho mudou antes da publicação'
            USING ERRCODE = '40001';
    END IF;

    IF target_agent.published_version_id IS NOT NULL THEN
        SELECT v.* INTO current_version
        FROM public.agent_versions v
        WHERE v.id = target_agent.published_version_id;
    END IF;

    -- Compatibilidade temporária da Fase 1. Na Fase 2 este valor será sempre
    -- produzido pelo compilador determinístico a partir do config estruturado.
    prompt_artifact := COALESCE(
        NULLIF(current_draft.config #>> '{migration,legacyPrompt}', ''),
        current_version.compiled_prompt
    );

    IF prompt_artifact IS NULL THEN
        RAISE EXCEPTION 'O compilador de prompt ainda não gerou um artefato para este rascunho'
            USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(MAX(v.version_number), 0) + 1
      INTO next_version_number
      FROM public.agent_versions v
     WHERE v.agent_id = _agent_id;

    INSERT INTO public.agent_versions (
        workspace_id,
        agent_id,
        version_number,
        config,
        compiled_prompt,
        checksum,
        label,
        source,
        evaluation_run_id,
        accepted_warnings,
        restored_from_version_id,
        created_by
    ) VALUES (
        target_agent.workspace_id,
        _agent_id,
        next_version_number,
        current_draft.config,
        prompt_artifact,
        md5(current_draft.config::text || E'\n' || prompt_artifact),
        NULLIF(trim(_label), ''),
        CASE
            WHEN current_draft.base_version_id IS DISTINCT FROM target_agent.published_version_id
                THEN 'restoration'
            ELSE 'manual'
        END,
        _evaluation_run_id,
        _accepted_warnings,
        CASE
            WHEN current_draft.base_version_id IS DISTINCT FROM target_agent.published_version_id
                THEN current_draft.base_version_id
            ELSE NULL
        END,
        auth.uid()
    ) RETURNING * INTO new_version;

    UPDATE public.agents
       SET published_version_id = new_version.id,
           status = 'active',
           name = COALESCE(
               NULLIF(trim(current_draft.config #>> '{identity,agentName}'), ''),
               name
           ),
           updated_by = auth.uid(),
           updated_at = now()
     WHERE id = _agent_id;

    UPDATE public.agent_drafts
       SET base_version_id = new_version.id,
           updated_by = auth.uid(),
           updated_at = now()
     WHERE id = current_draft.id;

    INSERT INTO public.agent_audit_log (
        workspace_id, agent_id, actor_user_id, action, entity_type, entity_id, metadata
    ) VALUES (
        target_agent.workspace_id,
        _agent_id,
        auth.uid(),
        'agent.published',
        'agent_version',
        new_version.id,
        jsonb_build_object(
            'versionNumber', new_version.version_number,
            'revision', current_draft.revision,
            'evaluationRunId', _evaluation_run_id,
            'acceptedWarnings', _accepted_warnings,
            'evaluationGate', 'pending_phase_6'
        )
    );

    RETURN new_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_agent_version_to_draft(
    _agent_id UUID,
    _version_id UUID,
    _expected_revision INTEGER
)
RETURNS public.agent_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_workspace_id UUID;
    source_version public.agent_versions;
    current_draft public.agent_drafts;
    restored_draft public.agent_drafts;
BEGIN
    SELECT a.workspace_id
      INTO target_workspace_id
      FROM public.agents a
     WHERE a.id = _agent_id;

    IF target_workspace_id IS NULL OR NOT public.can_edit_agent(target_workspace_id) THEN
        RAISE EXCEPTION 'Sem permissão para restaurar este agente'
            USING ERRCODE = '42501';
    END IF;

    SELECT v.*
      INTO source_version
      FROM public.agent_versions v
     WHERE v.id = _version_id
       AND v.agent_id = _agent_id;

    IF source_version.id IS NULL THEN
        RAISE EXCEPTION 'Versão não encontrada para este agente'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT d.*
      INTO current_draft
      FROM public.agent_drafts d
     WHERE d.agent_id = _agent_id
     FOR UPDATE;

    IF current_draft.id IS NULL OR current_draft.revision <> _expected_revision THEN
        RAISE EXCEPTION 'O rascunho mudou antes da restauração'
            USING ERRCODE = '40001';
    END IF;

    UPDATE public.agent_drafts
       SET config = source_version.config,
           base_version_id = source_version.id,
           revision = revision + 1,
           updated_by = auth.uid(),
           updated_at = now()
     WHERE id = current_draft.id
     RETURNING * INTO restored_draft;

    INSERT INTO public.agent_audit_log (
        workspace_id, agent_id, actor_user_id, action, entity_type, entity_id, metadata
    ) VALUES (
        target_workspace_id,
        _agent_id,
        auth.uid(),
        'agent.version_restored_to_draft',
        'agent_version',
        source_version.id,
        jsonb_build_object(
            'restoredFromVersion', source_version.version_number,
            'draftRevision', restored_draft.revision
        )
    );

    RETURN restored_draft;
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_agent_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_agent_draft(UUID, JSONB, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_agent_draft(UUID, INTEGER, UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_agent_version_to_draft(UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_workspace_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_workspace_admin(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_agent(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_publish_agent(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_current_agent_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_agent_draft(UUID, JSONB, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_agent_draft(UUID, INTEGER, UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_agent_version_to_draft(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_agent(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_publish_agent(UUID, UUID) TO authenticated, service_role;
