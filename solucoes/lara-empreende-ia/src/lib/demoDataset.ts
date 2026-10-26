/**
 * Dataset de demonstração da plataforma.
 *
 * Conteúdo puro (sem I/O): descreve contatos, conversas, negócios, agenda e
 * equipe fictícios em datas relativas a "agora". O serviço `demoData` traduz
 * isso em linhas no banco e sabe removê-las depois.
 *
 * Toda linha semeada carrega a marca `DEMO_TAG` (arrays de tags) ou
 * `{ demo: true }` (metadata jsonb) — é por ela que a limpeza encontra o que
 * apagar sem tocar em dado real.
 */

export const DEMO_TAG = 'demo';
export const DEMO_EMAIL_DOMAIN = 'demo.empreendeia.online';

export type DemoStageKey = 'novos' | 'qualificacao' | 'oportunidade' | 'fechamento' | 'ganho' | 'perdido';

/** Posição da etapa no pipeline padrão — resolvida em runtime para o id real. */
export const DEMO_STAGE_POSITIONS: Record<DemoStageKey, number> = {
  novos: 0,
  qualificacao: 1,
  oportunidade: 2,
  fechamento: 3,
  ganho: 100,
  perdido: 101,
};

export interface DemoContactSeed {
  key: string;
  name: string;
  callName: string;
  phone: string;
  email: string;
  tags: string[];
  notes: string;
  createdDaysAgo: number;
}

export interface DemoDealSeed {
  contactKey: string;
  title: string;
  company: string;
  value: number;
  stage: DemoStageKey;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  dueInDays: number | null;
  notes: string;
  /** Preenchido apenas em negócios ganhos — alimenta os gráficos do dashboard. */
  wonDaysAgo?: number;
  lostDaysAgo?: number;
  lostReason?: string;
}

export interface DemoMessageSeed {
  from: 'user' | 'lara' | 'human';
  content: string;
  /** Minutos após o início da conversa. */
  minutesOffset: number;
  /** Tempo de resposta da Lara em ms (só para mensagens dela). */
  responseTimeMs?: number;
}

export interface DemoConversationSeed {
  contactKey: string;
  status: 'lara' | 'human' | 'paused';
  channel: 'whatsapp' | 'instagram';
  assignedTeam: 'vendas' | 'suporte' | null;
  tags: string[];
  startedDaysAgo: number;
  /** Hora local de início da conversa. */
  startHour: number;
  messages: DemoMessageSeed[];
}

export interface DemoAppointmentSeed {
  contactKey: string;
  title: string;
  description: string;
  /** Dias a partir de hoje (negativo = passado). */
  dayOffset: number;
  time: string;
  duration: number;
  type: 'demo' | 'meeting' | 'support' | 'followup';
  status: 'scheduled' | 'completed' | 'cancelled';
  attendees: string[];
  createdDaysAgo: number;
}

export interface DemoTeamMemberSeed {
  name: string;
  emailLocal: string;
  role: 'admin' | 'manager' | 'agent';
  status: 'active' | 'invited' | 'disabled';
  team: 'Vendas' | 'Suporte';
  functionName: 'SDR' | 'Closer' | 'CS';
  weight: number;
}

