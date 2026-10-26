export const MATERIAL_LIMITS = {
  maximumFiles: 8,
  maximumFileBytes: 8 * 1024 * 1024,
  maximumTotalBytes: 24 * 1024 * 1024,
  maximumCharactersPerFile: 80_000,
} as const;

export type SupportedMaterialKind = 'pdf' | 'docx' | 'txt' | 'csv' | 'xlsx';

export interface ExtractedMaterial {
  id: string;
  title: string;
  kind: SupportedMaterialKind;
  content: string;
  sourceLabel: string;
  sizeBytes: number;
  charactersRead: number;
  warnings: string[];
  unreadableParts: string[];
}

const textExtensions = new Set(['txt', 'md', 'json']);

function extensionOf(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() || '';
}

function trimContent(content: string): { content: string; truncated: boolean } {
  const normalized = content.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
  if (normalized.length <= MATERIAL_LIMITS.maximumCharactersPerFile) {
    return { content: normalized, truncated: false };
  }
  return {
    content: normalized.slice(0, MATERIAL_LIMITS.maximumCharactersPerFile),
    truncated: true,
  };
}

async function extractPdf(file: File): Promise<Omit<ExtractedMaterial, 'id' | 'title' | 'kind' | 'sourceLabel' | 'sizeBytes'>> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  const unreadableParts: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length < 12) unreadableParts.push(`Página ${pageNumber} sem texto selecionável`);
    if (text) pages.push(`[Página ${pageNumber}]\n${text}`);
  }

  const trimmed = trimContent(pages.join('\n\n'));
  const warnings: string[] = [];
  if (unreadableParts.length === document.numPages) {
    warnings.push('O PDF parece conter apenas imagens. OCR não está disponível nesta versão.');
  } else if (unreadableParts.length > 0) {
    warnings.push('Algumas páginas não tinham texto selecionável.');
  }
  if (trimmed.truncated) warnings.push('O conteúdo foi limitado para análise; revise o arquivo completo antes de confirmar fatos.');

  return {
    content: trimmed.content,
    charactersRead: trimmed.content.length,
    warnings,
    unreadableParts,
  };
}

async function extractDocx(file: File): Promise<Omit<ExtractedMaterial, 'id' | 'title' | 'kind' | 'sourceLabel' | 'sizeBytes'>> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const trimmed = trimContent(result.value);
  const warnings = result.messages.map((message) => message.message);
  if (trimmed.truncated) warnings.push('O conteúdo foi limitado para análise; revise o documento completo antes de confirmar fatos.');
  return {
    content: trimmed.content,
    charactersRead: trimmed.content.length,
    warnings,
    unreadableParts: trimmed.content ? [] : ['Não foi encontrado texto legível no DOCX'],
  };
}

