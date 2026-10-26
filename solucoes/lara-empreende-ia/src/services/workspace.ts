import { supabase } from '@/integrations/supabase/client';

/**
 * Workspace ativo do usuário logado.
 *
 * A resposta é memoizada porque toda escrita governada precisa do id e ele não
 * muda dentro de uma sessão. Uma falha limpa o cache para que a próxima chamada
 * tente de novo em vez de repetir o erro indefinidamente.
 */
let workspacePromise: Promise<string> | null = null;

export async function currentWorkspaceId(): Promise<string> {
  if (!workspacePromise) {
    workspacePromise = (async () => {
      const { data, error } = await (supabase as any).rpc('current_workspace_id');
      if (error) throw error;
      const value = Array.isArray(data) ? data[0] : data;
      if (!value) throw new Error('Workspace não encontrado para o usuário atual.');
      return String(value);
    })().catch((error: unknown) => {
      workspacePromise = null;
      throw error;
    });
  }
  return workspacePromise;
}
