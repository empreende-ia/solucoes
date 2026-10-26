import type { BookingFlowConfigV1 } from '@/lib/dynamic-flow'
import { generateBookingDynamicFlowJson, getDefaultBookingFlowConfig } from '@/lib/dynamic-flow'

export type FlowMappingV1 = {
  version: 1
  contact?: {
    /** Nome do campo do Flow (response_json) que deve atualizar contacts.name */
    nameField?: string
    /** Nome do campo do Flow (response_json) que deve atualizar contacts.email */
    emailField?: string
  }
  /** custom_fields do contato: { chave_no_dispara: nome_do_campo_no_flow } */
  customFields?: Record<string, string>
}

export type FlowFormSpecV1 = {
  version: 1
  screenId: string
  title: string
  intro?: string
  submitLabel: string
  fields: Array<{
    id: string
    name: string
    label: string
    type: 'short_text' | 'long_text' | 'email' | 'phone' | 'number' | 'date' | 'dropdown' | 'single_choice' | 'multi_choice' | 'optin'
    required: boolean
    placeholder?: string
    options?: Array<{ id: string; title: string }>
    text?: string
  }>
}

export type FlowTemplate = {
  key: string
  name: string
  description: string
  /** Flow JSON no formato exigido pela Meta (armazenado como JSONB). */
  flowJson: Record<string, unknown>
  /** Mapping padrão para salvar respostas no Dispara. */
  defaultMapping: FlowMappingV1
  /** Form spec pré-definido (opcional). Se presente, usado pelo builder em vez de converter flowJson. */
  form?: FlowFormSpecV1
  /** Indica se é um template dinâmico (usa data_exchange). */
  isDynamic?: boolean
  /** Config específico para templates dinâmicos. */
  dynamicConfig?: BookingFlowConfigV1
}

