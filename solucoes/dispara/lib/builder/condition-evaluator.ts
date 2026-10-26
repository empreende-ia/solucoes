/**
 * Avaliador SEGURO de expressões de Condition do workflow builder.
 *
 * Substitui o antigo `new Function(...)` do executor. A expressão (já com as
 * referências {{@...}} / {{var.*}} trocadas por __vN) é tokenizada e parseada
 * para uma AST de um SUBCONJUNTO restrito de JavaScript, e essa AST é
 * INTERPRETADA aqui — nunca há geração nem execução de código.
 *
 * Gramática suportada (precedência crescente, mesma semântica do JS):
 *   expr           := conditional
 *   conditional    := shortCircuit [ "?" expr ":" expr ]
 *   shortCircuit   := coalesce | or        (misturar ?? com && / || sem
 *                                           parênteses é erro, como no JS)
 *   coalesce       := equality ("??" equality)+
 *   or             := and ("||" and)*
 *   and            := equality ("&&" equality)*
 *   equality       := relational (("===" | "!==" | "==" | "!=") relational)*
 *   relational     := additive (("<" | ">" | "<=" | ">=") additive)*
 *   additive       := multiplicative (("+" | "-") multiplicative)*
 *   multiplicative := exponent (("*" | "/" | "%") exponent)*
 *   exponent       := unary | postfix [ "**" exponent ]   (unário à esquerda de
 *                                                           ** exige parênteses)
 *   unary          := ("!" | "-" | "+") unary | postfix
 *   postfix        := primary ( ("." | "?.") IDENT [ "(" args ")" ]
 *                             | ("[" | "?.[") (STRING | NUMBER) "]" )*
 *   primary        := STRING | NUMBER | true | false | null | undefined | __vN | "(" expr ")"
 *
 * Optional chaining (?.): encurta a cadeia INTEIRA para undefined quando o
 * receptor é null/undefined (como no JS); parênteses encerram a cadeia. Só vale
 * para leitura de propriedade/índice e para os métodos da whitelist
 * (`__v0?.includes("x")`) — chamada opcional `?.(` é erro de parse.
 *
 * Garantias de segurança (o que fechou o RCE por `__v0["constructor"]...`):
 * - Identificadores: só variáveis __vN (injetadas pelo executor) e os literais
 *   true/false/null/undefined. this, globalThis, process, Function, eval,
 *   import, require, arguments, window etc. são erro de parse.
 * - Acesso a propriedade: só chave LITERAL (ponto, ou string/número entre
 *   colchetes). Escapes (\uXXXX, \u{...}, \xHH) são resolvidos ANTES da
 *   checagem, então "constructor" é barrado igual a "constructor". Chaves
 *   perigosas (constructor, __proto__, prototype, __defineGetter__...) são
 *   rejeitadas em qualquer forma — inclusive via `?.` / `?.[...]`, que passam
 *   pela MESMA checagem. Template literals (crase) não existem aqui.
 * - Em runtime só se leem propriedades PRÓPRIAS de DADOS (descriptor com
 *   `value`): nunca a cadeia de protótipos, nunca um getter. Funções vindas dos
 *   dados viram `undefined`.
 * - Chamadas: só os métodos da whitelist, via ponto, despachados para as
 *   implementações nativas conhecidas (String.prototype.includes.call etc.)
 *   conforme o TIPO do receptor — nunca se chama uma função lida dos dados.
 * - Coerções (==, <, +, ...) convertem objeto→primitivo com implementação
 *   própria, sem invocar valueOf/toString dos dados.
 * - Sem atribuição, vírgula (fora de argumentos), new, spread, arrow function,
 *   regex, comentários, template literals (crase) e operadores bitwise
 *   (& | ^ ~ << >> >>>) — esses dois últimos com mensagem de erro própria.
 *   Tamanho e profundidade limitados (o ternário e o ** contam profundidade).
 */

// Folga larga para as expressões geradas pela UI (dezenas de branches com
// valores longos) e teto para as regex da camada antiga do validador, que são
// superlineares em entrada adversarial.
export const MAX_CONDITION_EXPRESSION_LENGTH = 20_000;
const MAX_NESTING_DEPTH = 100;
const MAX_METHOD_ARGS = 2;

/** Métodos que podem ser chamados numa condição (via ponto). */
export const ALLOWED_CONDITION_METHODS = [
  "includes",
  "startsWith",
  "endsWith",
  "toString",
  "toLowerCase",
  "toUpperCase",
  "trim",
] as const;

type AllowedMethod = (typeof ALLOWED_CONDITION_METHODS)[number];

const ALLOWED_METHOD_SET: ReadonlySet<string> = new Set(
  ALLOWED_CONDITION_METHODS
);

/**
 * Chaves de propriedade nunca acessíveis, em nenhuma forma (comparação
 * case-insensitive para não depender de detalhes do motor JS).
 */
