import React, { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, Save, Loader2 } from 'lucide-react';
import { Button } from './Button';
import { api } from '../services/api';
import { Team, TeamFunction } from '../types';
import { supabase } from '@/integrations/supabase/client';

interface TeamConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

type TabType = 'teams' | 'functions';

const TeamConfigModal: React.FC<TeamConfigModalProps> = ({ isOpen, onClose, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<TabType>('teams');
  const [teams, setTeams] = useState<Team[]>([]);
  const [functions, setFunctions] = useState<TeamFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', color: '#141414' });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
      setupRealtime();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [teamsData, functionsData] = await Promise.all([
        api.fetchTeams(),
        api.fetchTeamFunctions()
      ]);
      setTeams(teamsData as any);
      setFunctions(functionsData as any);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtime = () => {
    const teamsChannel = supabase
      .channel('teams-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        loadData();
      })
      .subscribe();

    const functionsChannel = supabase
      .channel('functions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_functions' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(teamsChannel);
      supabase.removeChannel(functionsChannel);
    };
  };

  const handleCreateTeam = async () => {
    if (!editForm.name.trim()) return;
    try {
      await api.createTeam({
        name: editForm.name,
        description: editForm.description,
        color: editForm.color
      });
      setEditForm({ name: '', description: '', color: '#141414' });
      setIsCreating(false);
      onUpdate();
    } catch (error) {
      console.error('Error creating team:', error);
    }
  };

  const handleCreateFunction = async () => {
    if (!editForm.name.trim()) return;
    try {
      await api.createTeamFunction({
        name: editForm.name,
        description: editForm.description
      });
      setEditForm({ name: '', description: '', color: '#141414' });
      setIsCreating(false);
      onUpdate();
    } catch (error) {
      console.error('Error creating function:', error);
    }
  };

  const handleUpdateTeam = async (id: string) => {
    try {
      await api.updateTeam(id, {
        name: editForm.name,
        description: editForm.description,
        color: editForm.color
      });
      setEditingId(null);
      setEditForm({ name: '', description: '', color: '#141414' });
      onUpdate();
    } catch (error) {
      console.error('Error updating team:', error);
    }
  };

  const handleUpdateFunction = async (id: string) => {
    try {
      await api.updateTeamFunction(id, {
        name: editForm.name,
        description: editForm.description
      });
      setEditingId(null);
      setEditForm({ name: '', description: '', color: '#141414' });
      onUpdate();
    } catch (error) {
      console.error('Error updating function:', error);
    }
  };

  const handleDeleteTeam = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este time?')) return;
    try {
      await api.deleteTeam(id);
      onUpdate();
    } catch (error) {
      console.error('Error deleting team:', error);
    }
  };

  const handleDeleteFunction = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta função?')) return;
    try {
      await api.deleteTeamFunction(id);
      onUpdate();
    } catch (error) {
      console.error('Error deleting function:', error);
    }
  };

  const startEdit = (item: Team | TeamFunction, type: 'team' | 'function') => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      description: item.description || '',
      color: type === 'team' ? (item as Team).color : '#141414'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="eia-dialog-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="eia-dialog-content relative max-w-2xl w-full max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center">
          <div>
            <p className="eia-eyebrow mb-2">Estrutura do workspace</p>
            <h3 className="eia-dialog-title">Configurar equipe</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar configuração da equipe"
            className="eia-dialog-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="eia-tabs-list m-6 mb-0 flex p-1" role="tablist" aria-label="Configuração da equipe">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'teams'}
            onClick={() => setActiveTab('teams')}
            className={`eia-tabs-trigger flex-1 px-6 py-2 text-sm font-medium ${
              activeTab === 'teams'
                ? 'is-active'
                : ''
            }`}
            data-state={activeTab === 'teams' ? 'active' : 'inactive'}
          >
            Times
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'functions'}
            onClick={() => setActiveTab('functions')}
            className={`eia-tabs-trigger flex-1 px-6 py-2 text-sm font-medium ${
              activeTab === 'functions'
                ? 'is-active'
                : ''
            }`}
            data-state={activeTab === 'functions' ? 'active' : 'inactive'}
          >
            Funções
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh] custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : activeTab === 'teams' ? (
            <div className="space-y-3">
              {/* Create New Team */}
              {isCreating ? (
                <div className="eia-row-card p-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Nome do time"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-secondary border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  />
                  <input
                    type="text"
                    placeholder="Descrição (opcional)"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full bg-secondary border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleCreateTeam} className="flex-1">Salvar</Button>
                    <Button onClick={() => setIsCreating(false)} variant="ghost">Cancelar</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full bg-muted border border-dashed border-border rounded-lg p-4 text-muted-foreground hover:text-foreground hover:border-ring transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Novo time
                </button>
              )}

              {/* Teams List */}
              {teams.map((team) => (
                <div key={team.id} className="eia-row-card p-4">
                  {editingId === team.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full bg-secondary border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                      />
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full bg-secondary border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                      />
                      <div className="flex gap-2">
                        <Button onClick={() => handleUpdateTeam(team.id)} size="sm">
                          <Save className="w-3 h-3 mr-1" />
                          Salvar
                        </Button>
                        <Button onClick={() => setEditingId(null)} variant="ghost" size="sm">Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-sm font-medium text-foreground">{team.name}</div>
                          {team.description && (
                            <div className="text-xs text-muted-foreground">{team.description}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(team, 'team')}
                          aria-label={`Editar time ${team.name}`}
                          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTeam(team.id)}
                          aria-label={`Excluir time ${team.name}`}
                          className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Create New Function */}
              {isCreating ? (
                <div className="eia-row-card p-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Nome da função"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-secondary border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  />
                  <input
                    type="text"
                    placeholder="Descrição (opcional)"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full bg-secondary border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleCreateFunction} className="flex-1">Salvar</Button>
                    <Button onClick={() => setIsCreating(false)} variant="ghost">Cancelar</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full bg-muted border border-dashed border-border rounded-lg p-4 text-muted-foreground hover:text-foreground hover:border-ring transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Nova função
                </button>
              )}

              {/* Functions List */}
              {functions.map((func) => (
                <div key={func.id} className="eia-row-card p-4">
                  {editingId === func.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full bg-secondary border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                      />
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full bg-secondary border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                      />
                      <div className="flex gap-2">
                        <Button onClick={() => handleUpdateFunction(func.id)} size="sm">
                          <Save className="w-3 h-3 mr-1" />
                          Salvar
                        </Button>
                        <Button onClick={() => setEditingId(null)} variant="ghost" size="sm">Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-foreground">{func.name}</div>
                        {func.description && (
                          <div className="text-xs text-muted-foreground">{func.description}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(func, 'function')}
                          aria-label={`Editar função ${func.name}`}
                          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFunction(func.id)}
                          aria-label={`Excluir função ${func.name}`}
                          className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end">
          <Button onClick={onClose} variant="ghost">Fechar</Button>
        </div>
      </div>
    </div>
  );
};

export default TeamConfigModal;
