/**
 * Condition Expression Validator
 *
 * Validates and sanitizes condition expressions before evaluation.
 * This prevents arbitrary code execution while allowing useful comparisons.
 *
 * Segurança: a FRONTEIRA real é o parser/interpretador de AST restrita em
 * lib/builder/condition-evaluator.ts — o executor não usa mais new Function.
 * validateConditionExpression termina parseando a expressão com ele, então
 * "válida" significa "a AST restrita aceita". As checagens por regex abaixo
 * ficam como camada extra (mensagens de erro estáveis), mas NÃO são suficientes
 * sozinhas: como mascaram o conteúdo das strings, deixavam passar acessos por
 * colchete como __v0["constructor"]["constructor"](...)() (RCE).
 *
 * Allowed syntax:
 * - Template variables: {{@nodeId:Label.field}} (replaced with safe __v0, __v1, etc.)
 * - Comparison operators: ===, !==, ==, !=, >, <, >=, <=
 * - Logical operators: &&, ||, !, ?? (nullish coalescing)
 * - Ternary: cond ? a : b
 * - Arithmetic: +, -, *, /, %, **
 * - Grouping: ( )
 * - Literals: strings ('...', "..."), numbers, true, false, null, undefined
 * - Property access on variables: __v0.property, __v0[0], __v0["key"]
 * - Optional chaining: __v0?.property, __v0?.[0], __v0?.includes("x")
 * - Array methods: .includes(), .length
 * - String methods: .startsWith(), .endsWith(), .includes()
 *
 * NOT allowed:
 * - Function calls (except allowed methods), inclusive chamada opcional ?.()
 * - Assignment operators (=, +=, -=, etc.)
 * - Code execution constructs (eval, Function, import, require)
 * - Property assignment
 * - Array/object literals ([1,2,3], {key: value})
 * - Comments
 * - Template literals (crase) e operadores bitwise (& | ^ ~ << >> >>>)
 * - constructor/__proto__/prototype em QUALQUER forma (ponto, ?., colchete,
 *   string com escapes constructor, template literal)
 * - Chamada de qualquer coisa que não seja um método da whitelist via ponto
 */

import {
  MAX_CONDITION_EXPRESSION_LENGTH,
  parseConditionExpression,
  TEMPLATE_LITERAL_NOT_SUPPORTED_ERROR,
} from "@/lib/builder/condition-evaluator";