const BLOCKED_PROPERTY_KEYS: ReadonlySet<string> = new Set([
  "constructor",
  "__proto__",
  "prototype",
  "__definegetter__",
  "__definesetter__",
  "__lookupgetter__",
  "__lookupsetter__",
]);

const VARIABLE_NAME_PATTERN = /^__v\d+$/;
const IDENTIFIER_START_PATTERN = /[A-Za-z_$]/;
const IDENTIFIER_PART_PATTERN = /[A-Za-z0-9_$]/;
const DIGIT_PATTERN = /[0-9]/;
const HEX_DIGIT_PATTERN = /^[0-9a-fA-F]$/;
const WHITESPACE_PATTERN = /\s/;
// Sticky (/y): casa exatamente na posição lastIndex, sem fatiar a string.
const NUMBER_PATTERN = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
const LEADING_ZERO_PATTERN = /^0\d/;
const CANONICAL_INDEX_PATTERN = /^(?:0|[1-9]\d*)$/;

/** Mensagem única (tokenizer e validador) para crase/template literal. */
export const TEMPLATE_LITERAL_NOT_SUPPORTED_ERROR =
  "Template literals (backticks) are not supported in conditions. Use single or double quotes.";

// Ordenados do mais longo para o mais curto (longest match). "?", "?." e "??"
// são tratados à parte no tokenizer (regra do JS para `?.` seguido de dígito).
const PUNCTUATORS = [
  "===",
  "!==",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "++",
  "--",
  "**",
  "<",
  ">",
  "!",
  "(",
  ")",
  "[",
  "]",
  ".",
  ",",
  ":",
  "+",
  "-",
  "*",
  "/",
  "%",
] as const;

/** Caracteres que só aparecem em operadores bitwise (fora de && e ||). */
const BITWISE_CHARS: ReadonlySet<string> = new Set(["&", "|", "^", "~"]);

type Token =
  | { type: "string"; value: string; pos: number }
  | { type: "number"; value: number; pos: number }
  | { type: "identifier"; value: string; pos: number }
  | { type: "punct"; value: string; pos: number }
  | { type: "eof"; pos: number };

type EqualityOperator = "===" | "!==" | "==" | "!=";
type RelationalOperator = "<" | ">" | "<=" | ">=";
type ArithmeticOperator = "+" | "-" | "*" | "/" | "%" | "**";
type BinaryOperator = EqualityOperator | RelationalOperator | ArithmeticOperator;

export type ConditionAst =
  | {
      type: "literal";
      value: string | number | boolean | null | undefined;
    }
  | { type: "variable"; name: string }
  | { type: "member"; object: ConditionAst; key: string; optional?: boolean }
  | {
      type: "call";
      object: ConditionAst;
      method: AllowedMethod;
      args: ConditionAst[];
      optional?: boolean;
    }
  /** Fronteira de uma cadeia com `?.`: o curto-circuito para aqui. */
  | { type: "chain"; expression: ConditionAst }
  | { type: "unary"; operator: "!" | "-" | "+"; argument: ConditionAst }
  | {
      type: "binary";
      operator: BinaryOperator;
      left: ConditionAst;
      right: ConditionAst;
    }
  | {
      type: "logical";
      operator: "&&" | "||" | "??";
      left: ConditionAst;
      right: ConditionAst;
    }
  | {
      type: "conditional";
      test: ConditionAst;
      consequent: ConditionAst;
      alternate: ConditionAst;
    };

export type ConditionParseResult =
  | { ok: true; ast: ConditionAst }
  | { ok: false; error: string };

class ConditionSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConditionSyntaxError";
  }
}

