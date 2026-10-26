import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateSafeExpression,
  isBlockedConditionPropertyKey,
  MAX_CONDITION_EXPRESSION_LENGTH,
  parseConditionExpression,
  TEMPLATE_LITERAL_NOT_SUPPORTED_ERROR,
} from "@/lib/builder/condition-evaluator";
import {
  preValidateConditionExpression,
  validateConditionExpression,
  validateRawConditionExpression,
} from "@/lib/builder/condition-validator";

type Ctx = Record<string, unknown>;

const CANARY = "__dispara_condition_pwned__";
const canaryHolder = globalThis as unknown as Record<string, unknown>;

afterEach(() => {
  delete canaryHolder[CANARY];
});

/**
 * Referência (SÓ em teste, com expressões confiáveis): o comportamento antigo do
 * executor, via new Function. Usado para provar que o interpretador preserva a
 * semântica das expressões que a UI gera.
 */
function legacyEval(expression: string, ctx: Ctx): boolean {
  const names = Object.keys(ctx);
  const values = Object.values(ctx);
  // biome-ignore lint/security/noGlobalEval: referência de semântica em teste
  const fn = new Function(...names, `return (${expression});`);
  return Boolean(fn(...values));
}

function safeEval(expression: string, ctx: Ctx): boolean {
  return Boolean(evaluateSafeExpression(expression, ctx));
}

// ─── Regressão: formatos gerados pela UI (lib/builder/flow/compile.ts) ───────

describe("condition-evaluator — expressões geradas pela UI", () => {
  // compile.ts: conditionBase (contains / not_contains / equals), botões do
  // "Perguntar" (===), exclusividade (&& !(...)) e branch None/else.
  const replies = [
    "urgente",
    "É URGENTE",
    "quero saber mais",
    "Sim, quero mais",
    "obrigado :)",
    "",
    "Vendas",
    "Suporte",
    'aspas "duplas" e \\ barra',
  ];
  const expressions = [
    '__v0.includes("urgente")',
    '!(__v0.includes("urgente"))',
    '__v0 === "Vendas"',
    '__v0 === "Suporte" && !(__v0 === "Vendas")',
    '!(__v0 === "Vendas") && !(__v0 === "Suporte")',
    '__v0.includes("quero") && !(__v0.includes("urgente"))',
    '!(__v0.includes("urgente")) && !(__v0.includes("quero")) && !(__v0 === "Sim, quero mais")',
    '__v0 === "Sim, quero mais"',
    '__v0.includes("obrigado :)")',
    '__v0.includes("aspas \\"duplas\\" e \\\\ barra")',
    "__v0.toLowerCase().includes('urgente')",
    "__v0.trim() === ''",
    "true",
    "false",
  ];

  for (const expression of expressions) {
    it(`preserva a semântica de: ${expression}`, () => {
      expect(validateConditionExpression(expression)).toEqual({ valid: true });
      for (const reply of replies) {
        const ctx = { __v0: reply };
        expect(safeEval(expression, ctx)).toBe(legacyEval(expression, ctx));
      }
    });
  }

  it("aceita o escape gerado por escapeLiteral (\\n, \\r, \\t, \\\", \\\\)", () => {
    const expression = '__v0 === "linha1\\nlinha2\\t\\"x\\"\\\\"';
    expect(validateConditionExpression(expression)).toEqual({ valid: true });
    expect(safeEval(expression, { __v0: 'linha1\nlinha2\t"x"\\' })).toBe(true);
  });

  it("referência sem valor (undefined) lança → executor trata como falso", () => {
    // Mesmo comportamento do new Function: TypeError ao chamar .includes em undefined.
    expect(() => evaluateSafeExpression('__v0.includes("x")', { __v0: undefined })).toThrow(TypeError);
  });
});

// ─── Semântica geral (subconjunto JS) ────────────────────────────────────────

