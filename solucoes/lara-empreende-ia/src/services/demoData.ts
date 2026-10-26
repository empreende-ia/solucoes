import { supabase } from '@/integrations/supabase/client';
import {
  DEMO_APPOINTMENTS,
  DEMO_CONTACTS,
  DEMO_CONVERSATIONS,
  DEMO_DEALS,
  DEMO_EMAIL_DOMAIN,
  DEMO_STAGE_POSITIONS,
  DEMO_TAG,
  DEMO_TEAM_MEMBERS,
  atTime,
  daysFromNow,
  toDateOnly,
} from '@/lib/demoDataset';

/**
 * Serviço do modo demonstração.
 *
 * Semeia (e remove) um conjunto coerente de contatos, conversas, negócios,
 * agendamentos e equipe para apresentar a plataforma cheia a clientes.
 * Todo dado semeado é marcado — tag `demo` ou `metadata.demo = true` — e a
 * limpeza usa exatamente essas marcas, então dado real nunca é tocado.
 */

export interface DemoDataStatus {
  enabled: boolean;
  counts: {
    contacts: number;
    conversations: number;
    deals: number;
    appointments: number;
    teamMembers: number;
  };
}

const DEMO_META = { demo: true } as const;

class DemoDataError extends Error {}

function fail(context: string, error: { message: string } | null): never {
  throw new DemoDataError(`${context}: ${error?.message ?? 'erro desconhecido'}`);
}

async function getSettingsId(): Promise<string> {
  const { data, error } = await supabase
    .from('lara_settings')
    .select('id')
    .limit(1)
    .maybeSingle();
  if (error) fail('Não foi possível ler as configurações', error);
  if (!data) throw new DemoDataError('Configure a instância no onboarding antes de usar o modo demonstração.');
  return data.id;
}

async function setDemoFlag(enabled: boolean): Promise<void> {
  const id = await getSettingsId();
  const { error } = await supabase
    .from('lara_settings')
    .update({ demo_mode_enabled: enabled } as never)
    .eq('id', id);
  if (error) fail('Não foi possível atualizar o modo demonstração', error);
}

/** Ids dos contatos de demonstração — âncora para conversas, negócios e agenda. */
async function fetchDemoContactIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id')
    .contains('tags', [DEMO_TAG]);
  if (error) fail('Não foi possível listar os contatos de demonstração', error);
  return (data ?? []).map((row) => row.id);
}

export const demoDataService = {
  async getStatus(): Promise<DemoDataStatus> {
    const [settings, contacts, conversations, deals, appointments, team] = await Promise.all([
      supabase.from('lara_settings_public').select('demo_mode_enabled').limit(1).maybeSingle(),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).contains('tags', [DEMO_TAG]),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).contains('metadata', DEMO_META),
      supabase.from('deals').select('id', { count: 'exact', head: true }).contains('tags', [DEMO_TAG]),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).contains('metadata', DEMO_META),
      supabase.from('team_members').select('id', { count: 'exact', head: true }).like('email', `%@${DEMO_EMAIL_DOMAIN}`),
    ]);

    const flag = (settings.data as { demo_mode_enabled?: boolean } | null)?.demo_mode_enabled === true;

    return {
      enabled: flag,
      counts: {
        contacts: contacts.count ?? 0,
        conversations: conversations.count ?? 0,
        deals: deals.count ?? 0,
        appointments: appointments.count ?? 0,
        teamMembers: team.count ?? 0,
      },
    };
  },

  /** Remove tudo que foi semeado. Idempotente. */
  async disable(): Promise<void> {
    const contactIds = await fetchDemoContactIds();

    if (contactIds.length > 0) {
      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .in('contact_id', contactIds);
      if (convError) fail('Não foi possível listar as conversas de demonstração', convError);

      const conversationIds = (conversations ?? []).map((row) => row.id);
      if (conversationIds.length > 0) {
        const steps = [
          supabase.from('messages').delete().in('conversation_id', conversationIds),
          supabase.from('conversation_states').delete().in('conversation_id', conversationIds),
        ];
        for (const step of steps) {
          const { error } = await step;
          if (error) fail('Não foi possível limpar as mensagens de demonstração', error);
        }
        const { error } = await supabase.from('conversations').delete().in('id', conversationIds);
        if (error) fail('Não foi possível remover as conversas de demonstração', error);
      }

      const { error: dealError } = await supabase.from('deals').delete().in('contact_id', contactIds);
      if (dealError) fail('Não foi possível remover os negócios de demonstração', dealError);

      const { error: apptError } = await supabase.from('appointments').delete().in('contact_id', contactIds);
      if (apptError) fail('Não foi possível remover os agendamentos de demonstração', apptError);

      const { error: contactError } = await supabase.from('contacts').delete().in('id', contactIds);
      if (contactError) fail('Não foi possível remover os contatos de demonstração', contactError);
    }

    // Sobras marcadas que perderam o contato de origem.
    await supabase.from('deals').delete().contains('tags', [DEMO_TAG]);
    await supabase.from('appointments').delete().contains('metadata', DEMO_META);
    await supabase.from('team_members').delete().like('email', `%@${DEMO_EMAIL_DOMAIN}`);

    await setDemoFlag(false);
  },

  /** Recria o cenário do zero e liga o modo demonstração. */
  async enable(): Promise<void> {
    // Sempre parte de um estado limpo: reativar não pode duplicar o cenário.
    await disableQuietly();

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    const now = new Date();

    const contactRows = DEMO_CONTACTS.map((seed) => ({
      name: seed.name,
      call_name: seed.callName,
      phone_number: seed.phone,
      whatsapp_id: seed.phone,
      email: seed.email,
      tags: [...seed.tags, DEMO_TAG],
      notes: seed.notes,
      user_id: userId,
      first_contact_date: daysFromNow(-seed.createdDaysAgo, now).toISOString(),
      last_activity: daysFromNow(-Math.max(seed.createdDaysAgo - 1, 0), now).toISOString(),
      created_at: daysFromNow(-seed.createdDaysAgo, now).toISOString(),
    }));

    const { data: contacts, error: contactError } = await supabase
      .from('contacts')
      .insert(contactRows as never)
      .select('id, phone_number');
    if (contactError) fail('Não foi possível criar os contatos de demonstração', contactError);

    const contactIdByKey = new Map<string, string>();
    (contacts ?? []).forEach((row) => {
      const seed = DEMO_CONTACTS.find((candidate) => candidate.phone === row.phone_number);
      if (seed) contactIdByKey.set(seed.key, row.id);
    });

    await seedDeals(contactIdByKey, userId, now);
    await seedConversations(contactIdByKey, userId, now);
    await seedAppointments(contactIdByKey, userId, now);
    await seedTeam(userId);

    await setDemoFlag(true);
  },
};

