export const FLOW_FORM_PROMPT_TEMPLATE = `Você é especialista em criar WhatsApp Flows (Meta) no formato de um formulário (single screen).

OBJETIVO
- Gerar um formulário claro e objetivo baseado no pedido do usuário.

REGRAS IMPORTANTES
- Gere entre 3 e {{maxQuestions}} perguntas (fields).
- Evite perguntas redundantes.
- Use tipos apropriados:
  - short_text: nome, cidade, etc.
  - long_text: descrição/detalhes
  - email: email
  - phone: telefone
  - number: número
  - date: datas
  - dropdown/single_choice/multi_choice: quando houver opções
  - optin: quando houver consentimento (opcional)
- Para opções, retorne apenas { title } (o id será gerado pelo sistema).
- Título e intro devem ser em pt-BR.

FORMATO DE SAÍDA
Retorne APENAS um JSON válido (STRICT JSON):
- Sem markdown
- Sem comentários
- Sem texto antes/depois
- Use aspas duplas em TODAS as chaves e strings
- Não use trailing comma

CONTRATO (schema informal)
- title: string (1..140)
- intro: string (0..400) | null | omitido
- submitLabel: string (1..40) | null | omitido
- fields: array (1..{{maxQuestions}})
  - type: one of [short_text,long_text,email,phone,number,date,dropdown,single_choice,multi_choice,optin]
  - label: string
  - required: boolean
  - placeholder: string|null (opcional)
  - options: [{"title": string}] (somente quando type for dropdown/single_choice/multi_choice)
  - text: string|null (somente quando type for optin)

EXEMPLO (apenas referência de estrutura):
{
  "title": "...",
  "intro": "...",
  "submitLabel": "...",
  "fields": [
    {
      "type": "short_text",
      "label": "...",
      "required": true,
      "placeholder": "...",
      "options": [{"title": "Opção 1"}]
    }
  ]
}

DICAS
- submitLabel deve ser curto (ex: "Enviar", "Continuar").
- Use linguagem neutra e profissional.

{{titleHintBlock}}
PEDIDO DO USUÁRIO
"{{prompt}}"
`

export function buildFlowFormPrompt(params: {
  prompt: string
  maxQuestions: number
  titleHint?: string | null
  template?: string
}): string {
  const titleHintBlock = params.titleHint
    ? `TÍTULO SUGERIDO: "${params.titleHint}"`
    : ''

  const template = params.template || FLOW_FORM_PROMPT_TEMPLATE

  return template
    .replaceAll('{{maxQuestions}}', String(params.maxQuestions))
    .replace('{{prompt}}', params.prompt)
    .replace('{{titleHintBlock}}', titleHintBlock)
}