export const DEMO_CONTACTS: DemoContactSeed[] = [
  { key: 'mariana', name: 'Mariana Duarte', callName: 'Mariana', phone: '5511987450113', email: 'mariana.duarte@lumenretail.com.br', tags: ['hot_lead', 'qualified'], notes: 'Head de CX da Lumen Retail. Quer automatizar o pré-atendimento do WhatsApp.', createdDaysAgo: 12 },
  { key: 'rafael', name: 'Rafael Bonfim', callName: 'Rafael', phone: '5521996320874', email: 'rafael@northlogistica.com', tags: ['warm_lead', 'demo_requested'], notes: 'Operação de logística com 40 vendedores. Pediu demonstração ao vivo.', createdDaysAgo: 10 },
  { key: 'camila', name: 'Camila Ferraz', callName: 'Camila', phone: '5531988271940', email: 'camila.ferraz@clinicavitta.com.br', tags: ['hot_lead', 'interested'], notes: 'Clínica com 6 unidades. Dor principal: agendamento manual.', createdDaysAgo: 9 },
  { key: 'diego', name: 'Diego Almeida', callName: 'Diego', phone: '5541995110228', email: 'diego@almeidaimoveis.com.br', tags: ['warm_lead', 'follow_up'], notes: 'Imobiliária. Comparando com outra ferramenta.', createdDaysAgo: 8 },
  { key: 'juliana', name: 'Juliana Prado', callName: 'Ju', phone: '5511974880351', email: 'juliana.prado@edukagroup.com', tags: ['qualified', 'demo_requested'], notes: 'Grupo educacional, 3 mil leads por mês em campanha.', createdDaysAgo: 7 },
  { key: 'ricardo', name: 'Ricardo Menezes', callName: 'Ricardo', phone: '5551991440762', email: 'ricardo@menezesconsult.com', tags: ['cold_lead'], notes: 'Consultoria B2B. Orçamento só no próximo trimestre.', createdDaysAgo: 6 },
  { key: 'patricia', name: 'Patrícia Lopes', callName: 'Patrícia', phone: '5548999230145', email: 'patricia@bellastore.com.br', tags: ['hot_lead', 'qualified'], notes: 'E-commerce de moda. Pico de mensagens nas campanhas.', createdDaysAgo: 5 },
  { key: 'anderson', name: 'Anderson Reis', callName: 'Anderson', phone: '5562998770412', email: 'anderson@agrosafra.com.br', tags: ['warm_lead'], notes: 'Agro. Quer atendimento fora do horário comercial.', createdDaysAgo: 4 },
  { key: 'leticia', name: 'Letícia Moraes', callName: 'Letícia', phone: '5581994520330', email: 'leticia@fintrackpay.com', tags: ['interested', 'follow_up'], notes: 'Fintech em expansão. Precisa de trilha de auditoria.', createdDaysAgo: 3 },
  { key: 'bruno', name: 'Bruno Tavares', callName: 'Bruno', phone: '5511983440129', email: 'bruno.tavares@quantumtech.com.br', tags: ['hot_lead'], notes: 'CTO curioso sobre a arquitetura do agente.', createdDaysAgo: 2 },
  { key: 'fernanda', name: 'Fernanda Rocha', callName: 'Fernanda', phone: '5519998210077', email: 'fernanda@rochaodontologia.com.br', tags: ['warm_lead', 'demo_requested'], notes: 'Rede odontológica. Alto volume de remarcações.', createdDaysAgo: 1 },
  { key: 'gustavo', name: 'Gustavo Lima', callName: 'Gustavo', phone: '5511970330218', email: 'gustavo@limaseguros.com.br', tags: ['cold_lead'], notes: 'Corretora de seguros. Entrou pelo Instagram.', createdDaysAgo: 0 },
];

