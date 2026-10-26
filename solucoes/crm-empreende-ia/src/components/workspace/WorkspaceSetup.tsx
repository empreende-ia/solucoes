import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { crmDb } from '@/integrations/supabase/crm-client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Label } from '@/components/ui/label';
import Wordmark from '@/components/brand/Wordmark';
export function WorkspaceSetup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const invite = params.get("invite");
  const { refreshProfile,signOut } = useAuth();
  const [name,setName] = useState(''),[saving,setSaving] = useState(false),[error,setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    try { const result=invite ? await crmDb.rpc('accept_invitation',{p_invitation_id:invite}) : await crmDb.rpc('create_workspace',{p_name:name.trim()}); if(result.error) throw result.error; await refreshProfile(); navigate('/dashboard', { replace: true }); }
    catch { setError(invite ? 'Não foi possível aceitar. Confirme seu e-mail e verifique se o convite está válido e destinado à sua conta.' : 'Não foi possível criar o espaço. Seu nome foi preservado; tente novamente.'); }
    finally { setSaving(false); }
  }
  return <main className="eia-auth flex min-h-dvh items-center justify-center p-4"><div className="eia-auth-form-panel w-full max-w-lg space-y-6">
    <Wordmark variant="wordmark"/><div><h1 className="text-2xl font-semibold">{invite ? 'Entre na sua equipe' : 'Seu negócio, seu CRM'}</h1><p className="mt-2 text-muted-foreground">{invite ? 'Aceite o convite com a conta do e-mail convidado para acessar o CRM da equipe.' : 'Crie o espaço da sua equipe. Você poderá adaptar os funis ao seu processo, em qualquer segmento.'}</p></div>
    <form onSubmit={submit} className="space-y-4">{!invite && <div className="space-y-2"><Label htmlFor="workspace-name">Nome da organização</Label><Input id="workspace-name" value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={160} placeholder="Nome da sua empresa" disabled={saving}/></div>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" disabled={saving}>{saving?'Salvando…':invite?'Aceitar convite da equipe':'Criar espaço de trabalho'}</Button>
    </form><Button variant="ghost" onClick={()=>void signOut()}>Sair da conta</Button>
  </div></main>;
}