describe("condition-evaluator — semântica", () => {
  const cases: Array<[string, Ctx]> = [
    ["__v0 > 10 && __v1 < 20", { __v0: 15, __v1: 3 }],
    ["__v0 >= 5 || __v1 <= 50", { __v0: 1, __v1: 60 }],
    ["__v0 == 42", { __v0: "42" }],
    ["__v0 != 'x'", { __v0: "x" }],
    ["__v0 == null", { __v0: undefined }],
    ["__v0 === null", { __v0: undefined }],
    ["__v0 === undefined", { __v0: undefined }],
    ["!__v0", { __v0: "" }],
    ["__v0['name'] === 'test'", { __v0: { name: "test" } }],
    ['__v0["name"] === "test"', { __v0: { name: "x" } }],
    ["__v0[0] === 'a'", { __v0: ["a", "b"] }],
    ["__v0[1] === 'b'", { __v0: "ab" }],
    ["__v0.length > 2", { __v0: [1, 2, 3] }],
    ["__v0.length === 3", { __v0: "abc" }],
    ["__v0.data.items.length === 0", { __v0: { data: { items: [] } } }],
    ["__v0.includes(2)", { __v0: [1, 2, 3] }],
    ["__v0.includes('2')", { __v0: [1, 2, 3] }],
    ["__v0.startsWith('ab') && __v0.endsWith('yz')", { __v0: "abxyz" }],
    ["__v0.toUpperCase() === 'ABC'", { __v0: "abc" }],
    ["__v0.toString() === '42'", { __v0: 42 }],
    ["__v0.toString() === '1,2'", { __v0: [1, 2] }],
    ["__v0 + 1 > 5", { __v0: 5 }],
    ["__v0 + 'x' === '5x'", { __v0: 5 }],
    ["__v0 - 1 === 4 && __v0 * 2 === 10 && __v0 / 5 === 1 && __v0 % 2 === 1", { __v0: 5 }],
    ["-__v0 < 0", { __v0: 3 }],
    ["__v0 > -1", { __v0: 0 }],
    ["+__v0 === 7", { __v0: "7" }],
    ["__v0 == 'a,b'", { __v0: ["a", "b"] }],
    ["__v0 == '[object Object]'", { __v0: { a: 1 } }],
    ["__v0 == __v1", { __v0: [1], __v1: [1] }],
    ["__v0 < __v1", { __v0: "abc", __v1: "abd" }],
    ["(__v0 > 10) && (__v1 === 'test')", { __v0: 11, __v1: "test" }],
    ["((__v0 === 1) && (__v1 === 2))", { __v0: 1, __v1: 2 }],
    ["__v0 === 1.5e2", { __v0: 150 }],
    ["__v0 && __v0.includes('x')", { __v0: null }],
    ["__v0 || 'fallback'", { __v0: "" }],
    ["'\\u0041' === 'A' && '\\x41' === 'A' && '\\u{41}' === 'A'", {}],
    ["__v0 === 'constructor'", { __v0: "constructor" }],
    ["__v0.includes('__proto__')", { __v0: "x __proto__ y" }],
  ];

  for (const [expression, ctx] of cases) {
    it(`igual ao JS: ${expression}`, () => {
      expect(safeEval(expression, ctx)).toBe(legacyEval(expression, ctx));
    });
  }

  it("variável inexistente no contexto lança (ReferenceError)", () => {
    expect(() => evaluateSafeExpression("__v9 === 1", { __v0: 1 })).toThrow(ReferenceError);
  });

  it("ler propriedade de null/undefined lança (TypeError)", () => {
    expect(() => evaluateSafeExpression("__v0.a === 1", { __v0: null })).toThrow(TypeError);
  });
});

// ─── Payloads de bypass: TODOS rejeitados, nenhum executa ─────────────────────

