import { describe, expect, it } from 'vitest';

import {
  extractMaterialFile,
  MATERIAL_LIMITS,
  validateMaterialFiles,
} from './material-extraction';

describe('material extraction', () => {
  it('lê texto simples e normaliza quebras de linha', async () => {
    const file = new File(['  Atendimento de segunda a sexta.\r\nPreço sob consulta.  '], 'empresa.txt', { type: 'text/plain' });

    const result = await extractMaterialFile(file);

    expect(result.kind).toBe('txt');
    expect(result.content).toBe('Atendimento de segunda a sexta.\nPreço sob consulta.');
    expect(result.charactersRead).toBe(result.content.length);
    expect(result.unreadableParts).toEqual([]);
  });

  it('mantém arquivo vazio como ilegível para revisão humana', async () => {
    const result = await extractMaterialFile(new File(['   '], 'vazio.csv', { type: 'text/csv' }));

    expect(result.content).toBe('');
    expect(result.unreadableParts).toContain('O arquivo está vazio ou não contém texto legível');
  });

  it('rejeita formatos não suportados sem tentar interpretá-los', async () => {
    await expect(extractMaterialFile(new File(['x'], 'arquivo.exe'))).rejects.toThrow('não suportado');
  });

  it('aplica limites de quantidade e tamanho antes da leitura', () => {
    const tooMany = Array.from({ length: MATERIAL_LIMITS.maximumFiles + 1 }, (_, index) => new File(['x'], `${index}.txt`));
    expect(() => validateMaterialFiles(tooMany)).toThrow('no máximo');

    const oversized = { name: 'grande.pdf', size: MATERIAL_LIMITS.maximumFileBytes + 1 } as File;
    expect(() => validateMaterialFiles([oversized])).toThrow('8 MB');
  });
});