async function extractSpreadsheet(file: File): Promise<Omit<ExtractedMaterial, 'id' | 'title' | 'kind' | 'sourceLabel' | 'sizeBytes'>> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const output: string[] = [];
  const warnings: string[] = [];
  let rowCount = 0;

  const parseXml = (xml: string, label: string) => {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    if (document.querySelector('parsererror')) throw new Error(`Não foi possível ler ${label} na planilha.`);
    return document;
  };
  const textNodes = (node: Element) => Array.from(node.getElementsByTagName('t')).map((item) => item.textContent || '').join('');

  const sharedFile = zip.file('xl/sharedStrings.xml');
  const sharedStrings = sharedFile
    ? Array.from(parseXml(await sharedFile.async('string'), 'os textos compartilhados').getElementsByTagName('si')).map(textNodes)
    : [];

  const workbookFile = zip.file('xl/workbook.xml');
  const relationshipsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relationshipsFile) throw new Error('O XLSX não contém uma estrutura de planilha reconhecível.');
  const workbook = parseXml(await workbookFile.async('string'), 'a estrutura do arquivo');
  const relationships = parseXml(await relationshipsFile.async('string'), 'as referências internas');
  const targets = new Map(Array.from(relationships.getElementsByTagName('Relationship')).map((item) => [item.getAttribute('Id') || '', item.getAttribute('Target') || '']));
  const sheets = Array.from(workbook.getElementsByTagName('sheet')).map((sheet) => ({
    name: sheet.getAttribute('name') || 'Planilha',
    relationshipId: sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || '',
  }));

  for (const sheet of sheets) {
    if (rowCount >= 5_000) break;
    const target = targets.get(sheet.relationshipId);
    if (!target || target.split('/').includes('..')) {
      warnings.push(`A aba “${sheet.name}” não pôde ser localizada.`);
      continue;
    }
    const normalizedTarget = target.replace(/^\//, '').replace(/^xl\//, '');
    const sheetFile = zip.file(`xl/${normalizedTarget}`);
    if (!sheetFile) {
      warnings.push(`A aba “${sheet.name}” não pôde ser aberta.`);
      continue;
    }
    output.push(`[Planilha: ${sheet.name}]`);
    const sheetXml = parseXml(await sheetFile.async('string'), `a aba ${sheet.name}`);
    for (const row of Array.from(sheetXml.getElementsByTagName('row'))) {
      if (rowCount >= 5_000) break;
      const cells = Array.from(row.getElementsByTagName('c')).map((cell) => {
        const type = cell.getAttribute('t');
        if (type === 'inlineStr') return textNodes(cell);
        const raw = cell.getElementsByTagName('v')[0]?.textContent || '';
        if (type === 's') return sharedStrings[Number(raw)] ?? '';
        if (type === 'b') return raw === '1' ? 'Sim' : 'Não';
        return raw;
      });
      output.push(cells.map((cell) => cell.replaceAll('\t', ' ')).join('\t'));
      rowCount += 1;
    }
  }
  if (rowCount >= 5_000) warnings.push('A leitura foi limitada às primeiras 5.000 linhas.');
  const trimmed = trimContent(output.join('\n'));
  if (trimmed.truncated) warnings.push('O conteúdo foi limitado para análise; confirme os dados na planilha original.');
  return {
    content: trimmed.content,
    charactersRead: trimmed.content.length,
    warnings,
    unreadableParts: trimmed.content ? [] : ['Nenhuma célula legível foi encontrada'],
  };
}

async function extractText(file: File): Promise<Omit<ExtractedMaterial, 'id' | 'title' | 'kind' | 'sourceLabel' | 'sizeBytes'>> {
  const trimmed = trimContent(await file.text());
  return {
    content: trimmed.content,
    charactersRead: trimmed.content.length,
    warnings: trimmed.truncated ? ['O conteúdo foi limitado para análise.'] : [],
    unreadableParts: trimmed.content ? [] : ['O arquivo está vazio ou não contém texto legível'],
  };
}

export function validateMaterialFiles(files: File[]): void {
  if (files.length > MATERIAL_LIMITS.maximumFiles) {
    throw new Error(`Envie no máximo ${MATERIAL_LIMITS.maximumFiles} arquivos por vez.`);
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MATERIAL_LIMITS.maximumTotalBytes) {
    throw new Error('Os arquivos ultrapassam o limite total de 24 MB. Divida o envio em partes.');
  }
  const oversized = files.find((file) => file.size > MATERIAL_LIMITS.maximumFileBytes);
  if (oversized) throw new Error(`“${oversized.name}” ultrapassa o limite de 8 MB.`);
}

export async function extractMaterialFile(file: File): Promise<ExtractedMaterial> {
  const extension = extensionOf(file);
  let kind: SupportedMaterialKind;
  let extracted: Omit<ExtractedMaterial, 'id' | 'title' | 'kind' | 'sourceLabel' | 'sizeBytes'>;

  if (extension === 'pdf') {
    kind = 'pdf';
    extracted = await extractPdf(file);
  } else if (extension === 'docx') {
    kind = 'docx';
    extracted = await extractDocx(file);
  } else if (extension === 'xlsx') {
    kind = 'xlsx';
    extracted = await extractSpreadsheet(file);
  } else if (extension === 'csv') {
    kind = 'csv';
    extracted = await extractText(file);
  } else if (textExtensions.has(extension)) {
    kind = 'txt';
    extracted = await extractText(file);
  } else {
    throw new Error(`Formato de “${file.name}” não suportado. Use PDF, DOCX, TXT, CSV ou XLSX.`);
  }

  return {
    id: crypto.randomUUID(),
    title: file.name,
    kind,
    sourceLabel: file.name,
    sizeBytes: file.size,
    ...extracted,
  };
}
