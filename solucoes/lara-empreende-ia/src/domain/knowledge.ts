// Divide conteúdo em trechos pesquisáveis, preservando parágrafos quando
// possível e usando sobreposição para textos longos sem pontuação.
export function chunkContent(content: string, maxLen = 1200): string[] {
  const paragraphs = content.split(/\n\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLen) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      let piece = '';
      for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
        if (sentence.length > maxLen) {
          if (piece) {
            chunks.push(piece.trim());
            piece = '';
          }

          const overlap = Math.max(1, Math.floor(maxLen * 0.12));
          const step = Math.max(1, maxLen - overlap);
          for (let start = 0; start < sentence.length; start += step) {
            const slice = sentence.slice(start, start + maxLen).trim();
            if (slice) chunks.push(slice);
            if (start + maxLen >= sentence.length) break;
          }
          continue;
        }

        if ((piece + ' ' + sentence).length > maxLen && piece) {
          chunks.push(piece.trim());
          piece = sentence;
        } else {
          piece = piece ? `${piece} ${sentence}` : sentence;
        }
      }
      if (piece) chunks.push(piece.trim());
      continue;
    }

    if ((current + '\n\n' + paragraph).length > maxLen && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [content.slice(0, maxLen)];
}

// A busca de uma FAQ deve indexar a pergunta canônica. A resposta permanece
// inteira para preservar condições, exceções e orientações operacionais.
export function parseFaqPairs(content: string): Array<{ question: string; answer: string }> {
  const questionPrefix = /^(P|Q|Pergunta)\s*\d*\s*[:.)\-–]\s*/i;
  const numbering = /^\d+\s*[.)\-–]\s*/;
  const answerPrefix = /^(R|A|Resposta)\s*[:.)\-–]\s*/i;

  const pairs: Array<{ question: string; answer: string }> = [];
  let question: string | null = null;
  let answerLines: string[] = [];
  let previousLineWasBlank = true;

  const flush = () => {
    if (question) {
      const answer = answerLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      if (answer) pairs.push({ question, answer });
    }
    question = null;
    answerLines = [];
  };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      if (question && answerLines.length > 0) answerLines.push('');
      previousLineWasBlank = true;
      continue;
    }

    const isQuestion =
      !answerPrefix.test(line)
      && (questionPrefix.test(line) || (previousLineWasBlank && /[?？]\s*$/.test(line)));
    previousLineWasBlank = false;

    if (isQuestion) {
      flush();
      question = line.replace(questionPrefix, '').replace(numbering, '').trim();
    } else if (question) {
      answerLines.push(answerLines.length === 0 ? line.replace(answerPrefix, '').trim() : line);
    }
  }

  flush();
  return pairs;
}
