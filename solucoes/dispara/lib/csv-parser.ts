/**
 * CSV/TXT Parser Utility
 *
 * Robust parsing with Papa Parse, validation, and phone normalization
 * Ported from NossoFlow with improvements
 */

import Papa from 'papaparse';
import { normalizePhoneNumber, validatePhoneNumber } from './phone-formatter';
import { logger, generateTraceId } from './logger';
import { handleParseError } from './errors';

// ============================================================================
// Types
// ============================================================================

export interface ParsedContact {
  phone: string;          // Normalized phone number
  name?: string;          // Optional name
  variables?: string[];   // Additional variables for template
  originalPhone: string;  // Original phone before normalization
  rowNumber: number;      // Row number in source file
}

export interface ParseResult {
  success: boolean;
  contacts: ParsedContact[];
  invalidRows: {
    row: number;
    reason: string;
    data: string;
  }[];
  duplicates: string[];
  totalRows: number;
  validRows: number;
}

export interface ParseOptions {
  hasHeader?: boolean;        // First row is header
  phoneColumn?: number;       // Phone column index (0-based)
  nameColumn?: number;        // Name column index (optional)
  variableColumns?: number[]; // Variable column indices
  delimiter?: string;         // CSV delimiter (auto-detect if not specified)
  defaultCountryCode?: string; // Default country code for phones without one
}

const DEFAULT_OPTIONS: ParseOptions = {
  hasHeader: true,
  phoneColumn: 0,
  nameColumn: undefined,
  variableColumns: [],
  defaultCountryCode: 'BR',
};

// ============================================================================
// Parser Implementation
// ============================================================================

/**
 * Parse CSV or TXT file content
 */
export function parseContactsFile(
  content: string,
  options: ParseOptions = {}
): ParseResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const traceId = generateTraceId();

  logger.info('Starting file parse', {
    traceId,
    hasHeader: opts.hasHeader,
    phoneColumn: opts.phoneColumn,
    contentLength: content.length,
  });

  const result: ParseResult = {
    success: false,
    contacts: [],
    invalidRows: [],
    duplicates: [],
    totalRows: 0,
    validRows: 0,
  };

  try {
    // Parse with Papa Parse
    const parsed = Papa.parse(content, {
      header: false,           // We handle headers manually for flexibility
      skipEmptyLines: true,
      delimiter: opts.delimiter, // Auto-detect if undefined
      transformHeader: undefined,
    });

    if (parsed.errors.length > 0) {
      logger.warn('Parse warnings', {
        traceId,
        errors: parsed.errors.slice(0, 5), // Log first 5 errors
      });
    }

    const rows = parsed.data as string[][];
    const startRow = opts.hasHeader ? 1 : 0;
    const seenPhones = new Set<string>();

    result.totalRows = rows.length - startRow;

    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1; // 1-based for user display

      // Skip completely empty rows
      if (!row || row.length === 0 || (row.length === 1 && !row[0]?.trim())) {
        continue;
      }

      // Get phone from specified column
      const phoneIndex = opts.phoneColumn ?? 0;
      const originalPhone = row[phoneIndex]?.trim() || '';

      if (!originalPhone) {
        result.invalidRows.push({
          row: rowNumber,
          reason: 'Telefone vazio',
          data: row.join(', '),
        });
        continue;
      }

      // Normalize phone number
      const normalized = normalizePhoneNumber(originalPhone, opts.defaultCountryCode as 'BR' | 'US' | 'PT');

      if (!normalized) {
        result.invalidRows.push({
          row: rowNumber,
          reason: 'Formato de telefone inválido',
          data: originalPhone,
        });
        continue;
      }

      // Validate normalized phone
      const validation = validatePhoneNumber(normalized);
      if (!validation.isValid) {
        result.invalidRows.push({
          row: rowNumber,
          reason: validation.error || 'Telefone inválido',
          data: originalPhone,
        });
        continue;
      }

      // Check for duplicates
      if (seenPhones.has(normalized)) {
        result.duplicates.push(originalPhone);
        continue;
      }
      seenPhones.add(normalized);

      // Build contact object
      const contact: ParsedContact = {
        phone: normalized,
        originalPhone,
        rowNumber,
      };

      // Add name if column specified
      if (opts.nameColumn !== undefined && row[opts.nameColumn]) {
        contact.name = row[opts.nameColumn].trim();
      }

      // Add variables if columns specified
      if (opts.variableColumns && opts.variableColumns.length > 0) {
        contact.variables = opts.variableColumns
          .map(col => row[col]?.trim() || '')
          .filter(v => v);
      }

      result.contacts.push(contact);
      result.validRows++;
    }

    result.success = true;

    logger.info('Parse complete', {
      traceId,
      totalRows: result.totalRows,
      validRows: result.validRows,
      invalidRows: result.invalidRows.length,
      duplicates: result.duplicates.length,
    });

    return result;
  } catch (error) {
    logger.error('Parse failed', {
      traceId,
      error: (error as Error).message,
    });

    throw handleParseError(error, 'CSV/TXT');
  }
}

