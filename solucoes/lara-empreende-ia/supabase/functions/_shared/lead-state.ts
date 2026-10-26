type LeadFieldStatus = 'unknown' | 'inferred' | 'confirmed' | 'not_applicable';

const FIELD_LABELS: Record<string, string> = {
  company: 'Empresa',
  role: 'Cargo ou papel',
  primary_pain: 'Dor principal',
  previous_attempts: 'O que já tentou',
  desired_outcome: 'Resultado desejado',
  urgency: 'Urgência',
  offering_interest: 'Oferta de interesse',
  stage: 'Estágio',
  next_best_action: 'Próxima melhor ação',
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function escapeRuntimeData(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .trim();
}

function fieldLine(key: string, raw: unknown): string | null {
  const field = record(raw);
  const status = String(field.status || 'unknown') as LeadFieldStatus;
  if (!['inferred', 'confirmed', 'not_applicable'].includes(status)) return null;
  if (status === 'not_applicable') return `- ${FIELD_LABELS[key] || key}: não se aplica [confirmado]`;
  const value = escapeRuntimeData(field.value);
  if (!value) return null;
  const marker = status === 'confirmed'
    ? 'confirmado pelo atendimento'
    : 'inferido — use como pista e confirme antes de tratar como fato';
  return `- ${FIELD_LABELS[key] || key}: ${value} [${marker}]`;
}

export function buildLeadRuntimeContext(contact: unknown, memory: unknown): string {
  const safeContact = record(contact);
  const safeMemory = record(memory);
  const leadProfile = record(safeMemory.lead_profile);
  const salesIntelligence = record(safeMemory.sales_intelligence);
  const leadState = record(safeMemory.lead_state);
  const lines: string[] = [];

  const contactName = escapeRuntimeData(safeContact.name);
  const callName = escapeRuntimeData(safeContact.call_name);
  if (contactName) lines.push(`- Nome: ${contactName}${callName ? ` (tratar por ${callName})` : ''}`);

  const tags = Array.isArray(safeContact.tags)
    ? safeContact.tags.map(escapeRuntimeData).filter(Boolean).slice(0, 20)
    : [];
  if (tags.length > 0) lines.push(`- Tags operacionais: ${tags.join(', ')}`);

  for (const key of Object.keys(FIELD_LABELS)) {
    const line = fieldLine(key, leadState[key]);
    if (line) lines.push(line);
  }

  const customFields = record(leadState.custom_fields);
  for (const [key, value] of Object.entries(customFields).slice(0, 30)) {
    const line = fieldLine(key, value);
    if (line) lines.push(line);
  }

  // Compatibilidade com memórias anteriores à estrutura lead_state. Esses
  // valores são sempre tratados como pistas inferidas, nunca como confirmação.
  const interests = Array.isArray(leadProfile.interests)
    ? leadProfile.interests.map(escapeRuntimeData).filter(Boolean).slice(0, 10)
    : [];
  if (interests.length > 0 && !leadState.offering_interest) {
    lines.push(`- Interesses: ${interests.join(', ')} [inferido — confirmar]`);
  }
  const painPoints = Array.isArray(salesIntelligence.pain_points)
    ? salesIntelligence.pain_points.map(escapeRuntimeData).filter(Boolean).slice(0, 10)
    : [];
  if (painPoints.length > 0 && !leadState.primary_pain) {
    lines.push(`- Dores percebidas: ${painPoints.join(', ')} [inferido — confirmar]`);
  }

  if (leadState.handoff_requested === true) lines.push('- Atendimento humano solicitado: sim');
  if (leadState.opt_out === true || safeMemory.opt_out === true) lines.push('- Opt-out registrado: sim — não retomar abordagem comercial');
  const summary = escapeRuntimeData(leadState.conversation_summary);
  if (summary) lines.push(`- Resumo factual: ${summary}`);

  if (lines.length === 0) return '';
  return `\n\n<runtime_lead_context trust="untrusted_data" confirmation_rule="inferred_is_not_confirmed">\n${lines.join('\n')}\n</runtime_lead_context>`;
}