export const DEMO_DEALS: DemoDealSeed[] = [
  { contactKey: 'gustavo', title: 'Lima Seguros — atendimento 24/7', company: 'Lima Seguros', value: 4800, stage: 'novos', priority: 'low', tags: ['inbound'], dueInDays: 21, notes: 'Lead novo vindo do Instagram.' },
  { contactKey: 'ricardo', title: 'Menezes Consult — piloto SDR', company: 'Menezes Consult', value: 7200, stage: 'novos', priority: 'low', tags: ['outbound'], dueInDays: 30, notes: 'Retomar no início do trimestre.' },
  { contactKey: 'anderson', title: 'AgroSafra — plantão noturno', company: 'AgroSafra', value: 11500, stage: 'qualificacao', priority: 'medium', tags: ['inbound'], dueInDays: 14, notes: 'Precisa de cobertura fora do horário comercial.' },
  { contactKey: 'diego', title: 'Almeida Imóveis — qualificação de leads', company: 'Almeida Imóveis', value: 9800, stage: 'qualificacao', priority: 'medium', tags: ['inbound', 'concorrência'], dueInDays: 12, notes: 'Comparando com concorrente. Enviar case do setor.' },
  { contactKey: 'leticia', title: 'FinTrack Pay — atendimento com auditoria', company: 'FinTrack Pay', value: 18400, stage: 'qualificacao', priority: 'high', tags: ['enterprise'], dueInDays: 18, notes: 'Compliance pediu trilha de auditoria completa.' },
  { contactKey: 'fernanda', title: 'Rocha Odontologia — agenda automática', company: 'Rocha Odontologia', value: 13600, stage: 'oportunidade', priority: 'medium', tags: ['saúde'], dueInDays: 9, notes: 'Demonstração marcada com a diretoria.' },
  { contactKey: 'bruno', title: 'Quantum Tech — integração de agentes', company: 'Quantum Tech', value: 26000, stage: 'oportunidade', priority: 'high', tags: ['enterprise', 'técnico'], dueInDays: 11, notes: 'Avaliação técnica em andamento com o time de engenharia.' },
  { contactKey: 'juliana', title: 'Eduka Group — captação de matrículas', company: 'Eduka Group', value: 32500, stage: 'fechamento', priority: 'high', tags: ['enterprise'], dueInDays: 4, notes: 'Proposta enviada. Aguardando aprovação do board.' },
  { contactKey: 'camila', title: 'Clínica Vitta — 6 unidades', company: 'Clínica Vitta', value: 21800, stage: 'fechamento', priority: 'high', tags: ['saúde'], dueInDays: 6, notes: 'Contrato em revisão jurídica.' },
  { contactKey: 'mariana', title: 'Lumen Retail — pré-atendimento', company: 'Lumen Retail', value: 28900, stage: 'ganho', priority: 'high', tags: ['enterprise'], dueInDays: null, notes: 'Fechado no plano anual com onboarding assistido.', wonDaysAgo: 3 },
  { contactKey: 'patricia', title: 'Bella Store — picos de campanha', company: 'Bella Store', value: 15400, stage: 'ganho', priority: 'medium', tags: ['e-commerce'], dueInDays: null, notes: 'Fechado após a demonstração com o time de marketing.', wonDaysAgo: 1 },
  { contactKey: 'rafael', title: 'North Logística — força de vendas', company: 'North Logística', value: 17200, stage: 'perdido', priority: 'medium', tags: ['inbound'], dueInDays: null, notes: 'Optaram por solução interna neste ciclo.', lostDaysAgo: 5, lostReason: 'Projeto adiado por corte de orçamento' },
];

