import { describe, expect, it } from 'vitest';

import { diffLines } from './textDiff';

describe('diffLines', () => {
  it('marca linhas iguais, adicionadas e removidas', () => {
    const before = 'a\nb\nc';
    const after = 'a\nx\nc';
    expect(diffLines(before, after)).toEqual([
      { type: 'same', text: 'a' },
      { type: 'removed', text: 'b' },
      { type: 'added', text: 'x' },
      { type: 'same', text: 'c' },
    ]);
  });

  it('trata inclusão no fim e texto idêntico', () => {
    expect(diffLines('a', 'a\nb')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'added', text: 'b' },
    ]);
    expect(diffLines('a\nb', 'a\nb').every((line) => line.type === 'same')).toBe(true);
  });

  it('reconstrói os dois lados a partir do resultado', () => {
    const before = 'um\ndois\ntrês\nquatro';
    const after = 'zero\num\ntrês\ncinco';
    const diff = diffLines(before, after);
    const rebuiltBefore = diff.filter((line) => line.type !== 'added').map((line) => line.text).join('\n');
    const rebuiltAfter = diff.filter((line) => line.type !== 'removed').map((line) => line.text).join('\n');
    expect(rebuiltBefore).toBe(before);
    expect(rebuiltAfter).toBe(after);
  });
});
