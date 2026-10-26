import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  UserPlus,
  Search,
  Loader2,
  X,
  Check,
  Copy,
  Edit2,
  Users,
  Settings,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Button } from './Button';
import { Badge } from '@/components/ui/badge';
import { api } from '../services/api';
import { TeamMember, type Team as TeamType, type TeamFunction } from '../types';
import { supabase } from '@/integrations/supabase/client';
import TeamConfigModal from './TeamConfigModal';
import { toast } from 'sonner';
import {
  isCurrentUserAdmin,
  listAccessInvites,
  revokeAccessInvite,
  sendAccessInvite,
  workspaceRoleForTeamRole,
  WORKSPACE_ROLE_HINT,
  WORKSPACE_ROLE_LABEL,
  type AccessInvite,
  type WorkspaceRole,
} from '../services/team';
import { useAuth } from '@/hooks/useAuth';

const WORKSPACE_ROLE_OPTIONS: WorkspaceRole[] = ['observer', 'editor', 'admin'];

function formatInviteDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const Team: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<TeamType[]>([]);
  const [functions, setFunctions] = useState<TeamFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    role: 'agent',
    team_id: '',
    function_id: '',
    weight: 1
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    role: 'agent',
    status: 'invited' as 'active' | 'invited' | 'disabled',
    team_id: '',
    function_id: '',
    weight: 1
  });
  const [canPublishAgent, setCanPublishAgent] = useState(false);

  // --- Acesso ao workspace ------------------------------------------------
  // O cadastro público está fechado: a única entrada é o convite, que grava a
  // allowlist e cria a conta pela Admin API (edge function team-invite).
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [invites, setInvites] = useState<AccessInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState<{
    email: string;
    name: string;
    workspaceRole: WorkspaceRole;
    canPublish: boolean;
  }>({ email: '', name: '', workspaceRole: 'observer', canPublish: false });
  const [sendingInvite, setSendingInvite] = useState(false);
  const [revokingEmail, setRevokingEmail] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<{ email: string; link: string; message: string } | null>(null);
  const inviteEmailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAllData();
    const cleanup = setupRealtime();
    return cleanup;
  }, []);

  const loadInvites = useCallback(async () => {
    setInvitesLoading(true);
    setInvitesError(null);
    try {
      setInvites(await listAccessInvites());
    } catch (error) {
      setInvitesError(error instanceof Error ? error.message : 'Não foi possível carregar os convites.');
    } finally {
      setInvitesLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const admin = await isCurrentUserAdmin(user?.id);
      if (cancelled) return;
      setIsAdmin(admin);
      if (admin) {
        await loadInvites();
      } else {
        setInvitesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loadInvites]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [membersData, teamsData, functionsData] = await Promise.all([
        api.fetchTeam(),
        api.fetchTeams(),
        api.fetchTeamFunctions()
      ]);
      setMembers(membersData);
      setTeams(teamsData as TeamType[]);
      setFunctions(functionsData as TeamFunction[]);
    } catch (error) {
      console.error("Erro ao carregar dados da equipe", error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtime = () => {
    const channel = supabase
      .channel('team-members-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, () => {
        loadAllData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  // Quando o projeto não tem SMTP, ou quando a pessoa já tem conta, o convite
  // volta como link. Guardar esse link na tela é o que evita o convite fantasma.
  const applyInviteResult = (result: Awaited<ReturnType<typeof sendAccessInvite>>) => {
    setManualLink(
      result.actionLink
        ? { email: result.email, link: result.actionLink, message: result.message }
        : null
    );
    toast.success(result.message);
  };

  // O convite acontece antes do cadastro na escala operacional: se o acesso não
  // sair, ninguém entra, e criar a linha em team_members só repetiria a promessa
  // vazia de antes ("membro convidado" para uma pessoa que nunca recebeu nada).
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingInvite(true);

    try {
      const workspaceRole = workspaceRoleForTeamRole(formData.role);
      const result = await sendAccessInvite({
        email: formData.email,
        name: formData.name,
        workspaceRole,
        canPublishAgent: workspaceRole === 'admin' ? true : canPublishAgent,
      });

      try {
        await api.createTeamMember({
          name: formData.name,
          email: formData.email,
          role: formData.role as 'agent' | 'admin' | 'manager',
          team_id: formData.team_id || undefined,
          function_id: formData.function_id || undefined,
          weight: formData.weight
        });
      } catch (rosterError) {
        // O acesso já foi criado; a escala é a parte reversível.
        console.error('Convite enviado, mas o cadastro na escala falhou:', rosterError);
        toast.error('Acesso liberado, mas o cadastro na escala falhou. Refaça pela tabela.');
      }

      applyInviteResult(result);
      setShowModal(false);
      setCanPublishAgent(false);
      setFormData({ name: '', email: '', role: 'agent', team_id: '', function_id: '', weight: 1 });
      await Promise.all([loadAllData(), loadInvites()]);
    } catch (error) {
      console.error('Erro ao convidar membro:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao convidar membro.');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingInvite(true);
    try {
      const result = await sendAccessInvite({
        email: inviteForm.email,
        name: inviteForm.name || undefined,
        workspaceRole: inviteForm.workspaceRole,
        canPublishAgent: inviteForm.workspaceRole === 'admin' ? true : inviteForm.canPublish,
      });
      applyInviteResult(result);
      setInviteForm({ email: '', name: '', workspaceRole: 'observer', canPublish: false });
      await loadInvites();
    } catch (error) {
      console.error('Erro ao enviar convite:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o convite.');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleRevokeInvite = async (invite: AccessInvite) => {
    const aviso = invite.accepted
      ? `Revogar o acesso de ${invite.email}? A pessoa perde a entrada no workspace.`
      : `Cancelar o convite de ${invite.email}?`;
    if (!confirm(aviso)) return;

    setRevokingEmail(invite.email);
    try {
      const result = await revokeAccessInvite(invite.email);
      toast.success(
        result.accessesDisabled > 0
          ? 'Convite revogado e acesso desativado.'
          : 'Convite revogado.'
      );
      if (manualLink?.email === invite.email) setManualLink(null);
      await loadInvites();
    } catch (error) {
      console.error('Erro ao revogar convite:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível revogar o convite.');
    } finally {
      setRevokingEmail(null);
    }
  };

  const copyManualLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie na mão.');
    }
  };

  const handleUpdateMember = async (id: string, field: string, value: any) => {
    try {
      await api.updateTeamMember(id, { [field]: value });
      toast.success('Membro atualizado com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar membro:', error);
      toast.error('Erro ao atualizar membro');
    }
  };

  const handleDeleteMember = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir ${name}?`)) return;
    try {
      await api.deleteTeamMember(id);
      toast.success('Membro removido com sucesso');
      await loadAllData();
    } catch (error) {
      console.error('Erro ao remover membro:', error);
      toast.error('Erro ao remover membro');
    }
  };

  const handleEditClick = (member: TeamMember) => {
    setEditingMember(member);
    setEditFormData({
      name: member.name,
      email: member.email,
      role: member.role,
      status: member.status,
      team_id: member.team_id || '',
      function_id: member.function_id || '',
      weight: member.weight || 1
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    try {
      await api.updateTeamMember(editingMember.id, {
        name: editFormData.name,
        email: editFormData.email,
        role: editFormData.role as 'admin' | 'manager' | 'agent',
        status: editFormData.status,
        team_id: editFormData.team_id || null,
        function_id: editFormData.function_id || null,
        weight: editFormData.weight
      });
      toast.success('Membro atualizado com sucesso.');
      setShowEditModal(false);
      setEditingMember(null);
      await loadAllData();
    } catch (error) {
      console.error('Erro ao editar membro:', error);
      toast.error('Erro ao editar membro');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
        case 'active':
            return <Badge variant="success">Ativo</Badge>;
        case 'invited':
            return <Badge variant="outline">Pendente</Badge>;
        default:
            return <Badge variant="muted">Inativo</Badge>;
    }
  };

  // Filtered members based on search
  const filteredMembers = members.filter(m => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const teamName = teams.find(t => t.id === m.team_id)?.name || '';
    const funcName = functions.find(f => f.id === m.function_id)?.name || '';
    return (
      m.name.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term) ||
      teamName.toLowerCase().includes(term) ||
      funcName.toLowerCase().includes(term)
    );
  });

  // Dynamic stats
  const stats = {
    total: members.length,
    admins: members.filter(m => m.role === 'admin').length,
    members: members.filter(m => m.role !== 'admin').length,
    teams: teams.length
  };

  return (
    <div className="operation-page custom-scrollbar">
      <div className="operation-container">
      {/* Header Section */}
      <header className="operation-header">
        <div>
          <p className="eia-eyebrow">Organização</p>
          <h1>Equipe.</h1>
          <p>Gerencie usuários, papéis e times da operação.</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setShowConfigModal(true)} variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            Configurar
          </Button>
          <Button onClick={() => setShowModal(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Convidar usuário
          </Button>
        </div>
      </header>

      {/* Stats Cards Row */}
      <div className="operation-metrics">
        <div className="eia-metric eia-metric--atmos">
            <div className="eia-metric__label">Total de usuários</div>
            <div className="eia-metric__value">{loading ? '—' : stats.total}</div>
        </div>
        <div className="eia-metric eia-metric--atmos">
            <div className="eia-metric__label">Administradores</div>
            <div className="eia-metric__value">{loading ? '—' : stats.admins}</div>
        </div>
        <div className="eia-metric eia-metric--atmos">
            <div className="eia-metric__label">Membros</div>
            <div className="eia-metric__value">{loading ? '—' : stats.members}</div>
        </div>
        <div className="eia-metric eia-metric--atmos">
            <div className="eia-metric__label">Times ativos</div>
            <div className="eia-metric__value">{stats.teams}</div>
        </div>
      </div>

      {/* Search Bar */}
      <label className="operation-search operation-search--standalone">
        <Search aria-hidden="true" />
        <span className="sr-only">Buscar integrantes da equipe</span>
        <input
            type="text"
            placeholder="Buscar por nome, email, time ou função..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
        />
      </label>

      {/* Main Table Card */}
      <div className="eia-table-wrap team-table">
        <div className="p-6 border-b border-border">
            <h3 className="text-lg font-semibold text-foreground">Usuários da Equipe</h3>
            <p className="text-sm text-muted-foreground mt-1">Gerencie roles e times dos usuários</p>
        </div>

        {loading ? (
             <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                <span className="text-sm text-muted-foreground">Carregando dados...</span>
           </div>
        ) : members.length === 0 ? (
            <div className="operation-empty">
                <span className="operation-empty-icon"><Users aria-hidden="true" /></span>
                <p>Nenhum membro cadastrado ainda.</p>
                <Button onClick={() => setShowModal(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Convidar primeiro membro
                </Button>
            </div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border/50">
                            <th className="px-6 py-4 eia-eyebrow text-muted-foreground">Usuário</th>
                            <th className="px-6 py-4 eia-eyebrow text-muted-foreground">Email</th>
                            <th className="px-6 py-4 eia-eyebrow text-muted-foreground">Role</th>
                            <th className="px-6 py-4 eia-eyebrow text-muted-foreground">Time</th>
                            <th className="px-6 py-4 eia-eyebrow text-muted-foreground">Função</th>
                            <th className="px-6 py-4 eia-eyebrow text-muted-foreground">Peso</th>
                            <th className="px-6 py-4 eia-eyebrow text-muted-foreground text-center">Status</th>
                            <th className="px-6 py-4 eia-eyebrow text-muted-foreground text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                        {filteredMembers.map((member) => (
                            <tr key={member.id} className="hover:bg-accent/50 transition-colors group">
                                {/* User Info */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-muted-foreground border border-border uppercase">
                                            {member.name.substring(0, 2)}
                                        </div>
                                        <span className="text-sm font-medium text-foreground">{member.name}</span>
                                    </div>
                                </td>
                                
                                {/* Email */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm text-muted-foreground">{member.email}</span>
                                </td>

                                {/* Role Selector */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <select
                                        value={member.role}
                                        onChange={(e) => handleUpdateMember(member.id, 'role', e.target.value)}
                                        className="w-32 px-3 py-1.5 bg-secondary border border-input rounded-md text-sm text-foreground cursor-pointer hover:border-ring transition-colors"
                                    >
                                        <option value="agent">Atendente</option>
                                        <option value="manager">Gerente</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </td>

                                {/* Time Selector */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <select
                                        value={member.team_id || ''}
                                        onChange={(e) => handleUpdateMember(member.id, 'team_id', e.target.value || null)}
                                        className="w-32 px-3 py-1.5 bg-secondary border border-input rounded-md text-sm text-foreground cursor-pointer hover:border-ring transition-colors"
                                    >
                                        <option value="">Sem time</option>
                                        {teams.map(team => (
                                            <option key={team.id} value={team.id}>{team.name}</option>
                                        ))}
                                    </select>
                                </td>

                                {/* Function Selector */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <select
                                        value={member.function_id || ''}
                                        onChange={(e) => handleUpdateMember(member.id, 'function_id', e.target.value || null)}
                                        className="w-32 px-3 py-1.5 bg-secondary border border-input rounded-md text-sm text-foreground cursor-pointer hover:border-ring transition-colors"
                                    >
                                        <option value="">Sem função</option>
                                        {functions.map(func => (
                                            <option key={func.id} value={func.id}>{func.name}</option>
                                        ))}
                                    </select>
                                </td>

                                {/* Weight */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={member.weight || 1}
                                        onChange={(e) => handleUpdateMember(member.id, 'weight', parseInt(e.target.value))}
                                        className="w-16 px-2 py-1 bg-secondary border border-input rounded-md text-sm text-foreground text-center"
                                    />
                                </td>

                                {/* Status */}
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    {getStatusBadge(member.status)}
                                </td>

                                {/* Actions */}
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <button
                                            onClick={() => handleEditClick(member)}
                                            aria-label={`Editar ${member.name}`}
                                            className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                            title="Editar membro"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteMember(member.id, member.name)}
                                            aria-label={`Excluir ${member.name}`}
                                            className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                            title="Excluir membro"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* Acesso ao workspace — convite real, não recado */}
      <section className="eia-table-wrap team-access" aria-labelledby="team-access-title">
        <div className="p-6 border-b border-border">
          <p className="eia-eyebrow">Acesso ao workspace</p>
          <h3 id="team-access-title" className="mt-2 text-lg font-semibold text-foreground">Convites</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            O cadastro público está fechado. Só entra quem é convidado daqui: o email fica liberado na
            lista de acesso e a conta é criada na hora, com o papel escolhido.
          </p>
        </div>

        {!isAdmin ? (
          <div className="operation-empty">
            <span className="operation-empty-icon"><ShieldCheck aria-hidden="true" /></span>
            <p>Só administradores convidam pessoas.</p>
            <small>Peça a um administrador do workspace para liberar o email de quem falta.</small>
          </div>
        ) : (
          <>
            <form onSubmit={handleSendInvite} className="grid gap-4 border-b border-border p-6 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="access-invite-email" className="text-sm font-medium text-muted-foreground">Email de quem entra</label>
                <input
                  id="access-invite-email"
                  ref={inviteEmailRef}
                  required
                  type="email"
                  className="w-full rounded-lg border border-input bg-secondary p-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                  placeholder="colaborador@empresa.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="access-invite-name" className="text-sm font-medium text-muted-foreground">Nome (opcional)</label>
                <input
                  id="access-invite-name"
                  type="text"
                  className="w-full rounded-lg border border-input bg-secondary p-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                  placeholder="Ex: João da Silva"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="access-invite-role" className="text-sm font-medium text-muted-foreground">Papel no workspace</label>
                <select
                  id="access-invite-role"
                  value={inviteForm.workspaceRole}
                  onChange={(e) => setInviteForm({ ...inviteForm, workspaceRole: e.target.value as WorkspaceRole })}
                  className="w-full rounded-lg border border-input bg-secondary p-2.5 text-sm text-foreground"
                >
                  {WORKSPACE_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>{WORKSPACE_ROLE_LABEL[role]}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">{WORKSPACE_ROLE_HINT[inviteForm.workspaceRole]}</p>
              </div>

              <div className="flex flex-col justify-between gap-4">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={inviteForm.workspaceRole === 'admin' ? true : inviteForm.canPublish}
                    disabled={inviteForm.workspaceRole === 'admin'}
                    onChange={(e) => setInviteForm({ ...inviteForm, canPublish: e.target.checked })}
                  />
                  <span>Pode publicar versões da agente</span>
                </label>
                <Button type="submit" disabled={sendingInvite}>
                  {sendingInvite ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Enviar convite
                </Button>
              </div>
            </form>

            {manualLink && (
              <div className="border-b border-border p-6" role="status">
                <p className="text-sm font-medium text-foreground">{manualLink.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Link de acesso para {manualLink.email}. Ele vale uma vez e expira em uma hora.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-secondary p-2.5 text-xs text-muted-foreground">
                    {manualLink.link}
                  </code>
                  <Button type="button" variant="outline" onClick={() => copyManualLink(manualLink.link)}>
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    Copiar link
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setManualLink(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            )}

            {invitesLoading ? (
              <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Carregando convites...</span>
              </div>
            ) : invitesError ? (
              <div className="operation-empty">
                <span className="operation-empty-icon"><ShieldCheck aria-hidden="true" /></span>
                <p>Não foi possível carregar os convites.</p>
                <small>{invitesError}</small>
                <Button onClick={loadInvites}>Tentar de novo</Button>
              </div>
            ) : invites.length === 0 ? (
              <div className="operation-empty">
                <span className="operation-empty-icon"><UserPlus aria-hidden="true" /></span>
                <p>Ninguém foi convidado ainda.</p>
                <small>
                  Enquanto a lista estiver vazia, só você entra no workspace. Informe o email de
                  trabalho da pessoa no formulário acima para liberar o acesso.
                </small>
                <Button onClick={() => inviteEmailRef.current?.focus()}>Convidar pessoa</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="px-6 py-4 eia-eyebrow text-muted-foreground">Pessoa</th>
                      <th className="px-6 py-4 eia-eyebrow text-muted-foreground">Papel</th>
                      <th className="px-6 py-4 eia-eyebrow text-muted-foreground">Convidado por</th>
                      <th className="px-6 py-4 eia-eyebrow text-muted-foreground">Enviado em</th>
                      <th className="px-6 py-4 eia-eyebrow text-muted-foreground text-center">Situação</th>
                      <th className="px-6 py-4 eia-eyebrow text-muted-foreground text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {invites.map((invite) => (
                      <tr key={invite.email} className="transition-colors hover:bg-accent/50">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            {invite.name && (
                              <span className="text-sm font-medium text-foreground">{invite.name}</span>
                            )}
                            <span className="text-sm text-muted-foreground">{invite.email}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-foreground">{WORKSPACE_ROLE_LABEL[invite.workspaceRole]}</span>
                          {invite.canPublishAgent && (
                            <span className="block text-xs text-muted-foreground">Publica a agente</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-muted-foreground">{invite.invitedByName || '—'}</span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-muted-foreground">
                            {formatInviteDate(invite.inviteSentAt ?? invite.createdAt)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-center">
                          {invite.accepted ? (
                            <Badge variant="success">Aceito</Badge>
                          ) : (
                            <Badge variant="outline">Pendente</Badge>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-center">
                          <button
                            onClick={() => handleRevokeInvite(invite)}
                            disabled={revokingEmail === invite.email}
                            aria-label={`Revogar acesso de ${invite.email}`}
                            title="Revogar acesso"
                            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            {revokingEmail === invite.email ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      </div>

      {/* Invite Modal */}
      {showModal && (
        <div className="eia-dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="eia-dialog-content relative max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <div>
                        <p className="eia-eyebrow mb-2">Acesso ao workspace</p>
                        <h3 className="eia-dialog-title">Convidar pessoa</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            O convite libera o email e cria a conta. A pessoa recebe o link para definir a senha.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowModal(false)}
                        aria-label="Fechar convite"
                        className="eia-dialog-close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleInvite} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="invite-name" className="text-sm font-medium text-muted-foreground">Nome completo</label>
                        <input 
                            id="invite-name"
                            required
                            type="text" 
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring outline-none transition-all"
                            placeholder="Ex: João da Silva"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="invite-email" className="text-sm font-medium text-muted-foreground">Email corporativo</label>
                        <input 
                            id="invite-email"
                            required
                            type="email" 
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring outline-none transition-all"
                            placeholder="colaborador@empresa.com"
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Nível de acesso</p>
                        <div className="grid grid-cols-3 gap-2">
                            {['agent', 'manager', 'admin'].map((role) => (
                                <button
                                    type="button"
                                    key={role}
                                    onClick={() => setFormData({...formData, role})}
                                    aria-pressed={formData.role === role}
                                    className={`rounded-lg border p-2 text-center transition-all ${
                                        formData.role === role 
                                        ? 'bg-primary/10 border-primary text-foreground'
                                        : 'bg-secondary border-border text-muted-foreground hover:border-ring'
                                    }`}
                                >
                                    <div className="text-xs font-medium mb-1">{role === 'agent' ? 'Atendente' : role === 'manager' ? 'Gerente' : 'Admin'}</div>
                                    {formData.role === role && <div className="flex justify-center"><Check className="w-3 h-3" /></div>}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            No workspace, isso vira {WORKSPACE_ROLE_LABEL[workspaceRoleForTeamRole(formData.role)]}.{' '}
                            {WORKSPACE_ROLE_HINT[workspaceRoleForTeamRole(formData.role)]}
                        </p>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input accent-primary"
                            checked={formData.role === 'admin' ? true : canPublishAgent}
                            disabled={formData.role === 'admin'}
                            onChange={(e) => setCanPublishAgent(e.target.checked)}
                        />
                        <span>Pode publicar versões da agente</span>
                    </label>

                    <div className="space-y-2">
                        <label htmlFor="invite-team" className="text-sm font-medium text-muted-foreground">Time (opcional)</label>
                        <select
                            id="invite-team"
                            value={formData.team_id}
                            onChange={(e) => setFormData({...formData, team_id: e.target.value})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        >
                            <option value="">Sem time</option>
                            {teams.map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="invite-function" className="text-sm font-medium text-muted-foreground">Função (opcional)</label>
                        <select
                            id="invite-function"
                            value={formData.function_id}
                            onChange={(e) => setFormData({...formData, function_id: e.target.value})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        >
                            <option value="">Sem função</option>
                            {functions.map(func => (
                                <option key={func.id} value={func.id}>{func.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="invite-weight" className="text-sm font-medium text-muted-foreground">Peso (para distribuição)</label>
                        <input
                            id="invite-weight"
                            type="number"
                            min="1"
                            max="10"
                            value={formData.weight}
                            onChange={(e) => setFormData({...formData, weight: parseInt(e.target.value)})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <Button type="button" variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancelar</Button>
                        <Button type="submit" className="flex-1" disabled={sendingInvite}>
                            {sendingInvite && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                            Enviar convite
                        </Button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Config Modal */}
      <TeamConfigModal 
        isOpen={showConfigModal} 
        onClose={() => setShowConfigModal(false)} 
        onUpdate={loadAllData}
      />

      {/* Edit Member Modal */}
      {showEditModal && editingMember && (
        <div className="eia-dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="eia-dialog-content relative max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <div>
                        <p className="eia-eyebrow mb-2">Permissões do workspace</p>
                        <h3 className="eia-dialog-title">Editar membro</h3>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setShowEditModal(false); setEditingMember(null); }}
                        aria-label="Fechar edição do membro"
                        className="eia-dialog-close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="edit-member-name" className="text-sm font-medium text-muted-foreground">Nome completo</label>
                        <input 
                            id="edit-member-name"
                            required
                            type="text" 
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring outline-none transition-all"
                            value={editFormData.name}
                            onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="edit-member-email" className="text-sm font-medium text-muted-foreground">Email</label>
                        <input 
                            id="edit-member-email"
                            required
                            type="email" 
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring outline-none transition-all"
                            value={editFormData.email}
                            onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Nível de acesso</p>
                        <div className="grid grid-cols-3 gap-2">
                            {['agent', 'manager', 'admin'].map((role) => (
                                <button
                                    type="button"
                                    key={role}
                                    onClick={() => setEditFormData({...editFormData, role})}
                                    aria-pressed={editFormData.role === role}
                                    className={`rounded-lg border p-2 text-center transition-all ${
                                        editFormData.role === role 
                                        ? 'bg-primary/10 border-primary text-foreground'
                                        : 'bg-secondary border-border text-muted-foreground hover:border-ring'
                                    }`}
                                >
                                    <div className="text-xs font-medium mb-1">{role === 'agent' ? 'Atendente' : role === 'manager' ? 'Gerente' : 'Admin'}</div>
                                    {editFormData.role === role && <div className="flex justify-center"><Check className="w-3 h-3" /></div>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="edit-member-status" className="text-sm font-medium text-muted-foreground">Status</label>
                        <select
                            id="edit-member-status"
                            value={editFormData.status}
                            onChange={(e) => setEditFormData({...editFormData, status: e.target.value as 'active' | 'invited' | 'disabled'})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        >
                            <option value="active">Ativo</option>
                            <option value="invited">Pendente</option>
                            <option value="disabled">Inativo</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="edit-member-team" className="text-sm font-medium text-muted-foreground">Time</label>
                        <select
                            id="edit-member-team"
                            value={editFormData.team_id}
                            onChange={(e) => setEditFormData({...editFormData, team_id: e.target.value})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        >
                            <option value="">Sem time</option>
                            {teams.map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="edit-member-function" className="text-sm font-medium text-muted-foreground">Função</label>
                        <select
                            id="edit-member-function"
                            value={editFormData.function_id}
                            onChange={(e) => setEditFormData({...editFormData, function_id: e.target.value})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        >
                            <option value="">Sem função</option>
                            {functions.map(func => (
                                <option key={func.id} value={func.id}>{func.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="edit-member-weight" className="text-sm font-medium text-muted-foreground">Peso</label>
                        <input
                            id="edit-member-weight"
                            type="number"
                            min="1"
                            max="10"
                            value={editFormData.weight}
                            onChange={(e) => setEditFormData({...editFormData, weight: parseInt(e.target.value)})}
                            className="w-full bg-secondary border border-input rounded-lg p-2.5 text-sm text-foreground"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <Button type="button" variant="outline" onClick={() => { setShowEditModal(false); setEditingMember(null); }} className="flex-1">Cancelar</Button>
                        <Button type="submit" className="flex-1">Salvar alterações</Button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default Team;