export const DEMO_CONVERSATIONS: DemoConversationSeed[] = [
  {
    contactKey: 'mariana', status: 'lara', channel: 'whatsapp', assignedTeam: 'vendas', tags: ['hot_lead'], startedDaysAgo: 3, startHour: 9,
    messages: [
      { from: 'user', content: 'Oi! Vi o material de vocês sobre atendimento com IA. Funciona pra varejo com muitas lojas?', minutesOffset: 0 },
      { from: 'lara', content: 'Oi, Mariana! Funciona sim. A gente centraliza o WhatsApp de todas as lojas e a IA responde no mesmo tom da marca. Quantas unidades vocês têm hoje?', minutesOffset: 1, responseTimeMs: 4200 },
      { from: 'user', content: 'São 34 lojas e um time de 12 pessoas no CX.', minutesOffset: 4 },
      { from: 'lara', content: 'Perfeito. Nesse cenário a IA costuma resolver de 60% a 70% do primeiro contato e o time entra só nos casos complexos. Quer ver isso rodando numa demonstração de 30 minutos?', minutesOffset: 5, responseTimeMs: 3800 },
      { from: 'user', content: 'Quero sim. Pode ser quinta de manhã?', minutesOffset: 9 },
      { from: 'lara', content: 'Agendado para quinta às 10h. Já te enviei o convite por e-mail com o link da sala. 🙌', minutesOffset: 10, responseTimeMs: 5100 },
    ],
  },
  {
    contactKey: 'bruno', status: 'human', channel: 'whatsapp', assignedTeam: 'vendas', tags: ['qualified'], startedDaysAgo: 2, startHour: 14,
    messages: [
      { from: 'user', content: 'Boa tarde. Antes de avançar preciso entender como vocês tratam os dados das conversas.', minutesOffset: 0 },
      { from: 'lara', content: 'Boa tarde, Bruno! Tudo fica isolado por workspace, com criptografia em repouso e trilha de auditoria por ação. Quer que eu chame alguém do time técnico?', minutesOffset: 1, responseTimeMs: 3100 },
      { from: 'user', content: 'Sim, prefiro falar com uma pessoa.', minutesOffset: 3 },
      { from: 'human', content: 'Bruno, aqui é a Renata, da engenharia. Posso te mandar o diagrama de arquitetura e a política de retenção agora.', minutesOffset: 12 },
      { from: 'user', content: 'Ótimo, manda por aqui mesmo.', minutesOffset: 15 },
      { from: 'human', content: 'Enviado. Qualquer dúvida no documento, me chama que eu abro uma call rápida.', minutesOffset: 18 },
    ],
  },
  {
    contactKey: 'camila', status: 'lara', channel: 'whatsapp', assignedTeam: 'vendas', tags: ['hot_lead', 'demo_requested'], startedDaysAgo: 2, startHour: 11,
    messages: [
      { from: 'user', content: 'Bom dia! Hoje minha recepção passa o dia remarcando consulta no WhatsApp.', minutesOffset: 0 },
      { from: 'lara', content: 'Bom dia, Camila! Esse é justamente o caso em que a IA mais devolve tempo: ela confirma, remarca e cancela direto na agenda. Vocês usam Google Agenda?', minutesOffset: 1, responseTimeMs: 2900 },
      { from: 'user', content: 'Usamos Google Agenda em todas as unidades.', minutesOffset: 3 },
      { from: 'lara', content: 'Então a integração é nativa. Consigo te mostrar uma remarcação real acontecendo em 15 minutos de call. Terça às 15h funciona?', minutesOffset: 4, responseTimeMs: 3400 },
      { from: 'user', content: 'Funciona. Vou chamar a gerente de operações também.', minutesOffset: 8 },
    ],
  },
  {
    contactKey: 'juliana', status: 'human', channel: 'whatsapp', assignedTeam: 'vendas', tags: ['qualified'], startedDaysAgo: 1, startHour: 16,
    messages: [
      { from: 'user', content: 'Recebi a proposta, obrigada! Só travou uma dúvida no volume de mensagens.', minutesOffset: 0 },
      { from: 'lara', content: 'Que bom, Juliana! O plano cobre 50 mil mensagens/mês e o excedente é cobrado por pacote. Quer que eu simule com o volume de campanha de vocês?', minutesOffset: 1, responseTimeMs: 3600 },
      { from: 'user', content: 'Sim, considerando 3 mil leads por mês.', minutesOffset: 5 },
      { from: 'human', content: 'Juliana, é a Fê do comercial. Simulei aqui: com 3 mil leads vocês ficam em torno de 38 mil mensagens, dentro do plano.', minutesOffset: 22 },
      { from: 'user', content: 'Perfeito, levo pro board amanhã.', minutesOffset: 27 },
    ],
  },
  {
    contactKey: 'patricia', status: 'lara', channel: 'instagram', assignedTeam: 'vendas', tags: ['hot_lead'], startedDaysAgo: 1, startHour: 10,
    messages: [
      { from: 'user', content: 'Oi! Na Black Friday passada a gente perdeu venda por demora na resposta.', minutesOffset: 0 },
      { from: 'lara', content: 'Oi, Patrícia! Nessas horas a IA segura o pico: responde em segundos e só passa pro time quem está pronto pra comprar. Qual foi o volume no último pico?', minutesOffset: 1, responseTimeMs: 2400 },
      { from: 'user', content: 'Umas 4 mil mensagens em dois dias.', minutesOffset: 4 },
      { from: 'lara', content: 'Volume tranquilo pra plataforma. Te mando o comparativo de tempo de resposta antes e depois?', minutesOffset: 5, responseTimeMs: 2800 },
      { from: 'user', content: 'Manda! Já quero fechar antes da próxima campanha.', minutesOffset: 7 },
    ],
  },
  {
    contactKey: 'diego', status: 'paused', channel: 'whatsapp', assignedTeam: 'vendas', tags: ['follow_up'], startedDaysAgo: 4, startHour: 15,
    messages: [
      { from: 'user', content: 'Estamos avaliando duas ferramentas. Qual a diferença de vocês?', minutesOffset: 0 },
      { from: 'lara', content: 'Boa pergunta, Diego. A diferença principal é o agente aprender com as próprias conversas e o time revisar antes de publicar. Posso te enviar um comparativo objetivo?', minutesOffset: 1, responseTimeMs: 3300 },
      { from: 'user', content: 'Pode enviar. Volto a falar semana que vem.', minutesOffset: 6 },
      { from: 'human', content: 'Combinado, Diego. Pausei o acompanhamento automático e te procuro na segunda.', minutesOffset: 20 },
    ],
  },
  {
    contactKey: 'anderson', status: 'lara', channel: 'whatsapp', assignedTeam: 'suporte', tags: ['warm_lead'], startedDaysAgo: 5, startHour: 20,
    messages: [
      { from: 'user', content: 'Vocês atendem à noite? Meu pessoal manda mensagem depois das 19h.', minutesOffset: 0 },
      { from: 'lara', content: 'Atendo sim, Anderson — 24 horas por dia. Fora do horário comercial eu respondo e deixo o resumo pronto pro time na manhã seguinte.', minutesOffset: 1, responseTimeMs: 2100 },
      { from: 'user', content: 'Isso resolveria metade do meu problema.', minutesOffset: 3 },
      { from: 'lara', content: 'Então vale ver na prática. Amanhã às 9h consigo te mostrar o resumo automático que o time recebe.', minutesOffset: 4, responseTimeMs: 2600 },
    ],
  },
  {
    contactKey: 'leticia', status: 'lara', channel: 'whatsapp', assignedTeam: 'vendas', tags: ['interested'], startedDaysAgo: 0, startHour: 9,
    messages: [
      { from: 'user', content: 'Bom dia! Preciso saber se dá pra exportar o histórico das conversas.', minutesOffset: 0 },
      { from: 'lara', content: 'Bom dia, Letícia! Dá sim: exportação por período, com autor, canal e horário de cada mensagem. É pra atender auditoria?', minutesOffset: 1, responseTimeMs: 2200 },
      { from: 'user', content: 'Exatamente. Compliance exige guardar tudo por 5 anos.', minutesOffset: 3 },
      { from: 'lara', content: 'A retenção é configurável e cobre esse prazo. Quer que eu já agende uma conversa com o time de segurança?', minutesOffset: 4, responseTimeMs: 2700 },
      { from: 'user', content: 'Quero, pode ser sexta.', minutesOffset: 6 },
    ],
  },
  {
    contactKey: 'fernanda', status: 'lara', channel: 'whatsapp', assignedTeam: 'suporte', tags: ['demo_requested'], startedDaysAgo: 0, startHour: 13,
    messages: [
      { from: 'user', content: 'Oi! Queria entender o custo pra 4 clínicas.', minutesOffset: 0 },
      { from: 'lara', content: 'Oi, Fernanda! Nesse porte o plano fica por unidade, com desconto progressivo. Te mando a simulação por e-mail ainda hoje?', minutesOffset: 1, responseTimeMs: 3000 },
      { from: 'user', content: 'Pode mandar, obrigada!', minutesOffset: 2 },
    ],
  },
];