/** True se a chave de propriedade é proibida em condições (qualquer caixa). */
export function isBlockedConditionPropertyKey(key: string): boolean {
  return BLOCKED_PROPERTY_KEYS.has(key.toLowerCase());
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

function readHex(source: string, start: number, count: number): number {
  const digits = source.slice(start, start + count);
  if (digits.length !== count || ![...digits].every((d) => HEX_DIGIT_PATTERN.test(d))) {
    throw new ConditionSyntaxError(
      `Invalid escape sequence at position ${start - 2}`
    );
  }
  return Number.parseInt(digits, 16);
}

/**
 * Lê um literal de string ('...' ou "...") resolvendo os escapes do JS.
 * O valor devolvido é o texto FINAL (já sem escapes) — é ele que passa pela
 * checagem de chave perigosa quando usado entre colchetes.
 */
function readString(
  source: string,
  start: number
): { value: string; end: number } {
  const quote = source[start];
  let i = start + 1;
  let out = "";
  while (i < source.length) {
    const char = source[i];
    if (char === quote) {
      return { value: out, end: i + 1 };
    }
    if (char === "\n" || char === "\r") {
      throw new ConditionSyntaxError(
        `Unterminated string literal at position ${start}`
      );
    }
    if (char !== "\\") {
      out += char;
      i += 1;
      continue;
    }

    const next = source[i + 1];
    if (next === undefined) {
      break;
    }
    switch (next) {
      case "n":
        out += "\n";
        i += 2;
        break;
      case "r":
        out += "\r";
        i += 2;
        break;
      case "t":
        out += "\t";
        i += 2;
        break;
      case "b":
        out += "\b";
        i += 2;
        break;
      case "f":
        out += "\f";
        i += 2;
        break;
      case "v":
        out += "\v";
        i += 2;
        break;
      case "0":
        if (DIGIT_PATTERN.test(source[i + 2] ?? "")) {
          throw new ConditionSyntaxError(
            `Octal escape sequences are not allowed (position ${i})`
          );
        }
        out += "\0";
        i += 2;
        break;
      case "x":
        out += String.fromCharCode(readHex(source, i + 2, 2));
        i += 4;
        break;
      case "u": {
        if (source[i + 2] === "{") {
          const close = source.indexOf("}", i + 3);
          const digits = close === -1 ? "" : source.slice(i + 3, close);
          if (
            digits.length === 0 ||
            digits.length > 6 ||
            ![...digits].every((d) => HEX_DIGIT_PATTERN.test(d))
          ) {
            throw new ConditionSyntaxError(
              `Invalid unicode escape at position ${i}`
            );
          }
          const codePoint = Number.parseInt(digits, 16);
          if (codePoint > 0x10ffff) {
            throw new ConditionSyntaxError(
              `Invalid unicode escape at position ${i}`
            );
          }
          out += String.fromCodePoint(codePoint);
          i = close + 1;
        } else {
          out += String.fromCharCode(readHex(source, i + 2, 4));
          i += 6;
        }
        break;
      }
      case "\r":
        // Continuação de linha (\ + CRLF ou CR): não produz caractere.
        i += source[i + 2] === "\n" ? 3 : 2;
        break;
      case "\n":
      case " ":
      case " ":
        i += 2;
        break;
      default:
        if (DIGIT_PATTERN.test(next)) {
          throw new ConditionSyntaxError(
            `Octal escape sequences are not allowed (position ${i})`
          );
        }
        // Escape de identidade (\" \' \\ \a ...): o próprio caractere.
        out += next;
        i += 2;
        break;
    }
  }
  throw new ConditionSyntaxError(
    `Unterminated string literal at position ${start}`
  );
}

function bitwiseOperatorError(operator: string, pos: number): ConditionSyntaxError {
  return new ConditionSyntaxError(
    `Bitwise operators are not supported in conditions ("${operator}" at position ${pos}). Use && / || for logic and === / !== for comparison.`
  );
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];

    if (WHITESPACE_PATTERN.test(char)) {
      i += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const { value, end } = readString(source, i);
      tokens.push({ type: "string", value, pos: i });
      i = end;
      continue;
    }

    if (char === "`") {
      throw new ConditionSyntaxError(
        `${TEMPLATE_LITERAL_NOT_SUPPORTED_ERROR} (position ${i})`
      );
    }

    if (char === "?") {
      // Regra do JS: "?." seguido de dígito é ternário + número (a?.5:b).
      const next = source[i + 1];
      if (next === "?") {
        tokens.push({ type: "punct", value: "??", pos: i });
        i += 2;
        continue;
      }
      if (next === "." && !DIGIT_PATTERN.test(source[i + 2] ?? "")) {
        tokens.push({ type: "punct", value: "?.", pos: i });
        i += 2;
        continue;
      }
      tokens.push({ type: "punct", value: "?", pos: i });
      i += 1;
      continue;
    }

    if (
      DIGIT_PATTERN.test(char) ||
      (char === "." && DIGIT_PATTERN.test(source[i + 1] ?? ""))
    ) {
      NUMBER_PATTERN.lastIndex = i;
      const match = NUMBER_PATTERN.exec(source);
      if (!match) {
        throw new ConditionSyntaxError(`Invalid number at position ${i}`);
      }
      const raw = match[0];
      if (LEADING_ZERO_PATTERN.test(raw)) {
        throw new ConditionSyntaxError(
          `Numbers with leading zeros are not allowed (position ${i})`
        );
      }
      const after = source[i + raw.length] ?? "";
      if (IDENTIFIER_PART_PATTERN.test(after)) {
        throw new ConditionSyntaxError(
          `Invalid number at position ${i}`
        );
      }
      tokens.push({ type: "number", value: Number(raw), pos: i });
      i += raw.length;
      continue;
    }

    if (IDENTIFIER_START_PATTERN.test(char)) {
      let end = i + 1;
      while (end < source.length && IDENTIFIER_PART_PATTERN.test(source[end])) {
        end += 1;
      }
      if (source[end] === "\\") {
        throw new ConditionSyntaxError(
          `Escape sequences are not allowed in identifiers (position ${end})`
        );
      }
      tokens.push({ type: "identifier", value: source.slice(i, end), pos: i });
      i = end;
      continue;
    }

    // Shifts antes dos punctuators (senão "<<" viraria "<" "<").
    const shift = source.startsWith(">>>", i)
      ? ">>>"
      : source.startsWith("<<", i) || source.startsWith(">>", i)
        ? source.slice(i, i + 2)
        : null;
    if (shift) {
      throw bitwiseOperatorError(shift, i);
    }

    const punct = PUNCTUATORS.find((p) => source.startsWith(p, i));
    if (punct) {
      tokens.push({ type: "punct", value: punct, pos: i });
      i += punct.length;
      continue;
    }

    if (BITWISE_CHARS.has(char)) {
      throw bitwiseOperatorError(char, i);
    }

    throw new ConditionSyntaxError(
      `Unexpected character "${char}" at position ${i}`
    );
  }
  tokens.push({ type: "eof", pos: source.length });
  return tokens;
}