const BYPASS_PAYLOADS: string[] = [
  // O RCE confirmado na auditoria
  '__v0["constructor"]["constructor"]("return process.version")()',
  `__v0["constructor"]["constructor"]("globalThis.${CANARY} = 1")()`,
  `""["constructor"]["constructor"]("globalThis.${CANARY} = 1")()`,
  `''['constructor']['constructor']('globalThis.${CANARY} = 1')()`,
  `__v0['constructor']['constructor']('globalThis.${CANARY} = 1')()`,
  // Template literal
  "__v0[`constructor`][`constructor`](`return process`)()",
  "`${process.env}`",
  "__v0[`constructor`]",
  // Escapes unicode/hex dentro da string do colchete
  '__v0["\\u0063onstructor"]["\\u0063onstructor"]("return 1")()',
  '__v0["\\u{63}onstructor"]',
  "__v0['\\x63onstructor']",
  '__v0["\\x5f\\x5fproto\\x5f\\x5f"]',
  '__v0["constr\\uctor"]',
  // Escape em identificador
  "__v0.\\u0063onstructor",
  // Concatenação dentro do colchete
  '__v0["const" + "ructor"]',
  '__v0[("constructor")]',
  // Ponto
  "__v0.constructor",
  "__v0.constructor.constructor('return 1')()",
  "__v0.__proto__",
  "__v0.prototype",
  "__v0.CONSTRUCTOR",
  "__v0.__defineGetter__",
  '__v0["__lookupGetter__"]',
  // Chaves perigosas por colchete
  '__v0["__proto__"]',
  "__v0['prototype']",
  '__v0[0]["constructor"]',
  "__v0.a.b['constructor']",
  "(__v0).constructor",
  "__v0.toString().constructor",
  "__v0.toString()['constructor']",
  // Chamadas não permitidas
  '__v0["includes"]("x")',
  "__v0.includes.constructor('x')",
  "__v0.toString.call(__v0)",
  "__v0.valueOf()",
  "__v0.map(__v1)",
  "__v0()",
  "(__v0)('x')",
  '__v0["constructor"]["getOwnPropertyNames"](__v0)',
  // Globais e construções de código
  'Function("return 1")()',
  "globalThis.process",
  "globalThis",
  "process.env.SUPABASE_SERVICE_ROLE_KEY",
  'import("fs")',
  'eval("1")',
  'require("child_process")',
  "this",
  "this.constructor",
  "arguments",
  "arguments[0]",
  "new Error()",
  "(() => 1)()",
  "__v0 => 1",
  "[].constructor",
  "({}).constructor",
  "[1, 2, 3]",
  "{ a: 1 }",
  "__v0 = 1",
  "__v0, 1",
  // (ternário e ?? passaram a ser sintaxe suportada — ver "compatibilidade
  // com a main"; os bypasses por essas construções estão mais abaixo)
  "__v0?.constructor",
  "__v0++",
  "--__v0",
  "__v0; 1",
  "__v0 // comentário",
  "/x/.test(__v0)",
  "typeof __v0 === 'string'",
  "__v0 instanceof Object",
  "'a' in __v0",
  "void 0",
  "delete __v0.a",
  "...__v0",
  "__v0 === 010",
  "__v0 === '\\1'",
  "'unterminated",
];

describe("condition-evaluator — payloads de bypass", () => {
  for (const payload of BYPASS_PAYLOADS) {
    it(`rejeita: ${payload}`, () => {
      const parsed = parseConditionExpression(payload);
      expect(parsed.ok).toBe(false);

      // Validador (usado pelo compile, pelas rotas e pelo executor) também rejeita.
      expect(validateConditionExpression(payload).valid).toBe(false);

      // E o avaliador nunca executa: lança antes de qualquer efeito colateral.
      expect(() =>
        evaluateSafeExpression(payload, { __v0: "abc", __v1: "x" })
      ).toThrow();
      expect(canaryHolder[CANARY]).toBeUndefined();
    });
  }

  it("prova de que o payload ORIGINAL executava com new Function (contraste)", () => {
    // Documenta a vulnerabilidade corrigida: com o avaliador antigo, o mesmo
    // payload executava código arbitrário.
    legacyEval(`""["constructor"]["constructor"]("globalThis.${CANARY} = 1")()`, {});
    expect(canaryHolder[CANARY]).toBe(1);
  });

  it("a pré-validação antiga sozinha NÃO pegava o bypass (por isso o parser)", () => {
    expect(
      preValidateConditionExpression('{{@n:L.f}}["constructor"]["constructor"]("x")()')
    ).toEqual({ valid: true });
  });

  it("isBlockedConditionPropertyKey é case-insensitive", () => {
    expect(isBlockedConditionPropertyKey("constructor")).toBe(true);
    expect(isBlockedConditionPropertyKey("Constructor")).toBe(true);
    expect(isBlockedConditionPropertyKey("__PROTO__")).toBe(true);
    expect(isBlockedConditionPropertyKey("prototype")).toBe(true);
    expect(isBlockedConditionPropertyKey("name")).toBe(false);
  });
});