export const DEMO_APPOINTMENTS: DemoAppointmentSeed[] = [
  { contactKey: 'mariana', title: 'Demonstração — Lumen Retail', description: 'Apresentação do fluxo de pré-atendimento para o time de CX.', dayOffset: -3, time: '10:00', duration: 45, type: 'demo', status: 'completed', attendees: ['Mariana Duarte', 'Renata Farias'], createdDaysAgo: 6 },
  { contactKey: 'patricia', title: 'Fechamento — Bella Store', description: 'Alinhamento final de contrato e onboarding.', dayOffset: -1, time: '16:30', duration: 30, type: 'meeting', status: 'completed', attendees: ['Patrícia Lopes', 'Fernanda Alves'], createdDaysAgo: 4 },
  { contactKey: 'camila', title: 'Demonstração — Clínica Vitta', description: 'Mostrar remarcação automática integrada à agenda.', dayOffset: 0, time: '15:00', duration: 45, type: 'demo', status: 'scheduled', attendees: ['Camila Ferraz', 'Caio Bastos'], createdDaysAgo: 2 },
  { contactKey: 'bruno', title: 'Avaliação técnica — Quantum Tech', description: 'Arquitetura, segurança e política de retenção.', dayOffset: 1, time: '11:00', duration: 60, type: 'meeting', status: 'scheduled', attendees: ['Bruno Tavares', 'Renata Farias'], createdDaysAgo: 2 },
  { contactKey: 'juliana', title: 'Apresentação ao board — Eduka Group', description: 'Defesa da proposta comercial com diretoria.', dayOffset: 2, time: '09:30', duration: 60, type: 'meeting', status: 'scheduled', attendees: ['Juliana Prado', 'Fernanda Alves'], createdDaysAgo: 1 },
  { contactKey: 'leticia', title: 'Sessão de segurança — FinTrack Pay', description: 'Trilha de auditoria e exportação de histórico.', dayOffset: 3, time: '14:00', duration: 45, type: 'support', status: 'scheduled', attendees: ['Letícia Moraes', 'Renata Farias'], createdDaysAgo: 0 },
  { contactKey: 'anderson', title: 'Follow-up — AgroSafra', description: 'Mostrar resumo automático do plantão noturno.', dayOffset: 4, time: '09:00', duration: 30, type: 'followup', status: 'scheduled', attendees: ['Anderson Reis', 'Caio Bastos'], createdDaysAgo: 1 },
  { contactKey: 'fernanda', title: 'Demonstração — Rocha Odontologia', description: 'Agenda automática para 4 unidades.', dayOffset: 6, time: '10:30', duration: 45, type: 'demo', status: 'scheduled', attendees: ['Fernanda Rocha', 'Caio Bastos'], createdDaysAgo: 0 },
];