// ─── Parser (descida recursiva) ───────────────────────────────────────────────

function describeToken(token: Token): string {
  switch (token.type) {
    case "eof":
      return "end of expression";
    case "string":
      return "string literal";
    case "number":
      return `number ${token.value}`;
    default:
      return `"${token.value}"`;
  }
}

class ConditionParser {
  private index = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): ConditionAst {
    const ast = this.parseExpression();
    const token = this.peek();
    if (token.type !== "eof") {
      throw new ConditionSyntaxError(
        `Unexpected ${describeToken(token)} at position ${token.pos}`
      );
    }
    return ast;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    if (token.type !== "eof") {
      this.index += 1;
    }
    return token;
  }

  private isPunct(value: string): boolean {
    const token = this.peek();
    return token.type === "punct" && token.value === value;
  }

  private matchPunct<T extends string>(values: readonly T[]): T | null {
    const token = this.peek();
    if (token.type !== "punct") return null;
    const found = values.find((v) => v === token.value);
    if (found === undefined) return null;
    this.index += 1;
    return found;
  }

  private expectPunct(value: string): void {
    const token = this.next();
    if (token.type !== "punct" || token.value !== value) {
      throw new ConditionSyntaxError(
        `Expected "${value}" but found ${describeToken(token)} at position ${token.pos}`
      );
    }
  }

  private enter(): void {
    this.depth += 1;
    if (this.depth > MAX_NESTING_DEPTH) {
      throw new ConditionSyntaxError("Condition expression is nested too deeply");
    }
  }

  private leave(): void {
    this.depth -= 1;
  }

  private parseExpression(): ConditionAst {
    this.enter();
    try {
      return this.parseConditional();
    } finally {
      this.leave();
    }
  }

  /** Ternário (associativo à direita); cada ramo é uma expressão completa. */
  private parseConditional(): ConditionAst {
    const test = this.parseShortCircuit();
    if (!this.matchPunct(["?"] as const)) {
      return test;
    }
    const consequent = this.parseExpression();
    this.expectPunct(":");
    const alternate = this.parseExpression();
    return { type: "conditional", test, consequent, alternate };
  }

  /**
   * `a ?? b ?? c` OU uma cadeia de && / ||. Como no JS, misturar ?? com && ou
   * || sem parênteses é erro de sintaxe (evita precedência ambígua).
   */
  private parseShortCircuit(): ConditionAst {
    const head = this.parseEquality();
    if (this.isPunct("??")) {
      let left = head;
      while (this.matchPunct(["??"] as const)) {
        const right = this.parseEquality();
        left = { type: "logical", operator: "??", left, right };
      }
      if (this.isPunct("&&") || this.isPunct("||")) {
        throw this.mixedCoalesceError();
      }
      return left;
    }
    let left = this.continueLogicalAnd(head);
    while (this.matchPunct(["||"] as const)) {
      const right = this.parseLogicalAnd();
      left = { type: "logical", operator: "||", left, right };
    }
    if (this.isPunct("??")) {
      throw this.mixedCoalesceError();
    }
    return left;
  }

  private mixedCoalesceError(): ConditionSyntaxError {
    return new ConditionSyntaxError(
      `Cannot mix "??" with "&&" or "||" without parentheses (position ${this.peek().pos})`
    );
  }

  private parseLogicalAnd(): ConditionAst {
    return this.continueLogicalAnd(this.parseEquality());
  }

  private continueLogicalAnd(first: ConditionAst): ConditionAst {
    let left = first;
    while (this.matchPunct(["&&"] as const)) {
      const right = this.parseEquality();
      left = { type: "logical", operator: "&&", left, right };
    }
    return left;
  }

  private parseEquality(): ConditionAst {
    let left = this.parseRelational();
    for (;;) {
      const operator = this.matchPunct(["===", "!==", "==", "!="] as const);
      if (!operator) return left;
      const right = this.parseRelational();
      left = { type: "binary", operator, left, right };
    }
  }

  private parseRelational(): ConditionAst {
    let left = this.parseAdditive();
    for (;;) {
      const operator = this.matchPunct(["<=", ">=", "<", ">"] as const);
      if (!operator) return left;
      const right = this.parseAdditive();
      left = { type: "binary", operator, left, right };
    }
  }

  private parseAdditive(): ConditionAst {
    let left = this.parseMultiplicative();
    for (;;) {
      const operator = this.matchPunct(["+", "-"] as const);
      if (!operator) return left;
      const right = this.parseMultiplicative();
      left = { type: "binary", operator, left, right };
    }
  }

  private parseMultiplicative(): ConditionAst {
    let left = this.parseExponent();
    for (;;) {
      const operator = this.matchPunct(["*", "/", "%"] as const);
      if (!operator) return left;
      const right = this.parseExponent();
      left = { type: "binary", operator, left, right };
    }
  }

  /**
   * `**` (associativo à direita). Como no JS, unário logo à esquerda de `**`
   * (`-2 ** 2`) é erro: exige parênteses — `(-2) ** 2` ou `-(2 ** 2)`.
   */
  private parseExponent(): ConditionAst {
    const token = this.peek();
    if (
      token.type === "punct" &&
      (token.value === "!" || token.value === "-" || token.value === "+")
    ) {
      const unary = this.parseUnary();
      if (this.isPunct("**")) {
        throw new ConditionSyntaxError(
          `Unary operator before "**" requires parentheses (position ${this.peek().pos})`
        );
      }
      return unary;
    }
    const base = this.parsePostfix();
    if (!this.matchPunct(["**"] as const)) {
      return base;
    }
    this.enter();
    try {
      return { type: "binary", operator: "**", left: base, right: this.parseExponent() };
    } finally {
      this.leave();
    }
  }

  private parseUnary(): ConditionAst {
    const operator = this.matchPunct(["!", "-", "+"] as const);
    if (!operator) {
      return this.parsePostfix();
    }
    this.enter();
    try {
      return { type: "unary", operator, argument: this.parseUnary() };
    } finally {
      this.leave();
    }
  }

  private parsePostfix(): ConditionAst {
    let node = this.parsePrimary();
    // Uma cadeia com qualquer `?.` é embrulhada num nó "chain" ao final: é ali
    // que o curto-circuito para (parênteses abrem uma cadeia nova).
    let hasOptional = false;
    for (;;) {
      if (this.matchPunct(["?."] as const)) {
        hasOptional = true;
        const token = this.peek();
        if (token.type === "punct" && token.value === "(") {
          throw new ConditionSyntaxError(
            `Optional calls ("?.(") are not allowed in conditions (position ${token.pos})`
          );
        }
        if (token.type === "punct" && token.value === "[") {
          this.next();
          node = this.parseBracketMember(node, true);
          continue;
        }
        node = this.parseDotMember(node, "?.", true);
        continue;
      }

      if (this.matchPunct(["."] as const)) {
        node = this.parseDotMember(node, ".", false);
        continue;
      }

      if (this.matchPunct(["["] as const)) {
        node = this.parseBracketMember(node, false);
        if (this.isPunct("(")) {
          throw new ConditionSyntaxError(
            `Function calls are not allowed in conditions (position ${this.peek().pos}). Use .includes(), .startsWith() and similar methods.`
          );
        }
        continue;
      }

      if (this.isPunct("(")) {
        throw new ConditionSyntaxError(
          `Function calls are not allowed in conditions (position ${this.peek().pos}). Use .includes(), .startsWith() and similar methods.`
        );
      }
      return hasOptional ? { type: "chain", expression: node } : node;
    }
  }

  /** `.nome`, `?.nome`, `.metodo(...)` ou `?.metodo(...)`. */
  private parseDotMember(
    object: ConditionAst,
    accessor: "." | "?.",
    optional: boolean
  ): ConditionAst {
    const nameToken = this.next();
    if (nameToken.type !== "identifier") {
      throw new ConditionSyntaxError(
        `Expected property name after "${accessor}" but found ${describeToken(nameToken)} at position ${nameToken.pos}`
      );
    }
    const name = nameToken.value;
    if (this.isPunct("(")) {
      return this.parseCall(object, name, nameToken.pos, optional);
    }
    return this.memberNode(object, name, nameToken.pos, optional);
  }

  /** `[chave]` / `?.[chave]` — o "[" já foi consumido. Só chave LITERAL. */
  private parseBracketMember(object: ConditionAst, optional: boolean): ConditionAst {
    const keyToken = this.next();
    if (keyToken.type !== "string" && keyToken.type !== "number") {
      throw new ConditionSyntaxError(
        `Invalid bracket content at position ${keyToken.pos}. Only numeric indices or string literals are allowed.`
      );
    }
    this.expectPunct("]");
    return this.memberNode(object, String(keyToken.value), keyToken.pos, optional);
  }

  private memberNode(
    object: ConditionAst,
    key: string,
    pos: number,
    optional: boolean
  ): ConditionAst {
    if (isBlockedConditionPropertyKey(key)) {
      throw new ConditionSyntaxError(
        `Access to property "${key}" is not allowed in conditions (position ${pos})`
      );
    }
    return optional
      ? { type: "member", object, key, optional: true }
      : { type: "member", object, key };
  }

  private parseCall(
    object: ConditionAst,
    name: string,
    pos: number,
    optional: boolean
  ): ConditionAst {
    if (!ALLOWED_METHOD_SET.has(name)) {
      throw new ConditionSyntaxError(
        `Method "${name}" is not allowed in conditions. Allowed methods: ${ALLOWED_CONDITION_METHODS.join(", ")}`
      );
    }
    this.expectPunct("(");
    const args: ConditionAst[] = [];
    if (!this.isPunct(")")) {
      for (;;) {
        args.push(this.parseExpression());
        if (args.length > MAX_METHOD_ARGS) {
          throw new ConditionSyntaxError(
            `Too many arguments for method "${name}" (position ${pos})`
          );
        }
        if (!this.matchPunct([","] as const)) break;
      }
    }
    this.expectPunct(")");
    const method = name as AllowedMethod;
    return optional
      ? { type: "call", object, method, args, optional: true }
      : { type: "call", object, method, args };
  }

  private parsePrimary(): ConditionAst {
    const token = this.next();
    switch (token.type) {
      case "string":
        return { type: "literal", value: token.value };
      case "number":
        return { type: "literal", value: token.value };
      case "identifier": {
        switch (token.value) {
          case "true":
            return { type: "literal", value: true };
          case "false":
            return { type: "literal", value: false };
          case "null":
            return { type: "literal", value: null };
          case "undefined":
            return { type: "literal", value: undefined };
          default:
            break;
        }
        if (VARIABLE_NAME_PATTERN.test(token.value)) {
          return { type: "variable", name: token.value };
        }
        throw new ConditionSyntaxError(
          `Unknown identifier "${token.value}" in condition. Use template variables like {{@nodeId:Label.field}} to reference workflow data.`
        );
      }
      case "punct": {
        if (token.value === "(") {
          const inner = this.parseExpression();
          this.expectPunct(")");
          return inner;
        }
        throw new ConditionSyntaxError(
          `Unexpected ${describeToken(token)} at position ${token.pos}`
        );
      }
      default:
        throw new ConditionSyntaxError(
          `Unexpected ${describeToken(token)} at position ${token.pos}`
        );
    }
  }
}

