/**
 * Provedores de agenda oferecidos pela conexão Nylas.
 *
 * A lista do que aparece na tela vem do backend (`status.providers`, lido dos
 * connectors da conta Nylas), não daqui. Este catálogo só traduz o
 * identificador do Nylas para o que a pessoa precisa saber antes de clicar:
 * como o provedor se chama, se ele cria sala de reunião e se exige algum
 * preparo. Identificador desconhecido é ignorado — melhor oferecer menos do
 * que oferecer um caminho que termina em erro do Nylas.
 */

export interface CalendarProviderInfo {
  /** Identificador do Nylas, enviado como `provider` na URL de autorização. */
  id: string;
  label: string;
  /** Sala de reunião nativa criada junto com o evento, quando existe. */
  meetingRoom: string | null;
  /**
   * Preparo obrigatório antes de abrir a janela de autorização. A Apple não
   * aceita a senha normal da conta em aplicativos de terceiros.
   */
  appPassword?: {
    title: string;
    explanation: string;
    steps: string[];
    helpUrl: string;
    helpLabel: string;
  };
}

const CATALOG: Record<string, CalendarProviderInfo> = {
  google: {
    id: 'google',
    label: 'Google Agenda',
    meetingRoom: 'Google Meet',
  },
  microsoft: {
    id: 'microsoft',
    label: 'Outlook',
    meetingRoom: 'Microsoft Teams',
  },
  icloud: {
    id: 'icloud',
    label: 'iCloud',
    meetingRoom: null,
    appPassword: {
      title: 'Antes de conectar o iCloud',
      explanation:
        'A Apple não aceita a senha normal do iCloud em aplicativos de terceiros. Gere uma senha de app, de 16 caracteres, e use ela no lugar da sua senha.',
      steps: [
        'Entre em appleid.apple.com com seu Apple ID',
        'Vá em Segurança e depois em Senhas específicas de app',
        'Gere uma senha nova e dê o nome que quiser',
        'Copie a senha, no formato xxxx-xxxx-xxxx-xxxx',
      ],
      helpUrl: 'https://appleid.apple.com',
      helpLabel: 'Abrir Apple ID',
    },
  },
};

/** Ordem de exibição: o mais usado primeiro, o que exige preparo por último. */
const DISPLAY_ORDER = ['google', 'microsoft', 'icloud'];

export function describeCalendarProvider(id: string | null | undefined): CalendarProviderInfo | null {
  if (!id) return null;
  return CATALOG[id.toLowerCase()] ?? null;
}

/**
 * Provedores que a tela deve oferecer, na ordem de exibição.
 *
 * `null` (o backend não conseguiu consultar os connectors) devolve lista
 * vazia: nesse caso a tela mostra um botão único e deixa a escolha com o
 * próprio Nylas, em vez de chutar o que está habilitado.
 */
export function listCalendarProviders(ids: string[] | null | undefined): CalendarProviderInfo[] {
  if (!ids?.length) return [];
  const available = new Set(ids.map((id) => id.toLowerCase()));
  return DISPLAY_ORDER.filter((id) => available.has(id)).map((id) => CATALOG[id]);
}

/**
 * Nome do provedor para exibição, mesmo quando ele não está no catálogo — um
 * grant antigo pode apontar para algo que não oferecemos mais.
 */
export function calendarProviderLabel(id: string | null | undefined, fallback = 'Agenda conectada'): string {
  return describeCalendarProvider(id)?.label ?? fallback;
}
