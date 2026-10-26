/**
 * WhatsApp Cloud API Error Codes Mapping
 * 
 * Referência: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/
 * Atualizado: 2025-12-02
 * 
 * Categorias:
 * - payment: Problemas de pagamento/billing
 * - rate_limit: Limite de taxa excedido
 * - auth: Autenticação/permissão
 * - template: Problemas com template
 * - recipient: Problemas com destinatário (opt-out, não WhatsApp, etc)
 * - media: Problemas com mídia
 * - system: Erros internos da Meta
 * - integrity: Violações de política/integridade
 * - registration: Problemas com registro de número
 * - unknown: Erros não mapeados
 */

export type ErrorCategory =
  | 'payment'
  | 'rate_limit'
  | 'auth'
  | 'template'
  | 'recipient'
  | 'media'
  | 'system'
  | 'integrity'
  | 'registration'
  | 'unknown'

export interface WhatsAppError {
  code: number
  category: ErrorCategory
  title: string
  userMessage: string
  action: string
  retryable: boolean
}

/**
 * Mapeamento completo de códigos de erro do WhatsApp Cloud API
 */
export const WHATSAPP_ERRORS: Record<number, WhatsAppError> = {
  // ============================================
  // PAGAMENTO / BILLING
  // ============================================
  131042: {
    code: 131042,
    category: 'payment',
    title: 'Business eligibility payment issue',
    userMessage: 'Pagamento pendente na conta Meta. Mensagens não serão entregues.',
    action: 'Regularize o pagamento no Meta Business Suite.',
    retryable: false,
  },

  // ============================================
  // RATE LIMIT / THROTTLING
  // ============================================
  130429: {
    code: 130429,
    category: 'rate_limit',
    title: 'Rate limit hit',
    userMessage: 'Limite de taxa/throughput da Cloud API atingido (muitas mensagens em pouco tempo).',
    action: 'Aplique backoff (exponencial) e reduza o throughput. Evite retentar em loop; use fila e reenvie mais tarde.',
    retryable: true,
  },
  131056: {
    code: 131056,
    category: 'rate_limit',
    title: 'Pair rate limit hit',
    userMessage: 'Muitas mensagens para o mesmo número em curto período.',
    action: 'Aguarde 6 segundos entre mensagens para o mesmo contato.',
    retryable: true,
  },
  131048: {
    code: 131048,
    category: 'rate_limit',
    title: 'Spam rate limit hit',
    userMessage: 'Conta temporariamente limitada por comportamento de spam.',
    action: 'Reduza a frequência de envios e aguarde algumas horas.',
    retryable: true,
  },
  131057: {
    code: 131057,
    category: 'rate_limit',
    title: 'Account in maintenance mode',
    userMessage: 'Conta em modo de manutenção.',
    action: 'Aguarde a Meta concluir a manutenção.',
    retryable: true,
  },

  // ============================================
  // TEMPLATE
  // ============================================
  132000: {
    code: 132000,
    category: 'template',
    title: 'Template param count mismatch',
    userMessage: 'Quantidade de parâmetros do template incorreta.',
    action: 'Verifique os parâmetros do template.',
    retryable: false,
  },
  132001: {
    code: 132001,
    category: 'template',
    title: 'Template does not exist',
    userMessage: 'Template não encontrado ou não aprovado.',
    action: 'Verifique se o template existe e está aprovado.',
    retryable: false,
  },
  132005: {
    code: 132005,
    category: 'template',
    title: 'Template hydrated text too long',
    userMessage: 'Texto do template excede o limite de caracteres.',
    action: 'Reduza o tamanho dos parâmetros.',
    retryable: false,
  },
  132007: {
    code: 132007,
    category: 'template',
    title: 'Template format character policy violated',
    userMessage: 'Template contém caracteres não permitidos.',
    action: 'Remova caracteres especiais ou formatação inválida.',
    retryable: false,
  },
  132012: {
    code: 132012,
    category: 'template',
    title: 'Template param format mismatch',
    userMessage: 'Formato de parâmetro incorreto.',
    action: 'Verifique o tipo dos parâmetros (text, currency, date_time).',
    retryable: false,
  },
  132015: {
    code: 132015,
    category: 'template',
    title: 'Template paused',
    userMessage: 'Template pausado devido à baixa qualidade.',
    action: 'Melhore a qualidade do template ou use outro.',
    retryable: false,
  },
  132016: {
    code: 132016,
    category: 'template',
    title: 'Template disabled',
    userMessage: 'Template desabilitado pela Meta.',
    action: 'Reative o template ou use outro.',
    retryable: false,
  },
  132068: {
    code: 132068,
    category: 'template',
    title: 'Flow is blocked',
    userMessage: 'Fluxo do WhatsApp bloqueado.',
    action: 'Verifique o status do fluxo no Meta Business Suite.',
    retryable: false,
  },
  132069: {
    code: 132069,
    category: 'template',
    title: 'Flow is throttled',
    userMessage: 'Fluxo do WhatsApp com limite de taxa.',
    action: 'Aguarde antes de enviar mais mensagens com este fluxo.',
    retryable: true,
  },

  // ============================================
  // DESTINATÁRIO
  // ============================================
  131021: {
    code: 131021,
    category: 'recipient',
    title: 'Recipient cannot be sender',
    userMessage: 'Não é possível enviar mensagem para o próprio número.',
    action: 'Envie para um número diferente do remetente.',
    retryable: false,
  },
  131047: {
    code: 131047,
    category: 'recipient',
    title: 'Re-engagement message required',
    userMessage: 'Fora da janela de 24h. Necessário usar template.',
    action: 'Use uma mensagem de template em vez de texto livre.',
    retryable: false,
  },
  131050: {
    code: 131050,
    category: 'recipient',
    title: 'User opted out of marketing messages',
    userMessage: 'Contato optou por não receber mensagens de marketing.',
    action: 'Remova este contato de campanhas de marketing.',
    retryable: false,
  },
  131051: {
    code: 131051,
    category: 'recipient',
    title: 'Unsupported message type',
    userMessage: 'Tipo de mensagem não suportado.',
    action: 'Use um tipo de mensagem compatível.',
    retryable: false,
  },
  470: {
    code: 470,
    category: 'recipient',
    title: 'Outside support window for freeform messages',
    userMessage: 'Fora da janela de 24h para mensagens livres.',
    action: 'Use um template de mensagem aprovado.',
    retryable: false,
  },
  480: {
    code: 480,
    category: 'recipient',
    title: 'Identity change detected',
    userMessage: 'Contato trocou de número ou reinstalou WhatsApp.',
    action: 'Verifique o número do contato.',
    retryable: false,
  },

  // ============================================
  // MÍDIA
  // ============================================
  131052: {
    code: 131052,
    category: 'media',
    title: 'Media download error',
    userMessage: 'Erro ao baixar mídia.',
    action: 'Verifique se a URL da mídia está acessível.',
    retryable: true,
  },
  131053: {
    code: 131053,
    category: 'media',
    title: 'Media upload error',
    userMessage: 'Erro ao fazer upload da mídia.',
    action: 'Tente novamente com um arquivo menor ou diferente formato.',
    retryable: true,
  },
  131054: {
    code: 131054,
    category: 'media',
    title: 'Media file not found',
    userMessage: 'Arquivo de mídia não encontrado.',
    action: 'Faça upload novamente da mídia.',
    retryable: true,
  },

  // ============================================
  // AUTENTICAÇÃO / PERMISSÕES
  // ============================================
  190: {
    code: 190,
    category: 'auth',
    title: 'Access token expired',
    userMessage: 'Token de acesso expirado.',
    action: 'Gere um novo token de acesso.',
    retryable: false,
  },
  131031: {
    code: 131031,
    category: 'auth',
    title: 'Account locked',
    userMessage: 'Conta bloqueada pela Meta.',
    action: 'Entre em contato com o suporte da Meta.',
    retryable: false,
  },
  131045: {
    code: 131045,
    category: 'auth',
    title: 'Incorrect certificate',
    userMessage: 'Certificado de autenticação incorreto.',
    action: 'Verifique as configurações de certificado.',
    retryable: false,
  },
  131046: {
    code: 131046,
    category: 'auth',
    title: 'Two-step verification PIN required',
    userMessage: 'PIN de verificação em duas etapas necessário.',
    action: 'Configure o PIN no Meta Business Suite.',
    retryable: false,
  },
  131049: {
    code: 131049,
    category: 'rate_limit',
    title: 'Message not delivered for healthy ecosystem',
    userMessage: 'Mensagem não entregue para manter um engajamento saudável do ecossistema (limites dinâmicos).',
    action: 'Reduza volume e melhore relevância/segmentação. Para mensagens de marketing, aguarde 24h antes de retentar para o mesmo usuário.',
    retryable: true,
  },
  10: {
    code: 10,
    category: 'auth',
    title: 'Permission denied',
    userMessage: 'Permissão negada para esta operação.',
    action: 'Verifique as permissões do token de acesso.',
    retryable: false,
  },
  100: {
    code: 100,
    category: 'auth',
    title: 'Invalid parameter',
    userMessage: 'Parâmetro inválido na requisição.',
    action: 'Verifique os parâmetros enviados.',
    retryable: false,
  },
  137000: {
    code: 137000,
    category: 'auth',
    title: 'Identity key mismatch',
    userMessage: 'Chave de identidade não corresponde.',
    action: 'Verifique a identidade do destinatário.',
    retryable: false,
  },

  // ============================================
  // SISTEMA / ERROS GENÉRICOS
  // ============================================
  131000: {
    code: 131000,
    category: 'system',
    title: 'Something went wrong',
    userMessage: 'Erro interno da Meta.',
    action: 'Tente novamente em alguns minutos.',
    retryable: true,
  },
  131026: {
    code: 131026,
    category: 'system',
    title: 'Message undeliverable',
    userMessage: 'Mensagem não pôde ser entregue (o WhatsApp pode não informar o motivo exato em alguns cenários).',
    action: 'Peça ao contato para: (1) confirmar que consegue enviar mensagem para seu número; (2) verificar se não bloqueou; (3) aceitar os Termos mais recentes; (4) atualizar o WhatsApp para a versão mais recente.',
    retryable: true,
  },
  500: {
    code: 500,
    category: 'system',
    title: 'Internal server error',
    userMessage: 'Erro interno do servidor.',
    action: 'Tente novamente.',
    retryable: true,
  },
  501: {
    code: 501,
    category: 'system',
    title: 'Unknown message type',
    userMessage: 'Tipo de mensagem desconhecido.',
    action: 'Use um tipo de mensagem válido.',
    retryable: false,
  },
  503: {
    code: 503,
    category: 'system',
    title: 'Service unavailable',
    userMessage: 'Serviço temporariamente indisponível.',
    action: 'Aguarde e tente novamente.',
    retryable: true,
  },
  1: {
    code: 1,
    category: 'system',
    title: 'API Unknown',
    userMessage: 'Erro desconhecido na API.',
    action: 'Tente novamente ou contate o suporte.',
    retryable: true,
  },
  2: {
    code: 2,
    category: 'system',
    title: 'API Service',
    userMessage: 'Serviço da API temporariamente indisponível.',
    action: 'Aguarde alguns minutos e tente novamente.',
    retryable: true,
  },
  4: {
    code: 4,
    category: 'rate_limit',
    title: 'API Too Many Calls',
    userMessage: 'Muitas chamadas à API.',
    action: 'Reduza a frequência de requisições.',
    retryable: true,
  },
  17: {
    code: 17,
    category: 'rate_limit',
    title: 'API User Too Many Calls',
    userMessage: 'Usuário excedeu o limite de chamadas.',
    action: 'Aguarde antes de fazer novas requisições.',
    retryable: true,
  },
  80007: {
    code: 80007,
    category: 'rate_limit',
    title: 'Rate limit on Cloud API',
    userMessage: 'Limite de taxa da Cloud API atingido.',
    action: 'Reduza a frequência de chamadas à API.',
    retryable: true,
  },
  133016: {
    code: 133016,
    category: 'rate_limit',
    title: 'Incompliant message send rate',
    userMessage: 'Taxa de envio de mensagens excede limites permitidos.',
    action: 'Ajuste a velocidade de envio conforme seu tier.',
    retryable: true,
  },

  // ============================================
  // INTEGRIDADE / POLÍTICAS
  // ============================================
  368: {
    code: 368,
    category: 'integrity',
    title: 'Temporarily blocked for policies violations',
    userMessage: 'Conta temporariamente bloqueada por violar políticas.',
    action: 'Revise as políticas do WhatsApp e aguarde desbloqueio.',
    retryable: false,
  },
  130497: {
    code: 130497,
    category: 'integrity',
    title: 'Business account locked',
    userMessage: 'Conta comercial bloqueada por violação de políticas.',
    action: 'Contate o suporte da Meta para resolver.',
    retryable: false,
  },

  // ============================================
  // REGISTRO / MIGRAÇÃO DE NÚMERO
  // ============================================
  2388001: {
    code: 2388001,
    category: 'registration',
    title: 'Phone number migration in progress',
    userMessage: 'Migração do número de telefone em andamento.',
    action: 'Aguarde a conclusão da migração.',
    retryable: true,
  },
  2388012: {
    code: 2388012,
    category: 'registration',
    title: 'Phone number already registered',
    userMessage: 'Número de telefone já registrado em outra conta.',
    action: 'Use um número diferente ou transfira o existente.',
    retryable: false,
  },
  2388091: {
    code: 2388091,
    category: 'registration',
    title: 'Phone number verification failed',
    userMessage: 'Verificação do número de telefone falhou.',
    action: 'Tente verificar novamente com código correto.',
    retryable: true,
  },
  2388093: {
    code: 2388093,
    category: 'registration',
    title: 'Phone number not eligible',
    userMessage: 'Número não elegível para registro.',
    action: 'Use um número de telefone válido e não VOIP.',
    retryable: false,
  },
  2388103: {
    code: 2388103,
    category: 'registration',
    title: 'Phone number registration limit reached',
    userMessage: 'Limite de registros de números atingido.',
    action: 'Remova números antigos ou contate suporte.',
    retryable: false,
  },
  2494100: {
    code: 2494100,
    category: 'registration',
    title: 'Phone number not linked to WABA',
    userMessage: 'Número não vinculado à conta WABA.',
    action: 'Vincule o número no Meta Business Suite.',
    retryable: false,
  },

  // ============================================
  // CRIAÇÃO DE TEMPLATE
  // ============================================
  2388040: {
    code: 2388040,
    category: 'template',
    title: 'Character limit exceeded',
    userMessage: 'Um campo do template excedeu o limite de caracteres.',
    action: 'Reduza o tamanho do texto no campo indicado.',
    retryable: false,
  },
  2388047: {
    code: 2388047,
    category: 'template',
    title: 'Header format incorrect',
    userMessage: 'Formato do cabeçalho da mensagem incorreto.',
    action: 'Verifique a formatação do header do template.',
    retryable: false,
  },
  2388072: {
    code: 2388072,
    category: 'template',
    title: 'Body format incorrect',
    userMessage: 'Formato do corpo da mensagem incorreto.',
    action: 'Verifique a formatação do body do template.',
    retryable: false,
  },
  2388073: {
    code: 2388073,
    category: 'template',
    title: 'Footer format incorrect',
    userMessage: 'Formato do rodapé da mensagem incorreto.',
    action: 'Verifique a formatação do footer do template.',
    retryable: false,
  },
  2388293: {
    code: 2388293,
    category: 'template',
    title: 'Word-to-parameter ratio exceeded',
    userMessage: 'Template contém muitas variáveis para sua extensão.',
    action: 'Reduza o número de variáveis ou aumente o texto da mensagem.',
    retryable: false,
  },
  2388299: {
    code: 2388299,
    category: 'template',
    title: 'Parameters not allowed at start/end',
    userMessage: 'Variáveis não podem estar no início ou fim do template.',
    action: 'Mova as variáveis para o meio do texto.',
    retryable: false,
  },
  2388019: {
    code: 2388019,
    category: 'template',
    title: 'Template message limit exceeded',
    userMessage: 'Limite máximo de templates atingido (250).',
    action: 'Delete templates não utilizados para criar novos.',
    retryable: false,
  },

  // ============================================
  // INSIGHTS DE TEMPLATE
  // ============================================
  200005: {
    code: 200005,
    category: 'template',
    title: 'Template insights not available',
    userMessage: 'Insights do template não disponíveis.',
    action: 'Template precisa ter envios para gerar insights.',
    retryable: false,
  },
  200006: {
    code: 200006,
    category: 'template',
    title: 'Template insight date range invalid',
    userMessage: 'Período de insights do template inválido.',
    action: 'Use um período de até 90 dias.',
    retryable: false,
  },
  200007: {
    code: 200007,
    category: 'template',
    title: 'Template insights temporarily unavailable',
    userMessage: 'Insights temporariamente indisponíveis.',
    action: 'Tente novamente mais tarde.',
    retryable: true,
  },

  // ============================================
  // CONTA WABA
  // ============================================
  2593079: {
    code: 2593079,
    category: 'auth',
    title: 'WABA not found',
    userMessage: 'Conta WhatsApp Business não encontrada.',
    action: 'Verifique o ID da conta WABA.',
    retryable: false,
  },
  2593085: {
    code: 2593085,
    category: 'auth',
    title: 'WABA access denied',
    userMessage: 'Acesso negado à conta WhatsApp Business.',
    action: 'Verifique permissões no Meta Business Suite.',
    retryable: false,
  },
  2593107: {
    code: 2593107,
    category: 'system',
    title: 'WABA sync in progress',
    userMessage: 'Sincronização da conta WABA em andamento.',
    action: 'Aguarde a sincronização ser concluída.',
    retryable: true,
  },
  2593108: {
    code: 2593108,
    category: 'system',
    title: 'WABA sync failed',
    userMessage: 'Falha na sincronização da conta WABA.',
    action: 'Tente sincronizar novamente.',
    retryable: true,
  },

  // ============================================
  // ERROS DE AUTENTICAÇÃO ADICIONAIS
  // ============================================
  0: {
    code: 0,
    category: 'auth',
    title: 'AuthException',
    userMessage: 'Erro de autenticação.',
    action: 'Verifique o token de acesso.',
    retryable: false,
  },
  3: {
    code: 3,
    category: 'auth',
    title: 'API Method',
    userMessage: 'Método da API não permitido.',
    action: 'Use o método HTTP correto para este endpoint.',
    retryable: false,
  },
  200: {
    code: 200,
    category: 'auth',
    title: 'Permission denied',
    userMessage: 'Permissão negada.',
    action: 'Solicite as permissões necessárias no app.',
    retryable: false,
  },
  294: {
    code: 294,
    category: 'auth',
    title: 'Managing app with mobile not allowed',
    userMessage: 'Gerenciamento via mobile não permitido.',
    action: 'Use a versão desktop do Meta Business Suite.',
    retryable: false,
  },

  // ============================================
  // OUTROS ERROS
  // ============================================
  33: {
    code: 33,
    category: 'system',
    title: 'Parameter format mismatch',
    userMessage: 'Formato de parâmetro incorreto.',
    action: 'Verifique o formato dos dados enviados.',
    retryable: false,
  },
  130472: {
    code: 130472,
    category: 'recipient',
    title: 'User number part of experiment',
    userMessage: 'Número faz parte de experimento da Meta.',
    action: 'Tente novamente mais tarde.',
    retryable: true,
  },
  131005: {
    code: 131005,
    category: 'auth',
    title: 'Access denied',
    userMessage: 'Acesso negado ao recurso.',
    action: 'Verifique as permissões do token.',
    retryable: false,
  },
  131008: {
    code: 131008,
    category: 'system',
    title: 'Required parameter is missing',
    userMessage: 'Parâmetro obrigatório ausente.',
    action: 'Inclua todos os parâmetros necessários.',
    retryable: false,
  },
  131009: {
    code: 131009,
    category: 'system',
    title: 'Parameter value is not valid',
    userMessage: 'Valor de parâmetro inválido.',
    action: 'Verifique os valores enviados.',
    retryable: false,
  },
  131016: {
    code: 131016,
    category: 'system',
    title: 'Service temporarily unavailable',
    userMessage: 'Serviço temporariamente indisponível.',
    action: 'Aguarde e tente novamente.',
    retryable: true,
  },
  131037: {
    code: 131037,
    category: 'recipient',
    title: 'Phone number format incorrect',
    userMessage: 'Formato do número de telefone incorreto.',
    action: 'Use formato E.164 (ex: +5511999999999).',
    retryable: false,
  },
  133000: {
    code: 133000,
    category: 'registration',
    title: 'Incomplete deregistration',
    userMessage: 'Cancelamento de registro anterior falhou.',
    action: 'Cancele o registro do número novamente antes de registrá-lo.',
    retryable: true,
  },
  133004: {
    code: 133004,
    category: 'system',
    title: 'Server temporarily unavailable',
    userMessage: 'Servidor temporariamente indisponível.',
    action: 'Consulte o status da API e tente novamente.',
    retryable: true,
  },
  133005: {
    code: 133005,
    category: 'auth',
    title: 'Two-step PIN mismatch',
    userMessage: 'PIN de verificação em duas etapas incorreto.',
    action: 'Verifique o PIN ou redefina a verificação em duas etapas.',
    retryable: false,
  },
  133006: {
    code: 133006,
    category: 'registration',
    title: 'Phone reverification required',
    userMessage: 'Número de telefone precisa ser verificado.',
    action: 'Verifique e registre o número de telefone novamente.',
    retryable: false,
  },
  133008: {
    code: 133008,
    category: 'auth',
    title: 'Too many 2FA PIN attempts',
    userMessage: 'Muitas tentativas de PIN de verificação.',
    action: 'Aguarde antes de tentar novamente.',
    retryable: true,
  },
  133009: {
    code: 133009,
    category: 'registration',
    title: 'PIN guess limit exceeded',
    userMessage: 'Limite de tentativas de PIN excedido.',
    action: 'Aguarde o período especificado antes de tentar novamente.',
    retryable: true,
  },
  133010: {
    code: 133010,
    category: 'media',
    title: 'Media URL invalid',
    userMessage: 'URL da mídia inválida.',
    action: 'Verifique se a URL está correta e acessível.',
    retryable: false,
  },
  133015: {
    code: 133015,
    category: 'media',
    title: 'Media ID invalid',
    userMessage: 'ID da mídia inválido.',
    action: 'Use um ID de mídia válido.',
    retryable: false,
  },
  134011: {
    code: 134011,
    category: 'system',
    title: 'Business phone number not found',
    userMessage: 'Número de telefone comercial não encontrado.',
    action: 'Verifique o phone_number_id nas configurações.',
    retryable: false,
  },
  135000: {
    code: 135000,
    category: 'system',
    title: 'Generic error',
    userMessage: 'Erro genérico do servidor.',
    action: 'Tente novamente.',
    retryable: true,
  },

  // ============================================
  // MARKETING API
  // ============================================
  131055: {
    code: 131055,
    category: 'recipient',
    title: 'User has not accepted privacy policy',
    userMessage: 'Usuário não aceitou a política de privacidade atualizada.',
    action: 'Peça ao usuário para aceitar os Termos/Políticas no WhatsApp (link oficial: https://wa.me/tos/20210210).',
    retryable: false,
  },
  134100: {
    code: 134100,
    category: 'template',
    title: 'Marketing template required',
    userMessage: 'Template de marketing obrigatório para esta operação.',
    action: 'Use um template de categoria MARKETING.',
    retryable: false,
  },
  134101: {
    code: 134101,
    category: 'template',
    title: 'Marketing message frequency cap',
    userMessage: 'Limite de frequência de mensagens de marketing atingido.',
    action: 'Aguarde antes de enviar novas mensagens de marketing.',
    retryable: true,
  },
  134102: {
    code: 134102,
    category: 'recipient',
    title: 'User not eligible for marketing messages',
    userMessage: 'Usuário não elegível para receber marketing.',
    action: 'Remova este contato de campanhas de marketing.',
    retryable: false,
  },
  1752041: {
    code: 1752041,
    category: 'template',
    title: 'Marketing message blocked by user preference',
    userMessage: 'Mensagem de marketing bloqueada por preferência do usuário.',
    action: 'Remova o contato da lista de marketing.',
    retryable: false,
  },
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

export interface WhatsAppMetaErrorContext {
  code: number
  title?: string
  message?: string
  details?: string
}

function normalizeMetaText(input: unknown): string {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateText(input: string, maxLen: number): string {
  if (input.length <= maxLen) return input
  return `${input.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`
}

/**
 * Normaliza e trunca textos vindos da Meta (title/message/details) para persistência.
 * - Remove excesso de whitespace
 * - Limita tamanho para evitar "encher" o banco com payloads inesperadamente grandes
 */
export function normalizeMetaErrorTextForStorage(input: unknown, maxLen = 500): string {
  const t = normalizeMetaText(input)
  return truncateText(t, Math.max(1, Math.floor(maxLen)))
}

/**
 * Detecta se o erro é relacionado a codec de vídeo/áudio incompatível
 */
function detectCodecError(blob: string): { isCodecError: boolean; friendlyMessage: string | null } {
  const lower = blob.toLowerCase()

  // Padrão: "videoCodec=h264, audioCodec=unknown"
  const videoMatch = lower.match(/videocodec\s*=\s*(\w+)/i)
  const audioMatch = lower.match(/audiocodec\s*=\s*(\w+)/i)

  if (!videoMatch && !audioMatch) {
    return { isCodecError: false, friendlyMessage: null }
  }

  const videoCodec = videoMatch?.[1] || ''
  const audioCodec = audioMatch?.[1] || ''

  // Detectar áudio desconhecido/incompatível
  if (audioCodec === 'unknown' || audioCodec === 'unsupported') {
    return {
      isCodecError: true,
      friendlyMessage: 'Formato de áudio incompatível. Exporte o vídeo novamente com áudio AAC.',
    }
  }

  // Detectar vídeo desconhecido/incompatível
  if (videoCodec === 'unknown' || videoCodec === 'unsupported') {
    return {
      isCodecError: true,
      friendlyMessage: 'Formato de vídeo incompatível. Exporte o vídeo novamente no formato H.264.',
    }
  }

  // Detectar H.265/HEVC (não suportado)
  if (videoCodec.includes('hevc') || videoCodec.includes('h265') || videoCodec.includes('hvc')) {
    return {
      isCodecError: true,
      friendlyMessage: 'Formato de vídeo H.265 não é suportado. Exporte novamente no formato H.264.',
    }
  }

  // Detectar VP9/AV1 (não suportado)
  if (videoCodec.includes('vp9') || videoCodec.includes('av1') || videoCodec.includes('av01')) {
    return {
      isCodecError: true,
      friendlyMessage: 'Formato de vídeo não suportado. Exporte novamente no formato H.264 com áudio AAC.',
    }
  }

  return { isCodecError: false, friendlyMessage: null }
}

/**
 * Monta uma mensagem mais específica usando o payload oficial do erro da Meta
 * (`title`, `message` e especialmente `error_data.details`) como contexto.
 *
 * A Meta recomenda tratar erros usando o `code` e `error_data.details`, e não
 * depender de "títulos" embutidos em `message`.
 */
export function getUserFriendlyMessageForMetaError(input: WhatsAppMetaErrorContext): string {
  const base = mapWhatsAppError(input.code)

  const details = truncateText(normalizeMetaText(input.details), 240)
  const message = truncateText(normalizeMetaText(input.message), 240)
  const title = truncateText(normalizeMetaText(input.title), 160)

  const blob = `${title} ${message} ${details}`.toLowerCase()

  // 1. Detectar mismatch de formato de mídia (ex: "expected GIF, received VIDEO")
  const formatMismatch = blob.match(/expected\s+(\w+),?\s+received\s+(\w+)/i)
  if (formatMismatch) {
    const expected = formatMismatch[1].toUpperCase()
    const received = formatMismatch[2].toUpperCase()

    if (expected === 'GIF' && received === 'VIDEO') {
      return 'O template usa GIF (vídeo em loop), mas você enviou um Vídeo normal. Use a mídia correta ou edite o template.'
    }
    if (expected === 'VIDEO' && received === 'GIF') {
      return 'O template usa Vídeo, mas você enviou um GIF. Use a mídia correta ou edite o template.'
    }
    if (expected === 'IMAGE') {
      return `O template usa Imagem, mas você enviou ${received}. Use a mídia correta ou edite o template.`
    }
    if (expected === 'LOCATION') {
      return 'O template usa Localização no cabeçalho. Configure latitude, longitude, nome e endereço antes de enviar.'
    }

    return `Tipo de mídia incorreto: o template espera ${expected}, mas recebeu ${received}.`
  }

  // 2. Detectar erro de codec de vídeo/áudio
  const codecError = detectCodecError(blob)
  if (codecError.isCodecError && codecError.friendlyMessage) {
    return codecError.friendlyMessage
  }

  // 3. Caso comum em templates com HEADER de mídia: a Meta aceita o envio, mas depois falha
  // ao baixar do "weblink" (403). Alguns tenants recebem isso como 131052/131053/131054.
  // Ajustamos a mensagem para evitar confusão com "upload".
  const isWeblink403 =
    blob.includes('weblink') &&
    (blob.includes('http code 403') || blob.includes(' 403') || blob.includes('forbidden'))

  const baseUserMessage = isWeblink403
    ? 'Erro ao baixar mídia do link do template (403).'
    : base.userMessage

  // Preferimos details (mais específico) e evitamos repetir texto idêntico ao userMessage.
  const shouldAppend = (value: string) =>
    Boolean(value) && value.toLowerCase() !== baseUserMessage.toLowerCase()

  if (shouldAppend(details)) return `${baseUserMessage} — Detalhe (Meta): ${details}`
  if (shouldAppend(message) && message.toLowerCase() !== title.toLowerCase()) {
    return `${baseUserMessage} — Detalhe (Meta): ${message}`
  }
  if (shouldAppend(title)) return `${baseUserMessage} — Detalhe (Meta): ${title}`

  return baseUserMessage
}

/**
 * Retorna ação recomendada, podendo incorporar contexto do erro.
 * Hoje mantemos a ação do mapeamento como fonte primária para consistência.
 */
export function getRecommendedActionForMetaError(input: WhatsAppMetaErrorContext): string {
  const base = mapWhatsAppError(input.code)
  const details = normalizeMetaText(input.details)

  // Exemplo útil: rate limit costuma vir com detalhes claros do motivo.
  if (input.code === 130429 && details) {
    return `${base.action} (Meta: ${truncateText(details, 200)})`
  }

  return base.action
}

/**
 * Mapeia um código de erro para informações detalhadas
 */
export function mapWhatsAppError(code: number): WhatsAppError {
  return WHATSAPP_ERRORS[code] || {
    code,
    category: 'unknown',
    title: 'Unknown error',
    userMessage: `Erro desconhecido (código ${code}).`,
    action: 'Entre em contato com o suporte.',
    retryable: false,
  }
}

/**
 * Verifica se é erro de pagamento
 */
export function isPaymentError(code: number): boolean {
  return mapWhatsAppError(code).category === 'payment'
}

/**
 * Verifica se é erro de rate limit
 */
export function isRateLimitError(code: number): boolean {
  return mapWhatsAppError(code).category === 'rate_limit'
}

/**
 * Verifica se o erro é retryable (pode tentar novamente)
 */
export function isRetryableError(code: number): boolean {
  return mapWhatsAppError(code).retryable
}

/**
 * Retorna a categoria do erro
 */
export function getErrorCategory(code: number): ErrorCategory {
  return mapWhatsAppError(code).category
}

/**
 * Retorna mensagem amigável para o usuário
 */
export function getUserFriendlyMessage(code: number): string {
  return mapWhatsAppError(code).userMessage
}

/**
 * Retorna ação recomendada
 */
export function getRecommendedAction(code: number): string {
  return mapWhatsAppError(code).action
}

/**
 * Erros críticos que devem gerar alerta global
 */
export const CRITICAL_ERROR_CODES = [
  131042, // Payment issue
  131031, // Account locked
  190,    // Token expired
  368,    // Temporarily blocked for policies violations
  130497, // Business account locked
]

/**
 * Verifica se é um erro crítico
 */
export function isCriticalError(code: number): boolean {
  return CRITICAL_ERROR_CODES.includes(code)
}

/**
 * Erros que indicam opt-out do contato
 */
export const OPT_OUT_ERROR_CODES = [
  131050, // User opted out of marketing
  131055, // User has not accepted privacy policy
  134102, // User not eligible for marketing messages
  1752041, // Marketing message blocked by user preference
]

/**
 * Verifica se é erro de opt-out
 */
export function isOptOutError(code: number): boolean {
  return OPT_OUT_ERROR_CODES.includes(code)
}

/**
 * Cores para badges na UI
 */
export const ERROR_CATEGORY_COLORS: Record<ErrorCategory, string> = {
  payment: 'red',
  rate_limit: 'yellow',
  auth: 'red',
  template: 'orange',
  recipient: 'gray',
  media: 'blue',
  system: 'gray',
  integrity: 'red',
  registration: 'purple',
  unknown: 'gray',
}

/**
 * Ícones para badges na UI (lucide-react)
 */
export const ERROR_CATEGORY_ICONS: Record<ErrorCategory, string> = {
  payment: 'CreditCard',
  rate_limit: 'Clock',
  auth: 'Lock',
  template: 'FileText',
  recipient: 'User',
  media: 'Image',
  system: 'Settings',
  integrity: 'ShieldX',
  registration: 'Phone',
  unknown: 'HelpCircle',
}

/**
 * Labels em português para categorias
 */
export const ERROR_CATEGORY_LABELS: Record<ErrorCategory, string> = {
  payment: 'Pagamento',
  rate_limit: 'Limite de Taxa',
  auth: 'Autenticação',
  template: 'Template',
  recipient: 'Destinatário',
  media: 'Mídia',
  system: 'Sistema',
  integrity: 'Integridade',
  registration: 'Registro',
  unknown: 'Desconhecido',
}