/**
 * Parseia uma expressão de condição (referências já trocadas por __vN) para a
 * AST restrita. Nunca lança: erro de sintaxe/política vira `{ ok: false }`.
 */
export function parseConditionExpression(expression: string): ConditionParseResult {
  if (typeof expression !== "string" || expression.trim() === "") {
    return { ok: false, error: "Condition expression cannot be empty" };
  }
  if (expression.length > MAX_CONDITION_EXPRESSION_LENGTH) {
    return {
      ok: false,
      error: `Condition expression is too long (max ${MAX_CONDITION_EXPRESSION_LENGTH} characters)`,
    };
  }
  try {
    const ast = new ConditionParser(tokenize(expression)).parse();
    return { ok: true, ast };
  } catch (error) {
    if (error instanceof ConditionSyntaxError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof RangeError) {
      return { ok: false, error: "Condition expression is too complex" };
    }
    throw error;
  }
}

// ─── Interpretador ────────────────────────────────────────────────────────────

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/** Funções vindas dos dados nunca ficam acessíveis (nem chamáveis). */
function toSafeValue(value: unknown): unknown {
  return typeof value === "function" ? undefined : value;
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

/**
 * ToPrimitive próprio: espelha o JS para dados simples (arrays → join com ",",
 * objetos → "[object Object]", Date → string/epoch) SEM invocar
 * valueOf/toString definidos nos dados.
 */
function toPrimitive(
  value: unknown,
  hint: "default" | "number",
  seen: Set<object> = new Set()
): Primitive {
  if (!isObjectLike(value)) {
    return value as Primitive;
  }
  if (typeof value === "function") {
    return undefined;
  }
  if (value instanceof Date) {
    return hint === "number"
      ? Date.prototype.getTime.call(value)
      : Date.prototype.toString.call(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "";
    seen.add(value);
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      const element = readOwnData(value, String(i));
      parts.push(
        element === null || element === undefined
          ? ""
          : String(toPrimitive(element, "default", seen))
      );
    }
    seen.delete(value);
    return parts.join(",");
  }
  return "[object Object]";
}

function toStringValue(value: unknown): string {
  return String(toPrimitive(value, "default"));
}

function toNumberValue(value: unknown): number {
  return Number(toPrimitive(value, "number"));
}

/** Lê só propriedade PRÓPRIA de dados (nunca protótipo, nunca getter). */
function readOwnData(target: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor || !("value" in descriptor)) {
    return undefined;
  }
  return toSafeValue(descriptor.value);
}