// Observação importante:
// - Templates simples não usam data_exchange.
// - A Meta valida o Flow JSON no publish. Aqui guardamos um ponto de partida.

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    key: 'feedback_v1',
    name: 'Feedback simples',
    description: 'Avaliação rápida com escolha única e comentário opcional.',
    flowJson: {
      version: '7.3',
      screens: [
        {
          id: 'FEEDBACK',
          title: 'Feedback',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'BasicText',
                text: 'Você recomendaria a gente para um amigo?',
              },
              {
                type: 'RadioButtonsGroup',
                name: 'recommend',
                label: 'Escolha uma opção',
                required: true,
                'data-source': [
                  { id: 'yes', title: 'Sim' },
                  { id: 'no', title: 'Não' },
                ],
              },
              {
                type: 'TextArea',
                name: 'comment',
                label: 'Como podemos melhorar? (opcional)',
                required: false,
              },
              {
                type: 'Footer',
                label: 'Enviar',
                'on-click-action': { name: 'complete' },
              },
            ],
          },
        },
      ],
    },
    defaultMapping: {
      version: 1,
      customFields: {
        feedback_recommend: 'recommend',
        feedback_comment: 'comment',
      },
    },
  },
  {
    key: 'lead_interest_v1',
    name: 'Interesse de compra',
    description: 'Coleta nome, telefone e interesse principal.',
    flowJson: {
      version: '7.3',
      screens: [
        {
          id: 'INTERESSE',
          title: 'Interesse',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'BasicText',
                text: 'Conte pra gente o que você procura.',
              },
              {
                type: 'TextInput',
                name: 'full_name',
                label: 'Nome',
                required: true,
              },
              {
                type: 'TextInput',
                name: 'phone',
                label: 'Telefone',
                required: true,
                'input-type': 'phone',
              },
              {
                type: 'Dropdown',
                name: 'interest',
                label: 'Interesse',
                required: true,
                'data-source': [
                  { id: 'produtos', title: 'Produtos' },
                  { id: 'servicos', title: 'Serviços' },
                  { id: 'planos', title: 'Planos' },
                  { id: 'outros', title: 'Outros' },
                ],
              },
              {
                type: 'Footer',
                label: 'Continuar',
                'on-click-action': { name: 'complete' },
              },
            ],
          },
        },
      ],
    },
    defaultMapping: {
      version: 1,
      contact: {
        nameField: 'full_name',
      },
      customFields: {
        lead_phone: 'phone',
        lead_interest: 'interest',
      },
    },
  },
  {
    key: 'support_request_v1',
    name: 'Suporte ao cliente',
    description: 'Coleta assunto, prioridade e descrição do problema.',
    flowJson: {
      version: '7.3',
      screens: [
        {
          id: 'SUPORTE',
          title: 'Suporte',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'BasicText',
                text: 'Vamos entender seu problema para ajudar mais rápido.',
              },
              {
                type: 'Dropdown',
                name: 'topic',
                label: 'Assunto',
                required: true,
                'data-source': [
                  { id: 'pagamento', title: 'Pagamento' },
                  { id: 'entrega', title: 'Entrega' },
                  { id: 'acesso', title: 'Acesso' },
                  { id: 'outros', title: 'Outros' },
                ],
              },
              {
                type: 'RadioButtonsGroup',
                name: 'priority',
                label: 'Prioridade',
                required: true,
                'data-source': [
                  { id: 'baixa', title: 'Baixa' },
                  { id: 'media', title: 'Média' },
                  { id: 'alta', title: 'Alta' },
                ],
              },
              {
                type: 'TextArea',
                name: 'details',
                label: 'Descreva o problema',
                required: true,
              },
              {
                type: 'Footer',
                label: 'Enviar',
                'on-click-action': { name: 'complete' },
              },
            ],
          },
        },
      ],
    },
    defaultMapping: {
      version: 1,
      customFields: {
        support_topic: 'topic',
        support_priority: 'priority',
        support_details: 'details',
      },
    },
  },
  {
    key: 'pesquisa_rapida_v1',
    name: 'Pesquisa rápida',
    description: 'Perguntas curtas com múltipla escolha e observações.',
    flowJson: {
      version: '7.3',
      screens: [
        {
          id: 'PESQUISA',
          title: 'Pesquisa',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'BasicText',
                text: 'Ajude a melhorar nossa experiência.',
              },
              {
                type: 'CheckboxGroup',
                name: 'topics',
                label: 'Quais temas você gostaria de ver?',
                required: false,
                'data-source': [
                  { id: 'novidades', title: 'Novidades' },
                  { id: 'descontos', title: 'Descontos' },
                  { id: 'tutorials', title: 'Tutoriais' },
                  { id: 'eventos', title: 'Eventos' },
                ],
              },
              {
                type: 'TextArea',
                name: 'notes',
                label: 'Comentários finais (opcional)',
                required: false,
              },
              {
                type: 'Footer',
                label: 'Enviar',
                'on-click-action': { name: 'complete' },
              },
            ],
          },
        },
      ],
    },
    defaultMapping: {
      version: 1,
      customFields: {
        survey_topics: 'topics',
        survey_notes: 'notes',
      },
    },
  },
  {
    key: 'lead_cadastro_v1',
    name: 'Lead / Cadastro',
    description: 'Coleta nome, e-mail e interesse. Ideal para capturar lead rápido.',
    flowJson: {
      version: '7.3',
      screens: [
        {
          id: 'CADASTRO',
          title: 'Cadastro',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'RichText',
                text: '**Vamos te cadastrar rapidinho**\n\nPreencha os dados abaixo:',
              },
              {
                type: 'TextEntry',
                name: 'lead_name',
                label: 'Nome',
                required: true,
              },
              {
                type: 'TextEntry',
                name: 'lead_email',
                label: 'E-mail',
                required: true,
              },
              {
                type: 'Dropdown',
                name: 'lead_interest',
                label: 'Qual seu interesse?',
                required: false,
                options: [
                  { id: 'produto', title: 'Produto' },
                  { id: 'servico', title: 'Serviço' },
                  { id: 'orcamento', title: 'Orçamento' },
                  { id: 'outro', title: 'Outro' },
                ],
              },
              {
                type: 'OptIn',
                name: 'lead_optin',
                text: 'Quero receber mensagens sobre novidades e promoções.',
              },
              {
                type: 'Footer',
                label: 'Enviar',
                'on-click-action': { name: 'complete' },
              },
            ],
          },
        },
      ],
    },
    defaultMapping: {
      version: 1,
      contact: {
        nameField: 'lead_name',
        emailField: 'lead_email',
      },
      customFields: {
        lead_interest: 'lead_interest',
        lead_optin: 'lead_optin',
      },
    },
  },
  {
    key: 'agendamento_v1',
    name: 'Agendamento',
    description: 'Coleta serviço, data e horário. Sem validação de agenda ainda.',
    flowJson: {
      version: '7.3',
      screens: [
        {
          id: 'AGENDAMENTO',
          title: 'Agendamento',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'BasicText',
                text: 'Escolha as opções abaixo para solicitar um agendamento.',
              },
              {
                type: 'Dropdown',
                name: 'service',
                label: 'Serviço',
                required: true,
                options: [
                  { id: 'consulta', title: 'Consulta' },
                  { id: 'visita', title: 'Visita' },
                  { id: 'suporte', title: 'Suporte' },
                ],
              },
              {
                type: 'DatePicker',
                name: 'date',
                label: 'Data',
                required: true,
              },
              {
                type: 'Dropdown',
                name: 'time',
                label: 'Horário',
                required: true,
                options: [
                  { id: '09:00', title: '09:00' },
                  { id: '10:00', title: '10:00' },
                  { id: '11:00', title: '11:00' },
                  { id: '14:00', title: '14:00' },
                  { id: '15:00', title: '15:00' },
                  { id: '16:00', title: '16:00' },
                ],
              },
              {
                type: 'TextEntry',
                name: 'notes',
                label: 'Observações (opcional)',
                required: false,
              },
              {
                type: 'Footer',
                label: 'Solicitar agendamento',
                'on-click-action': { name: 'complete' },
              },
            ],
          },
        },
      ],
    },
    defaultMapping: {
      version: 1,
      customFields: {
        appointment_service: 'service',
        appointment_date: 'date',
        appointment_time: 'time',
        appointment_notes: 'notes',
      },
    },
  },
  {
    key: 'pesquisa_nps_v1',
    name: 'Pesquisa / NPS',
    description: 'Coleta score NPS (0-10) e comentário opcional.',
    flowJson: {
      version: '7.3',
      screens: [
        {
          id: 'NPS',
          title: 'Pesquisa',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'BasicText',
                text: 'De 0 a 10, o quanto você recomendaria a gente para um amigo?',
              },
              {
                type: 'ChipsSelector',
                name: 'nps_score',
                label: 'Nota',
                required: true,
                options: [
                  { id: '0', title: '0' },
                  { id: '1', title: '1' },
                  { id: '2', title: '2' },
                  { id: '3', title: '3' },
                  { id: '4', title: '4' },
                  { id: '5', title: '5' },
                  { id: '6', title: '6' },
                  { id: '7', title: '7' },
                  { id: '8', title: '8' },
                  { id: '9', title: '9' },
                  { id: '10', title: '10' },
                ],
              },
              {
                type: 'TextEntry',
                name: 'nps_comment',
                label: 'Quer contar o motivo? (opcional)',
                required: false,
              },
              {
                type: 'Footer',
                label: 'Enviar pesquisa',
                'on-click-action': { name: 'complete' },
              },
            ],
          },
        },
      ],
    },
    defaultMapping: {
      version: 1,
      customFields: {
        nps_score: 'nps_score',
        nps_comment: 'nps_comment',
      },
    },
  },
  // Template dinâmico para agendamento com Google Calendar
  {
    key: 'agendamento_dinamico_v1',
    name: 'Agendamento (Google Calendar)',
    description: 'Agendamento em tempo real com slots do Google Calendar.',
    isDynamic: true,
    dynamicConfig: getDefaultBookingFlowConfig(),
    // Form simplificado para o builder - coleta dados básicos do cliente
    // O Flow JSON completo com data_exchange é usado ao publicar
    form: {
      version: 1,
      screenId: 'BOOKING',
      title: 'Agendamento',
      intro: 'Agendamento integrado com Google Calendar. Os horários disponíveis serão buscados em tempo real.',
      submitLabel: 'Confirmar',
      fields: [
        { id: 'customer_name', name: 'customer_name', label: 'Nome', type: 'short_text', required: true },
        { id: 'customer_phone', name: 'customer_phone', label: 'Telefone', type: 'phone', required: false },
        { id: 'notes', name: 'notes', label: 'Observações', type: 'long_text', required: false },
      ],
    },
    flowJson: generateBookingDynamicFlowJson(),
    defaultMapping: {
      version: 1,
      contact: {
        nameField: 'customer_name',
      },
      customFields: {
        booking_service: 'selected_service',
        booking_date: 'selected_date',
        booking_time: 'selected_slot',
        booking_notes: 'notes',
      },
    },
  },
]

export function getFlowTemplateByKey(key: string): FlowTemplate | null {
  const t = FLOW_TEMPLATES.find((x) => x.key === key)
  return t || null
}