// ─── Runtime: só dados próprios, nunca código dos dados ──────────────────────

describe("condition-evaluator — isolamento em runtime", () => {
  it("não lê a cadeia de protótipos (métodos herdados viram undefined)", () => {
    expect(safeEval("__v0.hasOwnProperty === undefined", { __v0: { a: 1 } })).toBe(true);
    expect(safeEval("__v0.toString === undefined", { __v0: { a: 1 } })).toBe(true);
    expect(safeEval("__v0.includes === undefined", { __v0: "abc" })).toBe(true);
    expect(safeEval("__v0.valueOf === undefined", { __v0: 1 })).toBe(true);
  });

  it("funções vindas dos dados ficam inacessíveis", () => {
    let called = false;
    const ctx = {
      __v0: {
        f: () => {
          called = true;
          return 1;
        },
      },
    };
    expect(safeEval("__v0.f === undefined", ctx)).toBe(true);
    expect(called).toBe(false);
  });

  it("nunca invoca getters dos dados", () => {
    let touched = false;
    const data = {};
    Object.defineProperty(data, "secret", {
      enumerable: true,
      get() {
        touched = true;
        return "x";
      },
    });
    expect(safeEval("__v0.secret === undefined", { __v0: data })).toBe(true);
    expect(touched).toBe(false);
  });

  it("nunca chama includes/toString/valueOf definidos nos dados", () => {
    let called = false;
    const spy = () => {
      called = true;
      return "x";
    };
    const evil = { includes: spy, toString: spy, valueOf: spy, startsWith: spy };
    expect(() => evaluateSafeExpression("__v0.includes('x')", { __v0: evil })).toThrow(TypeError);
    expect(() => evaluateSafeExpression("__v0.startsWith('x')", { __v0: evil })).toThrow(TypeError);
    expect(safeEval("__v0 == 'x'", { __v0: evil })).toBe(false);
    expect(safeEval("__v0 + '' === '[object Object]'", { __v0: evil })).toBe(true);
    expect(safeEval("__v0.toString() === '[object Object]'", { __v0: evil })).toBe(true);
    expect(safeEval("'abc'.includes(__v0)", { __v0: evil })).toBe(false);
    expect(called).toBe(false);
  });

  it("chave __proto__ PRÓPRIA (JSON.parse) continua bloqueada", () => {
    const data = JSON.parse('{"__proto__": {"polluted": true}}');
    expect(parseConditionExpression('__v0["__proto__"].polluted').ok).toBe(false);
    expect(safeEval("__v0.polluted === undefined", { __v0: data })).toBe(true);
  });

  it("não polui protótipos nem globais", () => {
    safeEval("__v0.a === 1", { __v0: { a: 1 } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ─── Limites ──────────────────────────────────────────────────────────────────

describe("condition-evaluator — limites", () => {
  it("rejeita expressão vazia", () => {
    expect(parseConditionExpression("   ").ok).toBe(false);
  });

  it("rejeita expressão acima do tamanho máximo", () => {
    const huge = `__v0 === "${"a".repeat(MAX_CONDITION_EXPRESSION_LENGTH)}"`;
    expect(parseConditionExpression(huge).ok).toBe(false);
  });

  it("rejeita aninhamento excessivo sem estourar a pilha", () => {
    const deep = `${"(".repeat(500)}__v0${")".repeat(500)}`;
    const result = parseConditionExpression(deep);
    expect(result.ok).toBe(false);
    const bangs = `${"!".repeat(500)}__v0`;
    expect(parseConditionExpression(bangs).ok).toBe(false);
  });

  it("cadeia de && no limite de tamanho avalia sem derrubar o processo", () => {
    const expression = `${"1&&".repeat(6600)}1`;
    expect(expression.length).toBeLessThan(MAX_CONDITION_EXPRESSION_LENGTH);
    expect(parseConditionExpression(expression).ok).toBe(true);
    // Árvore de 6600 níveis: ou avalia, ou lança RangeError (que o executor
    // trata como falso) — nunca trava nem derruba o processo.
    let outcome: unknown;
    try {
      outcome = evaluateSafeExpression(expression, {});
    } catch (error) {
      outcome = error instanceof RangeError ? "range-error" : error;
    }
    expect([1, "range-error"]).toContain(outcome);
  });

  it("aceita cadeia longa de && (branch None com muitas opções)", () => {
    const parts = Array.from({ length: 60 }, (_, i) => `!(__v0.includes("opcao ${i}"))`);
    const expression = parts.join(" && ");
    expect(validateConditionExpression(expression)).toEqual({ valid: true });
    expect(safeEval(expression, { __v0: "nada" })).toBe(true);
    expect(safeEval(expression, { __v0: "opcao 42" })).toBe(false);
  });
});

// ─── Compatibilidade com a main: ?., ??, ternário e ** ───────────────────────
//
// Achado da revisão: na main o validador por regex aceitava essas construções
// e o new Function as avaliava; com o parser restrito elas viraram condição
// SEMPRE falsa. Agora são suportadas com a MESMA semântica do JS — provado
// contra o new Function (só aqui, em teste) num produto de valores.

type Outcome = { threw: true } | { threw: false; value: unknown };

function outcomeOf(run: () => unknown): Outcome {
  try {
    return { threw: false, value: run() };
  } catch {
    return { threw: true };
  }
}

function legacyRaw(expression: string, ctx: Ctx): unknown {
  const names = Object.keys(ctx);
  const values = Object.values(ctx);
  // biome-ignore lint/security/noGlobalEval: referência de semântica em teste
  const fn = new Function(...names, `return (${expression});`);
  return fn(...values);
}

const PRIMARY_VALUES: unknown[] = [
  undefined,
  null,
  0,
  1,
  -1,
  2.5,
  Number.NaN,
  "",
  "ok",
  "Sim",
  "a,b",
  true,
  false,
  [],
  ["x", "ok"],
  [{ x: 1 }],
  {},
  { status: "ok" },
  { status: null },
  { a: { b: 1 } },
  { a: null },
];

const SECONDARY_VALUES: unknown[] = [undefined, null, "", "x", 0, 3, { x: "ok" }];

const NEW_SYNTAX_EXPRESSIONS = [
  // optional chaining (propriedade, índice, métodos da whitelist)
  '__v0?.status === "ok"',
  "__v0?.status",
  "__v0?.a.b",
  "__v0?.a?.b",
  "(__v0?.a).b",
  "__v0?.[0]",
  "__v0?.[0]?.x",
  "__v0?.length > 0",
  '__v0?.includes("ok")',
  '__v0?.toLowerCase()?.includes("s")',
  "__v0?.toString() === '1'",
  "__v0?.includes(__v1.x)",
  // nullish coalescing
  '__v0 ?? "padrão"',
  '__v0 ?? __v1 ?? "c"',
  '(__v0 || __v1) ?? "x"',
  '__v0 ?? (__v1 && "y")',
  "(__v0 ?? 0) > 0",
  "!(__v0 ?? false)",
  '__v0?.["status"] ?? "vazio"',
  // ternário
  '__v0 ? "a" : "b"',
  "__v0 ? __v1 ? 1 : 2 : 3",
  '__v0 > 10 ? "alto" : __v0 > 5 ? "médio" : "baixo"',
  "__v0 ?? 0 ? 1 : 2",
  "__v0 || __v1 ? __v0 : __v1",
  "__v0 ? 1 : 2 === 2",
  '(__v0?.status === "ok") ? __v1 : !__v1',
  "__v0?.5:1",
  // exponenciação
  "__v0 ** 2",
  "2 ** 3 ** 2",
  "(-2) ** 2",
  "2 ** -1",
  "__v0 * 2 ** 2",
  "-(2 ** 2)",
  "__v0 ** __v1",
];

describe("condition-evaluator — compatibilidade com a main (?., ??, ternário, **)", () => {
  for (const expression of NEW_SYNTAX_EXPRESSIONS) {
    it(`igual ao new Function: ${expression}`, () => {
      expect(parseConditionExpression(expression)).toMatchObject({ ok: true });
      expect(validateConditionExpression(expression)).toEqual({ valid: true });
      for (const v0 of PRIMARY_VALUES) {
        for (const v1 of SECONDARY_VALUES) {
          const ctx = { __v0: v0, __v1: v1 };
          const safe = outcomeOf(() => evaluateSafeExpression(expression, ctx));
          const legacy = outcomeOf(() => legacyRaw(expression, ctx));
          expect(safe, `__v0=${JSON.stringify(v0)} __v1=${JSON.stringify(v1)}`).toEqual(legacy);
        }
      }
    });
  }

  it('cenário do achado: {{@http1:API.data}}?.status === "ok" volta a ser válida e verdadeira', () => {
    expect(validateRawConditionExpression('{{@http1:API.data}}?.status === "ok"')).toEqual({
      valid: true,
    });
    expect(safeEval('__v0?.status === "ok"', { __v0: { status: "ok" } })).toBe(true);
  });

  it("formas citadas no achado voltam a validar", () => {
    for (const expression of [
      '__v0?.includes("x")',
      '__v0 ?? ""',
      "__v0 ? __v1 : __v2",
      "__v0 ** 2",
    ]) {
      expect(validateConditionExpression(expression), expression).toEqual({ valid: true });
    }
  });

  it("?. encurta a cadeia inteira sem avaliar os argumentos", () => {
    // __v1.x lançaria (undefined), mas não é avaliado: o receptor é null.
    expect(
      evaluateSafeExpression("__v0?.includes(__v1.x)", { __v0: null, __v1: undefined })
    ).toBeUndefined();
    // Parênteses encerram a cadeia: (undefined).b lança, como no JS.
    expect(() => evaluateSafeExpression("(__v0?.a).b", { __v0: null })).toThrow(TypeError);
  });

  it("?? só cai para a direita com null/undefined (0, '' e false ficam)", () => {
    expect(evaluateSafeExpression('__v0 ?? "x"', { __v0: 0 })).toBe(0);
    expect(evaluateSafeExpression('__v0 ?? "x"', { __v0: "" })).toBe("");
    expect(evaluateSafeExpression('__v0 ?? "x"', { __v0: false })).toBe(false);
    expect(evaluateSafeExpression('__v0 ?? "x"', { __v0: null })).toBe("x");
  });

  it("ternário só avalia o ramo escolhido", () => {
    // O ramo não escolhido lançaria (leitura em undefined).
    expect(evaluateSafeExpression("__v0 ? 1 : __v1.x", { __v0: true, __v1: undefined })).toBe(1);
    expect(evaluateSafeExpression("__v0 ? __v1.x : 2", { __v0: false, __v1: undefined })).toBe(2);
  });
});

// ─── Construções que são SyntaxError no JS: rejeitadas aqui também ───────────

describe("condition-evaluator — erros de sintaxe iguais aos do JS", () => {
  const JS_SYNTAX_ERRORS = [
    "-2 ** 2",
    "!__v0 ** 2",
    "2 ** -1 ** 2",
    "__v0 ?? 1 || 2",
    "__v0 || 1 ?? 2",
    "__v0 && 1 ?? 2",
    "__v0 ?? 1 && 2",
    "__v0 ?",
    "__v0 ? 1",
    "__v0 ? 1 :",
    "__v0 ? : 1",
    "__v0 ? 1 : 2 : 3",
    "__v0?.",
    "__v0?.[]",
    "?.__v0",
    "__v0 ??",
    "?? __v0",
  ];

  for (const expression of JS_SYNTAX_ERRORS) {
    it(`rejeita (JS também): ${expression}`, () => {
      // biome-ignore lint/security/noGlobalEval: referência de sintaxe em teste
      expect(() => new Function("__v0", `return (${expression});`)).toThrow(SyntaxError);
      expect(parseConditionExpression(expression).ok).toBe(false);
      expect(validateConditionExpression(expression).valid).toBe(false);
    });
  }

  it("mensagens explicam o motivo", () => {
    expect(parseConditionExpression("-2 ** 2")).toMatchObject({
      ok: false,
      error: expect.stringContaining('Unary operator before "**" requires parentheses'),
    });
    expect(parseConditionExpression("__v0 ?? 1 || 2")).toMatchObject({
      ok: false,
      error: expect.stringContaining('Cannot mix "??" with "&&" or "||"'),
    });
    expect(parseConditionExpression("__v0?.()")).toMatchObject({
      ok: false,
      error: expect.stringContaining("Optional calls"),
    });
  });
});

// ─── Crase e bitwise: continuam rejeitados, com mensagem clara ────────────────

describe("condition-evaluator — template literal e bitwise seguem rejeitados", () => {
  it("template literal (crase) tem mensagem própria no parser, no validador e no save", () => {
    for (const expression of ["__v0 === `sim`", "`${__v0}` === 'x'", "`quero saber mais`"]) {
      expect(parseConditionExpression(expression), expression).toMatchObject({
        ok: false,
        error: expect.stringContaining("Template literals (backticks) are not supported"),
      });
      expect(validateConditionExpression(expression), expression).toEqual({
        valid: false,
        error: TEMPLATE_LITERAL_NOT_SUPPORTED_ERROR,
      });
    }
    expect(validateRawConditionExpression("{{@n:L.f}} === `sim`")).toEqual({
      valid: false,
      error: TEMPLATE_LITERAL_NOT_SUPPORTED_ERROR,
    });
  });

  it("crase DENTRO de aspas é só dado (continua válida)", () => {
    expect(validateConditionExpression('__v0 === "a`b"')).toEqual({ valid: true });
    expect(safeEval('__v0 === "a`b"', { __v0: "a`b" })).toBe(true);
  });

  it("operadores bitwise têm mensagem própria", () => {
    const bitwiseError = expect.stringContaining("Bitwise operators are not supported");
    for (const expression of ["__v0 & 1", "__v0 | 0", "~__v0", "__v0 ^ 1"]) {
      expect(parseConditionExpression(expression), expression).toMatchObject({
        ok: false,
        error: bitwiseError,
      });
      expect(validateConditionExpression(expression), expression).toMatchObject({
        valid: false,
        error: bitwiseError,
      });
    }
    for (const expression of ["__v0 << 1", "__v0 >> 1", "__v0 >>> 1"]) {
      expect(parseConditionExpression(expression), expression).toMatchObject({
        ok: false,
        error: bitwiseError,
      });
      expect(validateConditionExpression(expression).valid, expression).toBe(false);
    }
    // && e || continuam sendo lógicos (não confundidos com bitwise).
    expect(validateConditionExpression("__v0 && __v1 || __v2")).toEqual({ valid: true });
  });
});

// ─── As novas construções NÃO reabrem nenhum bypass ──────────────────────────

const NEW_SYNTAX_BYPASS_PAYLOADS: string[] = [
  "__v0?.constructor",
  "__v0?.CONSTRUCTOR",
  '__v0?.["constructor"]',
  "__v0?.['\\u0063onstructor']",
  '__v0?.["\\u{63}onstructor"]',
  '__v0?.["\\x5f\\x5fproto\\x5f\\x5f"]',
  "__v0?.__proto__",
  '__v0?.["__proto__"]',
  "__v0?.prototype",
  "__v0?.__lookupGetter__",
  "__v0?.a?.constructor",
  "__v0?.[0]?.['constructor']",
  "__v0?.toString()?.constructor",
  "__v0?.toString?.()",
  "__v0?.()",
  '__v0.includes?.("x")',
  '__v0?.includes?.("x")',
  `__v0?.["constructor"]?.["constructor"]?.("globalThis.${CANARY} = 1")?.()`,
  `(__v0 ?? "")["constructor"]["constructor"]("globalThis.${CANARY} = 1")()`,
  '(__v0 ?? "").constructor',
  '(__v0 ? __v0 : "")["constructor"]',
  `__v0 ? __v0["constructor"]["constructor"]("globalThis.${CANARY} = 1")() : 0`,
  `__v0 ? 0 : ""["constructor"]["constructor"]("globalThis.${CANARY} = 1")()`,
  "__v0 ? globalThis : 1",
  "__v0 ?? process",
  "__v0 ?? process.env",
  "true ? this : 1",
  '__v0 ?? Function("return 1")()',
  '(__v0 ?? __v1)("x")',
  '(__v0 ? __v1 : __v1)("x")',
  "__v0 ** __v1()",
  "2 ** __v0.constructor",
  "__v0?.[__v1]",
  '__v0?.["const" + "ructor"]',
  "__v0?.[`constructor`]",
  "__v0 ?? __v1 = 1",
  "__v0 ??= 1",
  "__v0 ||= 1",
  "__v0 &&= 1",
  "__v0 **= 2",
  "__v0?.valueOf()",
  "__v0?.map(__v1)",
  "__v0 ? 1 : 2, 3",
  "__v0 ? (__v1 = 1) : 0",
  "__v0?.a = 1",
  "new __v0?.a",
];

describe("condition-evaluator — ?., ??, ternário e ** não reabrem bypass", () => {
  for (const payload of NEW_SYNTAX_BYPASS_PAYLOADS) {
    it(`rejeita: ${payload}`, () => {
      expect(parseConditionExpression(payload).ok).toBe(false);
      expect(validateConditionExpression(payload).valid).toBe(false);
      expect(() =>
        evaluateSafeExpression(payload, { __v0: "abc", __v1: "x" })
      ).toThrow();
      expect(canaryHolder[CANARY]).toBeUndefined();
    });
  }

  it("contraste: o payload via ?? executava código com new Function", () => {
    legacyEval(`(__v0 ?? "")["constructor"]["constructor"]("globalThis.${CANARY} = 1")()`, {
      __v0: null,
    });
    expect(canaryHolder[CANARY]).toBe(1);
  });

  it("isolamento em runtime vale também para ?., ?? e ternário", () => {
    let called = false;
    const spy = () => {
      called = true;
      return "x";
    };
    let touched = false;
    const withGetter = {};
    Object.defineProperty(withGetter, "secret", {
      enumerable: true,
      get() {
        touched = true;
        return "x";
      },
    });
    const evil = { includes: spy, toString: spy, valueOf: spy, f: spy };

    // Sem cadeia de protótipos e sem funções dos dados.
    expect(safeEval("__v0?.hasOwnProperty === undefined", { __v0: { a: 1 } })).toBe(true);
    expect(safeEval("__v0?.f === undefined", { __v0: evil })).toBe(true);
    expect(safeEval('(__v0?.f ?? "fallback") === "fallback"', { __v0: evil })).toBe(true);
    // Variável que é função vira undefined → ?? cai para a direita.
    expect(evaluateSafeExpression("__v0 ?? 1", { __v0: spy })).toBe(1);
    // Getter nunca invocado.
    expect(safeEval('(__v0?.secret ?? "nada") === "nada"', { __v0: withGetter })).toBe(true);
    // Coerções sem valueOf/toString dos dados.
    expect(
      safeEval("__v0 ? __v0.toString() === '[object Object]' : false", { __v0: evil })
    ).toBe(true);
    expect(Number.isNaN(evaluateSafeExpression("__v0 ** 2", { __v0: evil }))).toBe(true);
    expect(() => evaluateSafeExpression("__v0?.includes('x')", { __v0: evil })).toThrow(TypeError);
    expect(called).toBe(false);
    expect(touched).toBe(false);

    // __proto__ PRÓPRIO (JSON.parse) segue inacessível via ?.
    const data = JSON.parse('{"__proto__": {"polluted": true}}');
    expect(parseConditionExpression('__v0?.["__proto__"]?.polluted').ok).toBe(false);
    expect(safeEval("__v0?.polluted === undefined", { __v0: data })).toBe(true);
  });

  it("ternário e ** respeitam o limite de profundidade sem estourar a pilha", () => {
    const ternary = `${"__v0 ? ".repeat(500)}1${" : 2".repeat(500)}`;
    expect(parseConditionExpression(ternary).ok).toBe(false);
    const power = `${"2 ** ".repeat(500)}2`;
    expect(parseConditionExpression(power).ok).toBe(false);
    // Dentro do limite, funciona.
    expect(
      evaluateSafeExpression(`${"__v0 ? ".repeat(20)}1${" : 2".repeat(20)}`, { __v0: true })
    ).toBe(1);
  });

  it("cadeia longa de ?. avalia ou lança RangeError, nunca derruba o processo", () => {
    const expression = `__v0${"?.a".repeat(6000)}`;
    expect(expression.length).toBeLessThan(MAX_CONDITION_EXPRESSION_LENGTH);
    expect(parseConditionExpression(expression).ok).toBe(true);
    let outcome: unknown;
    try {
      outcome = evaluateSafeExpression(expression, { __v0: null });
    } catch (error) {
      outcome = error instanceof RangeError ? "range-error" : error;
    }
    expect([undefined, "range-error"]).toContain(outcome);
  });
});