function readProperty(target: unknown, key: string): unknown {
  if (target === null || target === undefined) {
    throw new TypeError(
      `Cannot read properties of ${String(target)} (reading '${key}')`
    );
  }
  if (isBlockedConditionPropertyKey(key)) {
    // Defesa em profundidade: o parser já barra; nunca deve chegar aqui.
    throw new TypeError(`Access to property "${key}" is not allowed`);
  }
  if (typeof target === "string") {
    if (key === "length") return target.length;
    if (CANONICAL_INDEX_PATTERN.test(key)) {
      const index = Number(key);
      return index < target.length ? target[index] : undefined;
    }
    return undefined;
  }
  if (typeof target === "object") {
    return readOwnData(target, key);
  }
  // number, boolean, bigint, symbol: sem propriedades próprias legíveis.
  return undefined;
}

function describeReceiver(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function callAllowedMethod(
  receiver: unknown,
  method: AllowedMethod,
  args: unknown[]
): unknown {
  if (receiver === null || receiver === undefined) {
    throw new TypeError(
      `Cannot read properties of ${String(receiver)} (reading '${method}')`
    );
  }
  const notSupported = () =>
    new TypeError(`.${method}() is not supported on ${describeReceiver(receiver)}`);

  switch (method) {
    case "includes": {
      if (typeof receiver === "string") {
        return args.length > 1
          ? String.prototype.includes.call(receiver, toStringValue(args[0]), toNumberValue(args[1]))
          : String.prototype.includes.call(receiver, toStringValue(args[0]));
      }
      if (Array.isArray(receiver)) {
        // SameValueZero: sem coerção, nenhum código dos dados é invocado.
        return args.length > 1
          ? Array.prototype.includes.call(receiver, args[0], toNumberValue(args[1]))
          : Array.prototype.includes.call(receiver, args[0]);
      }
      throw notSupported();
    }
    case "startsWith":
    case "endsWith": {
      if (typeof receiver !== "string") throw notSupported();
      const search = toStringValue(args[0]);
      const native =
        method === "startsWith"
          ? String.prototype.startsWith
          : String.prototype.endsWith;
      return args.length > 1
        ? native.call(receiver, search, toNumberValue(args[1]))
        : native.call(receiver, search);
    }
    case "toLowerCase":
      if (typeof receiver !== "string") throw notSupported();
      return String.prototype.toLowerCase.call(receiver);
    case "toUpperCase":
      if (typeof receiver !== "string") throw notSupported();
      return String.prototype.toUpperCase.call(receiver);
    case "trim":
      if (typeof receiver !== "string") throw notSupported();
      return String.prototype.trim.call(receiver);
    case "toString": {
      if (typeof receiver === "number" && args.length > 0) {
        return Number.prototype.toString.call(receiver, toNumberValue(args[0]));
      }
      return toStringValue(receiver);
    }
    default:
      throw notSupported();
  }
}

function looseEquals(left: unknown, right: unknown): boolean {
  const leftIsObject = isObjectLike(left);
  const rightIsObject = isObjectLike(right);
  if (leftIsObject && rightIsObject) {
    return left === right;
  }
  if (leftIsObject || rightIsObject) {
    const primitiveSide = leftIsObject ? right : left;
    if (primitiveSide === null || primitiveSide === undefined) {
      return false;
    }
    const converted = toPrimitive(leftIsObject ? left : right, "default");
    // biome-ignore lint/suspicious/noDoubleEquals: semântica de == do JS entre primitivos
    return converted == primitiveSide;
  }
  // biome-ignore lint/suspicious/noDoubleEquals: semântica de == do JS entre primitivos
  return left == right;
}

function compareRelational(
  operator: RelationalOperator,
  left: unknown,
  right: unknown
): boolean {
  // Após o ToPrimitive próprio, os operandos são primitivos: o operador nativo
  // aplica a semântica do JS (string×string lexicográfico, senão numérico) sem
  // invocar código dos dados. O cast só satisfaz o TypeScript.
  const l = toPrimitive(left, "number") as number;
  const r = toPrimitive(right, "number") as number;
  switch (operator) {
    case "<":
      return l < r;
    case ">":
      return l > r;
    case "<=":
      return l <= r;
    case ">=":
      return l >= r;
    default:
      return false;
  }
}

function addValues(left: unknown, right: unknown): string | number {
  const l = toPrimitive(left, "default");
  const r = toPrimitive(right, "default");
  if (typeof l === "string" || typeof r === "string") {
    return String(l) + String(r);
  }
  return Number(l) + Number(r);
}

/**
 * Sentinela interna do optional chaining: nunca sai deste módulo (é convertida
 * em undefined na fronteira da cadeia) e não pode vir dos dados.
 */
const SHORT_CIRCUIT: unique symbol = Symbol("condition-short-circuit");

/**
 * Avalia um elo de cadeia (membro/chamada). Devolve SHORT_CIRCUIT quando um elo
 * `?.` encontra null/undefined — os elos seguintes NÃO são avaliados (nem os
 * argumentos das chamadas), como no JS.
 */
function evaluateChainLink(
  node: ConditionAst,
  context: Record<string, unknown>
): unknown {
  switch (node.type) {
    case "member": {
      const object = evaluateChainLink(node.object, context);
      if (object === SHORT_CIRCUIT) return SHORT_CIRCUIT;
      if (node.optional && (object === null || object === undefined)) {
        return SHORT_CIRCUIT;
      }
      return readProperty(object, node.key);
    }
    case "call": {
      const receiver = evaluateChainLink(node.object, context);
      if (receiver === SHORT_CIRCUIT) return SHORT_CIRCUIT;
      if (node.optional && (receiver === null || receiver === undefined)) {
        return SHORT_CIRCUIT;
      }
      const args = node.args.map((arg) => evaluateNode(arg, context));
      return callAllowedMethod(receiver, node.method, args);
    }
    default:
      // Inclusive "chain" (cadeia entre parênteses): fronteira própria, já
      // convertida em valor por evaluateNode.
      return evaluateNode(node, context);
  }
}

function evaluateNode(node: ConditionAst, context: Record<string, unknown>): unknown {
  switch (node.type) {
    case "literal":
      return node.value;
    case "variable": {
      if (!hasOwn(context, node.name)) {
        throw new ReferenceError(`${node.name} is not defined`);
      }
      return toSafeValue(context[node.name]);
    }
    case "member":
    case "call":
    case "chain": {
      const value = evaluateChainLink(
        node.type === "chain" ? node.expression : node,
        context
      );
      return value === SHORT_CIRCUIT ? undefined : value;
    }
    case "conditional":
      return evaluateNode(node.test, context)
        ? evaluateNode(node.consequent, context)
        : evaluateNode(node.alternate, context);
    case "unary": {
      const value = evaluateNode(node.argument, context);
      switch (node.operator) {
        case "!":
          return !value;
        case "-":
          return -toNumberValue(value);
        case "+":
          return toNumberValue(value);
        default:
          throw new TypeError("Unsupported unary operator");
      }
    }
    case "logical": {
      const left = evaluateNode(node.left, context);
      if (node.operator === "&&") {
        return left ? evaluateNode(node.right, context) : left;
      }
      if (node.operator === "??") {
        return left === null || left === undefined
          ? evaluateNode(node.right, context)
          : left;
      }
      return left ? left : evaluateNode(node.right, context);
    }
    case "binary": {
      const left = evaluateNode(node.left, context);
      const right = evaluateNode(node.right, context);
      switch (node.operator) {
        case "===":
          return left === right;
        case "!==":
          return left !== right;
        case "==":
          return looseEquals(left, right);
        case "!=":
          return !looseEquals(left, right);
        case "<":
        case ">":
        case "<=":
        case ">=":
          return compareRelational(node.operator, left, right);
        case "+":
          return addValues(left, right);
        case "-":
          return toNumberValue(left) - toNumberValue(right);
        case "*":
          return toNumberValue(left) * toNumberValue(right);
        case "/":
          return toNumberValue(left) / toNumberValue(right);
        case "%":
          return toNumberValue(left) % toNumberValue(right);
        case "**":
          return toNumberValue(left) ** toNumberValue(right);
        default:
          throw new TypeError("Unsupported binary operator");
      }
    }
    default:
      throw new TypeError("Unsupported expression node");
  }
}

/** Interpreta uma AST já parseada. Lança em erro de runtime (ex.: ler de undefined). */
export function evaluateConditionAst(
  ast: ConditionAst,
  context: Record<string, unknown>
): unknown {
  return evaluateNode(ast, context);
}

/**
 * Parseia e avalia uma expressão de condição com as variáveis __vN do
 * `context`. Lança em erro de sintaxe/política ou de runtime — o executor
 * trata qualquer erro como condição falsa.
 */
export function evaluateSafeExpression(
  expression: string,
  context: Record<string, unknown>
): unknown {
  const parsed = parseConditionExpression(expression);
  if (!parsed.ok) {
    throw new Error(`Invalid condition expression: ${parsed.error}`);
  }
  return evaluateConditionAst(parsed.ast, context);
}