export const DEMO_TEAM_MEMBERS: DemoTeamMemberSeed[] = [
  { name: 'Caio Bastos', emailLocal: 'caio.bastos', role: 'admin', status: 'active', team: 'Vendas', functionName: 'Closer', weight: 3 },
  { name: 'Renata Farias', emailLocal: 'renata.farias', role: 'manager', status: 'active', team: 'Suporte', functionName: 'CS', weight: 2 },
  { name: 'Fernanda Alves', emailLocal: 'fernanda.alves', role: 'agent', status: 'active', team: 'Vendas', functionName: 'SDR', weight: 2 },
  { name: 'Paulo Vidal', emailLocal: 'paulo.vidal', role: 'agent', status: 'active', team: 'Vendas', functionName: 'SDR', weight: 1 },
  { name: 'Carla Bastos', emailLocal: 'carla.bastos', role: 'agent', status: 'invited', team: 'Suporte', functionName: 'CS', weight: 1 },
];

/** Data deslocada em dias a partir de agora, preservando a hora atual. */
export function daysFromNow(days: number, now: Date = new Date()): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date;
}

/** Data/hora local convertida em ISO, útil para semear timestamps. */
export function atTime(days: number, hour: number, minute = 0, now: Date = new Date()): Date {
  const date = daysFromNow(days, now);
  date.setHours(hour, minute, 0, 0);
  return date;
}

/** `YYYY-MM-DD` no fuso local (a coluna `date` não guarda fuso). */
export function toDateOnly(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
