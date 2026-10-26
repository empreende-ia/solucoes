/**
 * Serialização dos turnos de uma situação de teste para o campo de edição.
 *
 * O contrato é ser REVERSÍVEL: textToTurns(turnsToText(x)) preserva quantidade
 * de turnos, papéis e conteúdo. A versão anterior tratava cada linha como um
 * turno novo e classificava linha sem prefixo como fala do lead — uma resposta
 * do agente com parágrafos (padrão em LLM) virava vários turnos com os papéis
 * invertidos só de abrir e salvar o editor.
 */

export interface ScenarioTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Uma fala por bloco, prefixada por "Cliente:" ou "Agente:".
 *
 * Limitação conhecida: se o CONTEÚDO de uma fala tiver uma linha começando
 * literalmente com um dos prefixos ("Cliente:", "Agente:"...), o parse a
 * interpreta como turno novo. É o custo de um formato editável à mão; caso
 * apareça em uso real, a saída é trocar o editor por lista estruturada.
 */
export function turnsToText(messages: ScenarioTurn[]): string {
  return messages
    .map((turn) => `${turn.role === 'assistant' ? 'Agente' : 'Cliente'}: ${turn.content}`)
    .join('\n');
}

export function textToTurns(value: string): ScenarioTurn[] {
  const turns: ScenarioTurn[] = [];
  // Linhas em branco entre parágrafos do MESMO turno são conteúdo (o "\n\n"
  // que o agente escreveu) e precisam sobreviver ao round-trip. Elas ficam
  // pendentes e só entram se vier mais conteúdo do mesmo turno — linha em
  // branco antes de um turno novo (ou no fim) é só separação visual.
  let pendingBlanks = 0;
  for (const rawLine of value.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      pendingBlanks += 1;
      continue;
    }
    const prefixed = /^(cliente|lead|agente|lara|assistente)\s*:/i.test(line);
    if (prefixed) {
      pendingBlanks = 0;
      const assistant = /^(agente|lara|assistente)\s*:/i.test(line);
      turns.push({
        role: assistant ? 'assistant' : 'user',
        content: line.replace(/^(cliente|lead|agente|lara|assistente)\s*:\s*/i, ''),
      });
      continue;
    }
    // Linha sem prefixo é CONTINUAÇÃO do turno anterior (parágrafo da mesma
    // fala), nunca um turno novo de lead.
    if (turns.length > 0) {
      turns[turns.length - 1].content += `${'\n'.repeat(pendingBlanks + 1)}${line}`;
    } else {
      turns.push({ role: 'user', content: line });
    }
    pendingBlanks = 0;
  }
  return turns;
}
