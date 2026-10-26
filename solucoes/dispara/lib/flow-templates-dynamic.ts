/**
 * Templates de WhatsApp Flows Dinâmicos
 *
 * Flows que usam data_exchange para buscar dados em tempo real.
 * Requer endpoint configurado com criptografia RSA/AES.
 */

/**
 * Flow JSON para agendamento dinâmico
 *
 * Fluxo:
 * 1. BOOKING_START - Usuário escolhe serviço e data
 * 2. SELECT_TIME - Usuário escolhe horário (buscado do Calendar)
 * 3. CUSTOMER_INFO - Usuário preenche dados
 * 4. SUCCESS - Confirmação
 */
export const DYNAMIC_BOOKING_FLOW_JSON = {
  version: '6.0',
  data_api_version: '3.0',
  routing_model: {
    BOOKING_START: ['SELECT_TIME'],
    SELECT_TIME: ['CUSTOMER_INFO', 'BOOKING_START'],
    CUSTOMER_INFO: ['SUCCESS', 'SELECT_TIME'],
    SUCCESS: [],
  },
  screens: [
    // Tela 1: Selecao de serviço e data
    {
      id: 'BOOKING_START',
      title: '${data.title}',
      data: {
        title: { type: 'string', __example__: 'Agendar Atendimento' },
        subtitle: { type: 'string', __example__: 'Escolha o serviço e a data' },
        services: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
            },
          },
          __example__: [
            { id: 'consulta', title: 'Consulta' },
            { id: 'visita', title: 'Visita' },
          ],
        },
        dates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
            },
          },
          __example__: [
            { id: '2024-01-15', title: 'Seg, 15 de Jan' },
            { id: '2024-01-16', title: 'Ter, 16 de Jan' },
          ],
        },
        error_message: { type: 'string', __example__: 'Nenhum horário disponível para esta data. Escolha outra data.' },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Form',
            name: 'booking_form',
            children: [
              {
                type: 'TextSubheading',
                text: '${data.subtitle}',
              },
              {
                type: 'Dropdown',
                name: 'selected_service',
                label: 'Tipo de Atendimento',
                required: true,
                'data-source': '${data.services}',
              },
              {
                type: 'Dropdown',
                name: 'selected_date',
                label: 'Data',
                required: true,
                'data-source': '${data.dates}',
              },
              {
                type: 'TextCaption',
                text: '${data.error_message}',
                visible: '${data.error_message}',
                __editor_label: 'Mensagem de erro (quando não houver horários)',
              },
              {
                type: 'Footer',
                label: 'Ver Horários',
                'on-click-action': {
                  name: 'data_exchange',
                  payload: {
                    selected_service: '${form.selected_service}',
                    selected_date: '${form.selected_date}',
                  },
                },
              },
            ],
          },
        ],
      },
    },
    // Tela 2: Selecao de horário
    {
      id: 'SELECT_TIME',
      title: '${data.title}',
      data: {
        title: { type: 'string', __example__: 'Escolha o Horário' },
        subtitle: { type: 'string', __example__: 'Horários disponíveis' },
        selected_service: { type: 'string', __example__: 'consulta' },
        selected_date: { type: 'string', __example__: '2024-01-15' },
        slots: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
            },
          },
          __example__: [
            { id: '2024-01-15T09:00:00Z', title: '09:00' },
            { id: '2024-01-15T10:00:00Z', title: '10:00' },
          ],
        },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Form',
            name: 'time_form',
            children: [
              {
                type: 'TextSubheading',
                text: '${data.subtitle}',
              },
              {
                type: 'Dropdown',
                name: 'selected_slot',
                label: 'Horário',
                required: true,
                'data-source': '${data.slots}',
              },
              {
                type: 'Footer',
                label: 'Continuar',
                'on-click-action': {
                  name: 'data_exchange',
                  payload: {
                    selected_service: '${data.selected_service}',
                    selected_date: '${data.selected_date}',
                    selected_slot: '${form.selected_slot}',
                  },
                },
              },
            ],
          },
        ],
      },
      refresh_on_back: true,
    },
    // Tela 3: Dados do cliente
    {
      id: 'CUSTOMER_INFO',
      title: '${data.title}',
      data: {
        title: { type: 'string', __example__: 'Seus Dados' },
        subtitle: { type: 'string', __example__: 'Preencha seus dados' },
        selected_service: { type: 'string', __example__: 'consulta' },
        selected_date: { type: 'string', __example__: '2024-01-15' },
        selected_slot: { type: 'string', __example__: '2024-01-15T09:00:00Z' },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Form',
            name: 'customer_form',
            children: [
              {
                type: 'TextSubheading',
                text: '${data.subtitle}',
              },
              {
                type: 'TextInput',
                name: 'customer_name',
                label: 'Seu Nome',
                required: true,
                'input-type': 'text',
              },
              {
                type: 'TextInput',
                name: 'customer_phone',
                label: 'Telefone (opcional)',
                required: false,
                'input-type': 'phone',
              },
              {
                type: 'TextArea',
                name: 'notes',
                label: 'Observações (opcional)',
                required: false,
              },
              {
                type: 'Footer',
                label: 'Confirmar Agendamento',
                'on-click-action': {
                  name: 'data_exchange',
                  payload: {
                    selected_service: '${data.selected_service}',
                    selected_date: '${data.selected_date}',
                    selected_slot: '${data.selected_slot}',
                    customer_name: '${form.customer_name}',
                    customer_phone: '${form.customer_phone}',
                    notes: '${form.notes}',
                  },
                },
              },
            ],
          },
        ],
      },
    },
    // Tela 4: Confirmação (terminal)
    {
      id: 'SUCCESS',
      title: 'Confirmado!',
      terminal: true,
      success: true,
      data: {
        message: { type: 'string', __example__: 'Agendamento confirmado!' },
        event_id: { type: 'string', __example__: 'abc123' },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'TextBody',
            text: '${data.message}',
          },
          {
            type: 'Footer',
            label: 'Fechar',
            'on-click-action': {
              name: 'complete',
              payload: {
                event_id: '${data.event_id}',
                status: 'confirmed',
                confirmation_title: '${data.message}',
              },
            },
          },
        ],
      },
    },
  ],
}

/**
 * Template de agendamento dinamico para o flow-templates
 */
// #region agent log
const _successScreenChildren = (DYNAMIC_BOOKING_FLOW_JSON as any).screens?.find?.((s:any)=>s.id==='SUCCESS')?.layout?.children
if (typeof window !== 'undefined') {
}
// #endregion
export const dynamicBookingTemplate = {
  key: 'agendamento_dinamico_v1',
  name: 'Agendamento Dinâmico (Google Calendar)',
  description: 'Agendamento em tempo real com integração ao Google Calendar. Requer endpoint configurado.',
  category: 'booking',
  requiresEndpoint: true,
  flow_json: DYNAMIC_BOOKING_FLOW_JSON,
  mapping: {
    customFields: {
      booking_service: 'selected_service',
      booking_date: 'selected_date',
      booking_time: 'selected_slot',
      booking_notes: 'notes',
    },
    contactFields: {
      name: 'customer_name',
    },
  },
}
