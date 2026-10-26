-- Defesa em profundidade para ambientes onde os privilégios padrão do
-- Supabase concedem escrita em novas tabelas ao papel authenticated.
-- Configuração, versões e auditoria só podem sofrer mutação pelas RPCs
-- SECURITY DEFINER criadas na migration de fundação.

REVOKE ALL ON public.workspaces, public.workspace_members, public.agents,
    public.agent_drafts, public.agent_versions, public.agent_audit_log
    FROM anon, authenticated;

GRANT SELECT ON public.workspaces, public.workspace_members, public.agents,
    public.agent_drafts, public.agent_versions, public.agent_audit_log
    TO authenticated;

-- Estas duas entidades administrativas continuam mutáveis diretamente, mas
-- somente quando suas políticas RLS de administrador aprovarem a operação.
GRANT UPDATE ON public.workspaces TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;

GRANT ALL ON public.workspaces, public.workspace_members, public.agents,
    public.agent_drafts, public.agent_versions, public.agent_audit_log
    TO service_role;