/** Limpeza tolerante a falhas — usada antes de semear novamente. */
async function disableQuietly(): Promise<void> {
  try {
    await demoDataService.disable();
  } catch (error) {
    console.warn('[demoData] limpeza prévia parcial:', error);
  }
}

async function seedDeals(contactIdByKey: Map<string, string>, userId: string | null, now: Date): Promise<void> {
  const { data: stages, error: stageError } = await supabase
    .from('pipeline_stages')
    .select('id, position')
    .eq('is_active', true);
  if (stageError) fail('Não foi possível ler as etapas do pipeline', stageError);

  const stageIdByPosition = new Map<number, string>();
  (stages ?? []).forEach((stage) => stageIdByPosition.set(stage.position, stage.id));
  const fallbackStageId = (stages ?? []).slice().sort((a, b) => a.position - b.position)[0]?.id;
  if (!fallbackStageId) throw new DemoDataError('Nenhuma etapa de pipeline ativa encontrada.');

  const contactIds = [...contactIdByKey.values()];
  // O gatilho do banco já cria um negócio por contato novo: reaproveitamos essas
  // linhas em vez de duplicar o pipeline.
  const { data: autoDeals } = await supabase
    .from('deals')
    .select('id, contact_id')
    .in('contact_id', contactIds);
  const autoDealByContact = new Map<string, string>();
  (autoDeals ?? []).forEach((deal) => {
    if (deal.contact_id && !autoDealByContact.has(deal.contact_id)) autoDealByContact.set(deal.contact_id, deal.id);
  });

  for (const seed of DEMO_DEALS) {
    const contactId = contactIdByKey.get(seed.contactKey);
    if (!contactId) continue;

    const stageId = stageIdByPosition.get(DEMO_STAGE_POSITIONS[seed.stage]) ?? fallbackStageId;
    const payload = {
      contact_id: contactId,
      title: seed.title,
      company: seed.company,
      value: seed.value,
      stage_id: stageId,
      priority: seed.priority,
      tags: [...seed.tags, DEMO_TAG],
      due_date: seed.dueInDays === null ? null : toDateOnly(daysFromNow(seed.dueInDays, now)),
      notes: seed.notes,
      user_id: userId,
      won_at: seed.wonDaysAgo === undefined ? null : atTime(-seed.wonDaysAgo, 15, 0, now).toISOString(),
      lost_at: seed.lostDaysAgo === undefined ? null : atTime(-seed.lostDaysAgo, 17, 0, now).toISOString(),
      lost_reason: seed.lostReason ?? null,
      created_at: daysFromNow(-14, now).toISOString(),
    };

    const existingId = autoDealByContact.get(contactId);
    const { error } = existingId
      ? await supabase.from('deals').update(payload as never).eq('id', existingId)
      : await supabase.from('deals').insert(payload as never);
    if (error) fail('Não foi possível criar os negócios de demonstração', error);
  }

  // Negócios criados pelo gatilho para contatos sem roteiro ficariam sem marca.
  const seededContactIds = DEMO_DEALS
    .map((seed) => contactIdByKey.get(seed.contactKey))
    .filter((id): id is string => Boolean(id));
  const orphanIds = contactIds.filter((id) => !seededContactIds.includes(id));
  if (orphanIds.length > 0) {
    await supabase.from('deals').delete().in('contact_id', orphanIds);
  }
}