// Dangerous patterns that should never appear in conditions
const DANGEROUS_PATTERNS = [
  // Assignment operators
  /(?<![=!<>])=(?!=)/g, // = but not ==, ===, !=, !==, <=, >=
  /\+=|-=|\*=|\/=|%=|\^=|\|=|&=/g,
  // Code execution
  /\beval\s*\(/gi,
  /\bFunction\s*\(/gi,
  /\bimport\s*\(/gi,
  /\brequire\s*\(/gi,
  /\bnew\s+\w/gi,
  // Dangerous globals
  /\bprocess\b/gi,
  /\bglobal\b/gi,
  /\bwindow\b/gi,
  /\bdocument\b/gi,
  /\bconstructor\b/gi,
  /\b__proto__\b/gi,
  /\bprototype\b/gi,
  // Control flow that could be exploited
  /\bwhile\s*\(/gi,
  /\bfor\s*\(/gi,
  /\bdo\s*\{/gi,
  /\bswitch\s*\(/gi,
  /\btry\s*\{/gi,
  /\bcatch\s*\(/gi,
  /\bfinally\s*\{/gi,
  /\bthrow\s+/gi,
  /\breturn\s+/gi,
  // Template literals with expressions (could execute code)
  /`[^`]*\$\{/g,
  // Object literals (but NOT bracket property access)
  /\{\s*\w+\s*:/g,
  // Increment/decrement
  /\+\+|--/g,
  // Bitwise operators (rarely needed, often used in exploits)
  /<<|>>|>>>/g,
  // Comma operator (can chain expressions)
  /,(?![^(]*\))/g, // Comma not inside function call parentheses
  // Semicolons (statement separator)
  /;/g,
];

// Allowed method names that can be called
const ALLOWED_METHODS = new Set([
  "includes",
  "startsWith",
  "endsWith",
  "toString",
  "toLowerCase",
  "toUpperCase",
  "trim",
  "length", // Actually a property, but accessed like .length
]);

// Pattern to match method calls
const METHOD_CALL_PATTERN = /\.(\w+)\s*\(/g;

// Pattern to match bracket expressions: captures what's before and inside the brackets
// (?<!\w): só tenta a partir do INÍCIO de uma palavra — mesmas capturas da
// versão antiga, mas sem o custo quadrático em palavras longas.
const BRACKET_EXPRESSION_PATTERN = /(?<!\w)(\w+)\s*\[([^\]]+)\]/g;

// Pattern for valid variable property access: __v0[0], __v0["key"], __v0['key']
const VALID_BRACKET_ACCESS_PATTERN = /^__v\d+$/;
const VALID_BRACKET_CONTENT_PATTERN = /^(\d+|'[^']*'|"[^"]*")$/;

// Top-level regex patterns for token validation
const WHITESPACE_SPLIT_PATTERN = /\s+/;
const VARIABLE_TOKEN_PATTERN = /^__v\d+/;
const STRING_TOKEN_PATTERN = /^['"]/;
const NUMBER_TOKEN_PATTERN = /^\d/;
const LITERAL_TOKEN_PATTERN = /^(true|false|null|undefined)$/;
const OPERATOR_TOKEN_PATTERN = /^(===|!==|==|!=|>=|<=|>|<|&&|\|\||!|\(|\))$/;
const IDENTIFIER_TOKEN_PATTERN = /^[a-zA-Z_]\w*$/;

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Mascara o CONTEÚDO dos literais de string ('...' e "..."), preservando as
 * aspas e toda a ESTRUTURA do código. As checagens deste módulo (dangerous
 * patterns, method calls, parênteses, identificadores, keywords) devem validar
 * CÓDIGO, não os dados opacos que o usuário digita dentro das aspas — senão um
 * rótulo/valor como "Quero saber mais" (3 palavras), "Documento"/"Processo"
 * (contêm document/process) ou "obrigado :)" (parêntese solto) derruba a
 * validação por engano.
 *
 * Segurança: só afeta o que está DENTRO de aspas simples/duplas — conteúdo de
 * string é inerte (não executa). Template literals com crase NÃO são mascarados
 * DE PROPÓSITO, para que o padrão perigoso `${...}` continue detectável. O
 * scanner respeita escapes (\\ e \") ao localizar o fim do literal, então
 * localiza as fronteiras da string exatamente como o parser JS — é impossível
 * "esconder" código executável fora das aspas.
 */
function maskStringLiterals(expression: string): string {
  let result = "";
  let i = 0;
  const len = expression.length;
  while (i < len) {
    const char = expression[i];
    if (char === '"' || char === "'") {
      const quote = char;
      i += 1;
      while (i < len) {
        const inner = expression[i];
        if (inner === "\\") {
          i += 2; // pula o caractere escapado (faz parte dos dados)
          continue;
        }
        if (inner === quote) {
          break;
        }
        i += 1;
      }
      // Literal vazio: mantém a estrutura (aspas na mesma posição), some com os dados.
      result += `${quote}${quote}`;
      i += 1; // consome a aspa de fechamento (ou passa do fim, se não fechada)
    } else {
      result += char;
      i += 1;
    }
  }
  return result;
}

/**
 * Check for dangerous patterns in the expression
 */
function checkDangerousPatterns(expression: string): ValidationResult {
  for (const pattern of DANGEROUS_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    if (pattern.test(expression)) {
      pattern.lastIndex = 0;
      const match = expression.match(pattern);
      return {
        valid: false,
        error: `Condition contains disallowed syntax: "${match?.[0] || "unknown"}"`,
      };
    }
  }
  return { valid: true };
}

/**
 * Check bracket expressions to distinguish between:
 * - Allowed: Variable property access like __v0[0], __v0["key"], __v0['key']
 * - Blocked: Array literals like [1,2,3], or dangerous expressions like __v0[eval('x')]
 */
function checkBracketExpressions(expression: string): ValidationResult {
  BRACKET_EXPRESSION_PATTERN.lastIndex = 0;

  // Use exec loop for compatibility
  let match: RegExpExecArray | null = null;
  while (true) {
    match = BRACKET_EXPRESSION_PATTERN.exec(expression);
    if (match === null) {
      break;
    }

    const beforeBracket = match[1];
    const insideBracket = match[2].trim();

    // Check if the part before the bracket is a valid variable (__v0, __v1, etc.)
    if (!VALID_BRACKET_ACCESS_PATTERN.test(beforeBracket)) {
      return {
        valid: false,
        error: `Bracket notation is only allowed on workflow variables. Found: "${beforeBracket}[...]"`,
      };
    }

    // Check if the content inside brackets is safe (number or string literal)
    if (!VALID_BRACKET_CONTENT_PATTERN.test(insideBracket)) {
      return {
        valid: false,
        error: `Invalid bracket content: "[${insideBracket}]". Only numeric indices or string literals are allowed.`,
      };
    }
  }

  // Check for standalone array literals (brackets not preceded by a variable)
  // This catches cases like "[1, 2, 3]" at the start of expression or after operators
  const standaloneArrayPattern = /(?:^|[=!<>&|(\s])\s*\[/g;
  standaloneArrayPattern.lastIndex = 0;
  if (standaloneArrayPattern.test(expression)) {
    return {
      valid: false,
      error:
        "Array literals are not allowed in conditions. Use workflow variables instead.",
    };
  }

  return { valid: true };
}

/**
 * Check that all method calls use allowed methods
 */
function checkMethodCalls(expression: string): ValidationResult {
  METHOD_CALL_PATTERN.lastIndex = 0;

  // Use exec loop for compatibility
  let match: RegExpExecArray | null = null;
  while (true) {
    match = METHOD_CALL_PATTERN.exec(expression);
    if (match === null) {
      break;
    }

    const methodName = match[1];
    if (!ALLOWED_METHODS.has(methodName)) {
      return {
        valid: false,
        error: `Method "${methodName}" is not allowed in conditions. Allowed methods: ${Array.from(ALLOWED_METHODS).join(", ")}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Check that parentheses are balanced
 */
function checkParentheses(expression: string): ValidationResult {
  let parenDepth = 0;

  for (const char of expression) {
    if (char === "(") {
      parenDepth += 1;
    }
    if (char === ")") {
      parenDepth -= 1;
    }
    if (parenDepth < 0) {
      return { valid: false, error: "Unbalanced parentheses in condition" };
    }
  }

  if (parenDepth !== 0) {
    return { valid: false, error: "Unbalanced parentheses in condition" };
  }

  return { valid: true };
}

/**
 * Check if a token is valid
 */
function isValidToken(token: string): boolean {
  // Skip known valid patterns
  if (VARIABLE_TOKEN_PATTERN.test(token)) {
    return true;
  }
  if (STRING_TOKEN_PATTERN.test(token)) {
    return true;
  }
  if (NUMBER_TOKEN_PATTERN.test(token)) {
    return true;
  }
  if (LITERAL_TOKEN_PATTERN.test(token)) {
    return true;
  }
  if (OPERATOR_TOKEN_PATTERN.test(token)) {
    return true;
  }
  return false;
}

/**
 * Check for unauthorized identifiers in the expression
 */
function checkUnauthorizedIdentifiers(expression: string): ValidationResult {
  const tokens = expression.split(WHITESPACE_SPLIT_PATTERN).filter(Boolean);

  for (const token of tokens) {
    if (isValidToken(token)) {
      continue;
    }

    // Check if it looks like an unauthorized identifier
    if (IDENTIFIER_TOKEN_PATTERN.test(token) && !token.startsWith("__v")) {
      return {
        valid: false,
        error: `Unknown identifier "${token}" in condition. Use template variables like {{@nodeId:Label.field}} to reference workflow data.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate a condition expression after template variables have been replaced
 *
 * @param expression - The expression with template vars replaced (e.g., "__v0 === 'test'")
 * @returns ValidationResult indicating if the expression is safe to evaluate
 */
export function validateConditionExpression(
  expression: string
): ValidationResult {
  // Empty expressions are invalid
  if (!expression || expression.trim() === "") {
    return { valid: false, error: "Condition expression cannot be empty" };
  }

  // Limite ANTES das regex abaixo (algumas são superlineares em entrada hostil).
  if (expression.length > MAX_CONDITION_EXPRESSION_LENGTH) {
    return {
      valid: false,
      error: `Condition expression is too long (max ${MAX_CONDITION_EXPRESSION_LENGTH} characters)`,
    };
  }

  // Valida CÓDIGO como código: mascara o conteúdo dos literais de string (dados
  // do usuário) antes de qualquer checagem estrutural. Ver maskStringLiterals.
  const masked = maskStringLiterals(expression);

  // Crase fora de aspas = template literal (não suportado). Checado antes das
  // regex para a mensagem ser clara em vez de "Unknown identifier"/"disallowed".
  if (masked.includes("`")) {
    return { valid: false, error: TEMPLATE_LITERAL_NOT_SUPPORTED_ERROR };
  }

  // Check for dangerous patterns
  const dangerousCheck = checkDangerousPatterns(masked);
  if (!dangerousCheck.valid) {
    return dangerousCheck;
  }

  // Check bracket expressions (array access vs array literals)
  const bracketCheck = checkBracketExpressions(masked);
  if (!bracketCheck.valid) {
    return bracketCheck;
  }

  // Check method calls are allowed
  const methodCheck = checkMethodCalls(masked);
  if (!methodCheck.valid) {
    return methodCheck;
  }

  // Validate balanced parentheses
  const parenCheck = checkParentheses(masked);
  if (!parenCheck.valid) {
    return parenCheck;
  }

  // Check for unauthorized identifiers
  const identifierCheck = checkUnauthorizedIdentifiers(masked);
  if (!identifierCheck.valid) {
    return identifierCheck;
  }

  // Fonte de verdade: a expressão ORIGINAL (sem máscara) tem que ser aceita
  // pela gramática restrita do avaliador — é exatamente a AST que o executor
  // interpreta. Fecha os bypasses por colchete/escapes que o mascaramento
  // deixava passar.
  const parsed = parseConditionExpression(expression);
  if (!parsed.ok) {
    return { valid: false, error: parsed.error };
  }

  return { valid: true };
}

/**
 * Check if a raw expression (before template replacement) looks safe
 * This is a quick pre-check before the more thorough validation
 */
export function preValidateConditionExpression(
  expression: string
): ValidationResult {
  if (!expression || typeof expression !== "string") {
    return { valid: false, error: "Condition must be a non-empty string" };
  }

  // Limite antes de qualquer processamento (inclusive a troca de templates no
  // executor, que roda logo depois deste pre-check).
  if (expression.length > MAX_CONDITION_EXPRESSION_LENGTH) {
    return {
      valid: false,
      error: `Condition expression is too long (max ${MAX_CONDITION_EXPRESSION_LENGTH} characters)`,
    };
  }

  // Check for obviously dangerous patterns before any processing
  const dangerousKeywords = [
    "eval",
    "Function",
    "import",
    "require",
    "process",
    "global",
    "window",
    "document",
    "__proto__",
    "constructor",
    "prototype",
  ];

  // Mascara literais de string antes de procurar keywords perigosas — senão um
  // rótulo/valor como "Documento", "Processo" ou "Importante" (dados do usuário)
  // seria confundido com document/process/import (código). Ver maskStringLiterals.
  const lowerExpression = maskStringLiterals(expression).toLowerCase();
  for (const keyword of dangerousKeywords) {
    if (lowerExpression.includes(keyword.toLowerCase())) {
      return {
        valid: false,
        error: `Condition contains disallowed keyword: "${keyword}"`,
      };
    }
  }

  return { valid: true };
}

// ─── Validação de condições do GRAFO (rotas PATCH/publish/rollback/create) ────

// Mesmos padrões que o executor (workflow-executor.workflow.ts) usa para trocar
// as referências por __vN antes de validar/avaliar.
const NODE_REF_PATTERN = /\{\{@([^:]+):([^}]+)\}\}/g;
const RUN_VAR_REF_PATTERN = /\{\{\s*var\.([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** actionType do nó de condição avaliado pelo executor. */
const CONDITION_ACTION_TYPE = "Condition";

/**
 * Valida uma expressão de Condition CRUA (ainda com {{@id:Label.campo}} e
 * {{var.chave}}) exatamente como o executor fará em runtime: preValidate na
 * original, troca das referências por __vN e validate na transformada.
 */
export function validateRawConditionExpression(
  expression: string
): ValidationResult {
  const pre = preValidateConditionExpression(expression);
  if (!pre.valid) {
    return pre;
  }
  let counter = 0;
  const toVar = (): string => {
    const name = `__v${counter}`;
    counter += 1;
    return name;
  };
  const simulated = expression
    .replace(NODE_REF_PATTERN, toVar)
    .replace(RUN_VAR_REF_PATTERN, toVar);
  return validateConditionExpression(simulated);
}

export type WorkflowConditionIssue = {
  nodeId: string;
  label: string;
  error: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Revalida TODAS as condições de um grafo cru (nodes do executor). Devolve a
 * lista de problemas (vazia = ok). Só nós `actionType: "Condition"` têm a
 * expressão avaliada pelo executor; condição booleana ou ausente segue a
 * semântica antiga (Boolean(valor)) e não é erro.
 */
export function findInvalidWorkflowConditions(
  nodes: unknown
): WorkflowConditionIssue[] {
  if (!Array.isArray(nodes)) {
    return [];
  }
  const issues: WorkflowConditionIssue[] = [];
  for (const rawNode of nodes) {
    const node = asRecord(rawNode);
    const data = asRecord(node?.data);
    const config = asRecord(data?.config);
    if (!config || config.actionType !== CONDITION_ACTION_TYPE) {
      continue;
    }
    const nodeId = typeof node?.id === "string" ? node.id : String(node?.id ?? "");
    const label = typeof data?.label === "string" ? data.label : "";
    const condition = config.condition;
    if (
      condition === undefined ||
      condition === null ||
      typeof condition === "boolean"
    ) {
      continue;
    }
    if (typeof condition !== "string") {
      issues.push({
        nodeId,
        label,
        error: "Condition must be a string expression or a boolean",
      });
      continue;
    }
    const result = validateRawConditionExpression(condition);
    if (!result.valid) {
      issues.push({ nodeId, label, error: result.error });
    }
  }
  return issues;
}

/** Mensagem única (pt-BR) para a resposta 400 das rotas do builder. */
export function describeWorkflowConditionIssues(
  issues: WorkflowConditionIssue[]
): string {
  if (issues.length === 0) {
    return "";
  }
  const [first] = issues;
  const name = first.label || first.nodeId || "sem id";
  const extra =
    issues.length > 1 ? ` (e mais ${issues.length - 1} condição(ões) inválida(s))` : "";
  return `Condição inválida no nó "${name}": ${first.error}${extra}`;
}

/**
 * Sanitize an expression by escaping potentially dangerous characters
 * This is used as an additional safety measure
 */
export function sanitizeForDisplay(expression: string): string {
  return expression
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
