import { supabase } from '@/integrations/supabase/client';
import { evalsApi, type ExpectedBehavior } from './evals';

const db = supabase as any;

export type AgentSuggestionType =
  | 'new_fact'
  | 'new_faq'
  | 'new_example'
  | 'new_test_scenario'
  | 'commercial_rule'
  | 'tone_adjustment'
  | 'handoff_rule'
  | 'missing_material';

export interface AgentSuggestion {
  id: string;
  workspace_id: string;
  agent_id: string;
  suggestion_type: AgentSuggestionType;
  title: string;
  rationale: string;
  proposed_change: Record<string, unknown>;
  evidence: { quote?: string; analyzed_days?: number };
  source_conversation_id: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'applied';
  created_at: string;
}

async function review(id: string, status: 'accepted' | 'rejected' | 'applied', entityType?: string, entityId?: string) {
  const { error } = await db.rpc('review_agent_suggestion', {
    _suggestion_id: id,
    _status: status,
    _applied_entity_type: entityType ?? null,
    _applied_entity_id: entityId ?? null,
  });
  if (error) throw error;
}

export const suggestionsApi = {
  async fetchPending(): Promise<AgentSuggestion[]> {
    const { data, error } = await db.from('agent_suggestions').select('*')
      .eq('status', 'pending').order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async analyze(days = 14): Promise<{ suggestions: AgentSuggestion[]; analyzed: Record<string, number> }> {
    const { data, error } = await supabase.functions.invoke('prompt-insights', { body: { days } });
    if (error) {
      let message = error.message;
      try {
        const context = (error as any).context;
        if (typeof context?.json === 'function') message = (await context.json())?.error || message;
      } catch { /* mantém mensagem original */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return { suggestions: data?.suggestions ?? [], analyzed: data?.analyzed ?? {} };
  },

  async reject(id: string) { await review(id, 'rejected'); },
  async acceptConfig(id: string) { await review(id, 'accepted'); },

  async createFactForReview(suggestion: AgentSuggestion): Promise<void> {
    const change = suggestion.proposed_change;
    const content = String(change.content || '').trim();
    if (!content) throw new Error('A sugestão não contém uma informação para revisar.');
    const { data, error } = await db.from('knowledge_facts').insert({
      workspace_id: suggestion.workspace_id,
      title: String(change.title || suggestion.title).slice(0, 240),
      category: String(change.category || 'geral').slice(0, 80),
      fact: content,
      source: `Sugestão de conversa: ${suggestion.evidence.quote || 'evidência preservada'}`.slice(0, 2000),
      status: 'needs_review',
      is_active: false,
      always_include: false,
    }).select('id').single();
    if (error) throw error;
    await review(suggestion.id, 'applied', 'knowledge_fact', data.id);
  },

  async createFaqForReview(suggestion: AgentSuggestion): Promise<void> {
    const change = suggestion.proposed_change;
    const question = String(change.question || suggestion.title).trim();
    const answer = String(change.answer || change.content || '').trim();
    if (!question || !answer) throw new Error('A sugestão não contém pergunta e resposta para revisar.');
    const { data, error } = await db.from('knowledge_facts').insert({
      workspace_id: suggestion.workspace_id, title: question.slice(0, 240), question: question.slice(0, 2000),
      category: 'faq', fact: answer, source: `Sugestão de conversa: ${suggestion.evidence.quote || 'evidência preservada'}`.slice(0, 2000),
      status: 'needs_review', is_active: false, always_include: false,
    }).select('id').single();
    if (error) throw error;
    await review(suggestion.id, 'applied', 'knowledge_fact', data.id);
  },

  async createTestScenario(suggestion: AgentSuggestion): Promise<void> {
    const change = suggestion.proposed_change;
    const query = String(change.query || '').trim();
    if (!query) throw new Error('A sugestão não contém uma mensagem para testar.');
    const created = await evalsApi.createCase({
      title: suggestion.title,
      query,
      expected_behavior: (change.expected_behavior || 'responder') as ExpectedBehavior,
      expected_content: String(change.expected_content || '').trim() || null,
      severity: change.severity === 'critical' ? 'critical' : 'warning',
      category: 'dificil',
      origin: 'manual',
      notes: `Criado após revisão de uma conversa: ${suggestion.evidence.quote || ''}`,
    });
    await review(suggestion.id, 'applied', 'evaluation_scenario', created.id);
  },
};