async function seedConversations(contactIdByKey: Map<string, string>, userId: string | null, now: Date): Promise<void> {
  for (const seed of DEMO_CONVERSATIONS) {
    const contactId = contactIdByKey.get(seed.contactKey);
    if (!contactId) continue;

    const startedAt = atTime(-seed.startedDaysAgo, seed.startHour, 0, now);
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        contact_id: contactId,
        status: seed.status,
        is_active: true,
        channel: seed.channel,
        assigned_team: seed.assignedTeam,
        tags: [...seed.tags, DEMO_TAG],
        metadata: DEMO_META,
        user_id: userId,
        started_at: startedAt.toISOString(),
        created_at: startedAt.toISOString(),
        last_message_at: startedAt.toISOString(),
      } as never)
      .select('id')
      .single();
    if (error) fail('Não foi possível criar as conversas de demonstração', error);

    const messageRows = seed.messages.map((message, index) => {
      const sentAt = new Date(startedAt.getTime() + message.minutesOffset * 60_000);
      return {
        conversation_id: conversation!.id,
        type: 'text',
        from_type: message.from,
        content: message.content,
        status: 'read',
        processed_by_lara: message.from === 'lara',
        lara_response_time: message.responseTimeMs ?? null,
        metadata: DEMO_META,
        sent_at: sentAt.toISOString(),
        delivered_at: sentAt.toISOString(),
        read_at: new Date(sentAt.getTime() + 30_000).toISOString(),
        created_at: sentAt.toISOString(),
        // mantém a ordem estável quando duas mensagens caem no mesmo minuto
        whatsapp_message_id: `demo-${conversation!.id}-${index}`,
      };
    });

    const { error: messageError } = await supabase.from('messages').insert(messageRows as never);
    if (messageError) fail('Não foi possível criar as mensagens de demonstração', messageError);

    // O gatilho de mensagens empurra `last_message_at` para agora: corrigimos
    // para o horário do roteiro, que é o que a lista de conversas ordena.
    const lastMessage = messageRows[messageRows.length - 1];
    await supabase
      .from('conversations')
      .update({ last_message_at: lastMessage.sent_at, started_at: startedAt.toISOString() } as never)
      .eq('id', conversation!.id);
  }
}

async function seedAppointments(contactIdByKey: Map<string, string>, userId: string | null, now: Date): Promise<void> {
  const rows = DEMO_APPOINTMENTS.flatMap((seed) => {
    const contactId = contactIdByKey.get(seed.contactKey);
    if (!contactId) return [];
    return [{
      contact_id: contactId,
      title: seed.title,
      description: seed.description,
      date: toDateOnly(daysFromNow(seed.dayOffset, now)),
      time: seed.time,
      duration: seed.duration,
      type: seed.type,
      status: seed.status,
      attendees: seed.attendees,
      meeting_url: 'https://meet.google.com/demo-lara-sala',
      metadata: DEMO_META,
      user_id: userId,
      created_at: daysFromNow(-seed.createdDaysAgo, now).toISOString(),
    }];
  });

  if (rows.length === 0) return;
  const { error } = await supabase.from('appointments').insert(rows as never);
  if (error) fail('Não foi possível criar os agendamentos de demonstração', error);
}

async function seedTeam(userId: string | null): Promise<void> {
  const [{ data: teams }, { data: functions }] = await Promise.all([
    supabase.from('teams').select('id, name'),
    supabase.from('team_functions').select('id, name'),
  ]);

  const teamIdByName = new Map((teams ?? []).map((team) => [team.name, team.id]));
  const functionIdByName = new Map((functions ?? []).map((fn) => [fn.name, fn.id]));

  const rows = DEMO_TEAM_MEMBERS.map((seed) => ({
    name: seed.name,
    email: `${seed.emailLocal}@${DEMO_EMAIL_DOMAIN}`,
    role: seed.role,
    status: seed.status,
    team_id: teamIdByName.get(seed.team) ?? null,
    function_id: functionIdByName.get(seed.functionName) ?? null,
    weight: seed.weight,
    user_id: userId,
    last_active: new Date().toISOString(),
  }));

  const { error } = await supabase.from('team_members').insert(rows as never);
  if (error) fail('Não foi possível criar a equipe de demonstração', error);
}