/**
 * Parse file from File object (browser)
 */
export async function parseContactsFromFile(
  file: File,
  options: ParseOptions = {}
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const result = parseContactsFile(content, options);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(handleParseError(reader.error, file.type || 'file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Detect file delimiter (for preview purposes)
 */
export function detectDelimiter(content: string): string {
  const firstLine = content.split('\n')[0] || '';

  // Count common delimiters
  const delimiters = [',', ';', '\t', '|'];
  let maxCount = 0;
  let detected = ',';

  for (const delimiter of delimiters) {
    const count = (firstLine.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      detected = delimiter;
    }
  }

  return detected;
}

/**
 * Preview first N rows of file
 */
export function previewFile(
  content: string,
  numRows: number = 5
): { headers: string[]; rows: string[][] } {
  const delimiter = detectDelimiter(content);

  const parsed = Papa.parse(content, {
    header: false,
    skipEmptyLines: true,
    delimiter,
    preview: numRows + 1, // +1 for potential header
  });

  const rows = parsed.data as string[][];

  return {
    headers: rows[0] || [],
    rows: rows.slice(1, numRows + 1),
  };
}

/**
 * Export contacts to CSV format
 */
export function exportToCSV(
  contacts: ParsedContact[],
  includeVariables: boolean = false
): string {
  const headers = ['Telefone', 'Nome'];
  if (includeVariables) {
    // Find max number of variables (guard against empty array)
    const maxVars = contacts.length > 0
      ? Math.max(...contacts.map(c => c.variables?.length || 0))
      : 0;
    for (let i = 1; i <= maxVars; i++) {
      headers.push(`Variável ${i}`);
    }
  }

  const rows = contacts.map(contact => {
    const row = [contact.phone, contact.name || ''];
    if (includeVariables && contact.variables) {
      row.push(...contact.variables);
    }
    return row;
  });

  return Papa.unparse({
    fields: headers,
    data: rows,
  });
}

/**
 * Generate import report
 */
export function generateImportReport(result: ParseResult): string {
  const lines = [
    `📊 Relatório de Importação`,
    `─────────────────────────`,
    `✅ Contatos válidos: ${result.validRows}`,
    `❌ Linhas inválidas: ${result.invalidRows.length}`,
    `🔄 Duplicados: ${result.duplicates.length}`,
    `📝 Total processado: ${result.totalRows}`,
    '',
  ];

  if (result.invalidRows.length > 0) {
    lines.push(`⚠️ Erros encontrados:`);
    result.invalidRows.slice(0, 10).forEach(({ row, reason, data }) => {
      lines.push(`   Linha ${row}: ${reason} (${data})`);
    });
    if (result.invalidRows.length > 10) {
      lines.push(`   ... e mais ${result.invalidRows.length - 10} erros`);
    }
  }

  return lines.join('\n');
}
