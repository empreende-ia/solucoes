import { describe, it, expect } from 'vitest'
import {
  validateConditionExpression,
  preValidateConditionExpression,
  sanitizeForDisplay,
  validateRawConditionExpression,
  findInvalidWorkflowConditions,
  describeWorkflowConditionIssues,
} from './condition-validator'
import { compileFlow } from './flow/compile'
import type { Flow, Step } from './flow/types'

// ─── validateConditionExpression ─────────────────────────────────────────────

describe('validateConditionExpression', () => {
  // ── Expressões vazias / inválidas ──────────────────────────────────────────

  describe('expressões vazias e inválidas', () => {
    it('deve rejeitar expressão vazia (string vazia)', () => {
      const result = validateConditionExpression('')
      expect(result).toEqual({ valid: false, error: 'Condition expression cannot be empty' })
    })

    it('deve rejeitar expressão apenas com espaços', () => {
      const result = validateConditionExpression('   ')
      expect(result).toEqual({ valid: false, error: 'Condition expression cannot be empty' })
    })

    it('deve rejeitar undefined coerced como string vazia', () => {
      const result = validateConditionExpression(undefined as unknown as string)
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar null coerced como string vazia', () => {
      const result = validateConditionExpression(null as unknown as string)
      expect(result.valid).toBe(false)
    })
  })

  // ── Expressões válidas ─────────────────────────────────────────────────────

  describe('expressões válidas', () => {
    it('deve aceitar comparação simples com ===', () => {
      expect(validateConditionExpression("__v0 === 'test'")).toEqual({ valid: true })
    })

    it('deve aceitar comparação com !==', () => {
      expect(validateConditionExpression("__v0 !== 'hello'")).toEqual({ valid: true })
    })

    it('deve aceitar comparação com ==', () => {
      expect(validateConditionExpression('__v0 == 42')).toEqual({ valid: true })
    })

    it('deve aceitar comparação com !=', () => {
      expect(validateConditionExpression("__v0 != 'x'")).toEqual({ valid: true })
    })

    it('deve aceitar operadores > e <', () => {
      expect(validateConditionExpression('__v0 > 10')).toEqual({ valid: true })
      expect(validateConditionExpression('__v0 < 100')).toEqual({ valid: true })
    })

    it('deve aceitar operadores >= e <=', () => {
      expect(validateConditionExpression('__v0 >= 5')).toEqual({ valid: true })
      expect(validateConditionExpression('__v0 <= 50')).toEqual({ valid: true })
    })

    it('deve aceitar operadores lógicos && e ||', () => {
      expect(validateConditionExpression('__v0 > 10 && __v1 < 20')).toEqual({ valid: true })
      expect(validateConditionExpression("__v0 === 'a' || __v1 === 'b'")).toEqual({ valid: true })
    })

    it('deve aceitar operador de negação !', () => {
      expect(validateConditionExpression('!__v0')).toEqual({ valid: true })
    })

    it('deve aceitar parênteses para agrupamento', () => {
      expect(
        validateConditionExpression("(__v0 > 10) && (__v1 === 'test')")
      ).toEqual({ valid: true })
    })

    it('deve aceitar literais booleanos', () => {
      expect(validateConditionExpression('__v0 === true')).toEqual({ valid: true })
      expect(validateConditionExpression('__v0 === false')).toEqual({ valid: true })
    })

    it('deve aceitar literais null e undefined', () => {
      expect(validateConditionExpression('__v0 === null')).toEqual({ valid: true })
      expect(validateConditionExpression('__v0 === undefined')).toEqual({ valid: true })
    })

    it('deve aceitar comparação com números', () => {
      expect(validateConditionExpression('__v0 === 42')).toEqual({ valid: true })
    })

    it('deve aceitar comparação com strings aspas simples', () => {
      expect(validateConditionExpression("__v0 === 'hello world'")).toEqual({ valid: true })
    })

    it('deve aceitar comparação com strings aspas duplas', () => {
      expect(validateConditionExpression('__v0 === "hello"')).toEqual({ valid: true })
    })

    it('deve aceitar múltiplas variáveis', () => {
      expect(validateConditionExpression('__v0 === __v1')).toEqual({ valid: true })
      expect(validateConditionExpression('__v0 > __v1 && __v2 < __v3')).toEqual({ valid: true })
    })
  })

  // ── Métodos permitidos ─────────────────────────────────────────────────────

  describe('métodos permitidos', () => {
    it('deve aceitar .includes()', () => {
      expect(validateConditionExpression("__v0.includes('test')")).toEqual({ valid: true })
    })

    it('deve aceitar .startsWith()', () => {
      expect(validateConditionExpression("__v0.startsWith('abc')")).toEqual({ valid: true })
    })

    it('deve aceitar .endsWith()', () => {
      expect(validateConditionExpression("__v0.endsWith('xyz')")).toEqual({ valid: true })
    })

    it('deve aceitar .toString()', () => {
      expect(validateConditionExpression("__v0.toString() === '42'")).toEqual({ valid: true })
    })

    it('deve aceitar .toLowerCase()', () => {
      expect(validateConditionExpression("__v0.toLowerCase() === 'abc'")).toEqual({ valid: true })
    })

    it('deve aceitar .toUpperCase()', () => {
      expect(validateConditionExpression("__v0.toUpperCase() === 'ABC'")).toEqual({ valid: true })
    })

    it('deve aceitar .trim()', () => {
      expect(validateConditionExpression("__v0.trim() === 'hello'")).toEqual({ valid: true })
    })
  })

  // ── Acesso por bracket válido ──────────────────────────────────────────────

  describe('acesso por bracket', () => {
    it('deve aceitar acesso por índice numérico em variável', () => {
      expect(validateConditionExpression("__v0[0] === 'a'")).toEqual({ valid: true })
    })

    it('deve aceitar acesso por string literal com aspas simples', () => {
      expect(validateConditionExpression("__v0['name'] === 'test'")).toEqual({ valid: true })
    })

    it('deve aceitar acesso por string literal com aspas duplas', () => {
      expect(validateConditionExpression('__v0["name"] === "test"')).toEqual({ valid: true })
    })

    it('deve rejeitar bracket em variável não-workflow', () => {
      const result = validateConditionExpression("obj[0] === 'a'")
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('Bracket notation is only allowed on workflow variables')
    })

    it('deve rejeitar conteúdo perigoso dentro de brackets', () => {
      const result = validateConditionExpression("__v0[eval('x')]")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar array literal standalone (interceptado pela regra de vírgula)', () => {
      // DANGEROUS_PATTERNS intercepta a vírgula antes de checkBracketExpressions rodar
      const result = validateConditionExpression("[1, 2, 3]")
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('disallowed syntax')
    })
  })

  // ── Padrões perigosos: operadores de atribuição ────────────────────────────

  describe('bloqueio de operadores de atribuição', () => {
    it('deve rejeitar atribuição simples (=)', () => {
      const result = validateConditionExpression('__v0 = 42')
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('disallowed syntax')
    })

    it('deve rejeitar += ', () => {
      const result = validateConditionExpression('__v0 += 1')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar -=', () => {
      const result = validateConditionExpression('__v0 -= 1')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar *=', () => {
      const result = validateConditionExpression('__v0 *= 2')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar /=', () => {
      const result = validateConditionExpression('__v0 /= 2')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar %=', () => {
      const result = validateConditionExpression('__v0 %= 2')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar ^=', () => {
      const result = validateConditionExpression('__v0 ^= 1')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar |=', () => {
      const result = validateConditionExpression('__v0 |= 1')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar &=', () => {
      const result = validateConditionExpression('__v0 &= 1')
      expect(result.valid).toBe(false)
    })
  })

  // ── Padrões perigosos: execução de código ──────────────────────────────────

  describe('bloqueio de execução de código', () => {
    it('deve rejeitar eval()', () => {
      const result = validateConditionExpression("eval('malicious')")
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('disallowed syntax')
    })

    it('deve rejeitar Function()', () => {
      const result = validateConditionExpression("Function('return 1')()")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar import()', () => {
      const result = validateConditionExpression("import('fs')")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar require()', () => {
      const result = validateConditionExpression("require('fs')")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar new', () => {
      const result = validateConditionExpression('new Date()')
      expect(result.valid).toBe(false)
    })
  })

  // ── Padrões perigosos: globais ─────────────────────────────────────────────

  describe('bloqueio de globais perigosos', () => {
    it('deve rejeitar process', () => {
      const result = validateConditionExpression('process.env.SECRET')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar global', () => {
      const result = validateConditionExpression('global.something')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar window', () => {
      const result = validateConditionExpression('window.location')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar document', () => {
      const result = validateConditionExpression('document.cookie')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar constructor', () => {
      const result = validateConditionExpression('__v0.constructor')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar __proto__', () => {
      const result = validateConditionExpression('__v0.__proto__')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar prototype', () => {
      const result = validateConditionExpression('__v0.prototype')
      expect(result.valid).toBe(false)
    })
  })

  // ── Padrões perigosos: fluxo de controle ───────────────────────────────────

  describe('bloqueio de fluxo de controle', () => {
    it('deve rejeitar while', () => {
      const result = validateConditionExpression('while (true) {}')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar for', () => {
      const result = validateConditionExpression('for (let i = 0; i < 10; i++) {}')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar do', () => {
      const result = validateConditionExpression('do { } while (true)')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar switch', () => {
      const result = validateConditionExpression('switch (__v0) {}')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar try/catch/finally', () => {
      expect(validateConditionExpression('try { } catch (e) { }')).toHaveProperty('valid', false)
    })

    it('deve rejeitar throw', () => {
      const result = validateConditionExpression("throw new Error('x')")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar return', () => {
      const result = validateConditionExpression('return true')
      expect(result.valid).toBe(false)
    })
  })

  // ── Padrões perigosos: template literals, incremento, bitwise, etc. ────────

  describe('bloqueio de padrões diversos', () => {
    it('deve rejeitar template literals com expressões', () => {
      const result = validateConditionExpression('`hello ${__v0}`')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar incremento ++', () => {
      const result = validateConditionExpression('__v0++')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar decremento --', () => {
      const result = validateConditionExpression('__v0--')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar operadores bitwise <<', () => {
      const result = validateConditionExpression('__v0 << 2')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar operadores bitwise >>', () => {
      const result = validateConditionExpression('__v0 >> 2')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar operadores bitwise >>>', () => {
      const result = validateConditionExpression('__v0 >>> 2')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar ponto e vírgula (separador de statements)', () => {
      const result = validateConditionExpression("__v0 === 'a'; __v1 === 'b'")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar object literals', () => {
      const result = validateConditionExpression("{ key: 'value' }")
      expect(result.valid).toBe(false)
    })
  })

  // ── Métodos não permitidos ─────────────────────────────────────────────────

  describe('bloqueio de métodos não permitidos', () => {
    it('deve rejeitar .map() (interceptado pelo = do arrow function)', () => {
      // O `=>` contém `=` que casa com o padrão de atribuição antes de checkMethodCalls
      const result = validateConditionExpression('__v0.map(x => x)')
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('disallowed syntax')
    })

    it('deve rejeitar .map() sem arrow function', () => {
      // Sem arrow function, checkMethodCalls detecta o método
      const result = validateConditionExpression("__v0.map()")
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('Method "map" is not allowed')
    })

    it('deve rejeitar .forEach()', () => {
      const result = validateConditionExpression('__v0.forEach(console.log)')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar .exec()', () => {
      const result = validateConditionExpression("__v0.exec('test')")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar .replace()', () => {
      const result = validateConditionExpression("__v0.replace('a', 'b')")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar .split()', () => {
      const result = validateConditionExpression("__v0.split(',')")
      expect(result.valid).toBe(false)
    })
  })

  // ── Parênteses ─────────────────────────────────────────────────────────────

  describe('validação de parênteses', () => {
    it('deve rejeitar parênteses não balanceados (mais abertos)', () => {
      const result = validateConditionExpression('(__v0 === 1')
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('Unbalanced parentheses')
    })

    it('deve rejeitar parênteses não balanceados (mais fechados)', () => {
      const result = validateConditionExpression('__v0 === 1)')
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('Unbalanced parentheses')
    })

    it('deve aceitar parênteses aninhados corretamente', () => {
      expect(
        validateConditionExpression('((__v0 === 1) && (__v1 === 2))')
      ).toEqual({ valid: true })
    })
  })

  // ── Identificadores não autorizados ────────────────────────────────────────

  describe('identificadores não autorizados', () => {
    it('deve rejeitar identificador desconhecido', () => {
      const result = validateConditionExpression('myVar === 10')
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('Unknown identifier "myVar"')
    })

    it('deve rejeitar múltiplos identificadores desconhecidos', () => {
      const result = validateConditionExpression('foo === bar')
      expect(result.valid).toBe(false)
      expect((result as { error: string }).error).toContain('Unknown identifier')
    })
  })

  // ── Case insensitivity dos padrões perigosos ───────────────────────────────

  describe('case insensitivity dos padrões perigosos', () => {
    it('deve rejeitar EVAL em maiúsculas', () => {
      const result = validateConditionExpression("EVAL('x')")
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar Window em mixed case', () => {
      const result = validateConditionExpression('Window.location')
      expect(result.valid).toBe(false)
    })

    it('deve rejeitar PROCESS em maiúsculas', () => {
      const result = validateConditionExpression('PROCESS.env')
      expect(result.valid).toBe(false)
    })
  })

  // ── Chamadas consecutivas (estabilidade com regex globais) ─────────────────

  describe('estabilidade com múltiplas chamadas consecutivas', () => {
    it('deve retornar resultados consistentes em chamadas consecutivas', () => {
      // Regex com flag /g mantém lastIndex, então precisamos validar o reset
      for (let i = 0; i < 5; i++) {
        expect(validateConditionExpression("__v0 === 'test'")).toEqual({ valid: true })
        expect(validateConditionExpression("eval('x')")).toHaveProperty('valid', false)
      }
    })
  })
})

// ─── preValidateConditionExpression ──────────────────────────────────────────

describe('preValidateConditionExpression', () => {
  it('deve rejeitar expressão vazia', () => {
    const result = preValidateConditionExpression('')
    expect(result).toEqual({ valid: false, error: 'Condition must be a non-empty string' })
  })

  it('deve rejeitar null', () => {
    const result = preValidateConditionExpression(null as unknown as string)
    expect(result).toEqual({ valid: false, error: 'Condition must be a non-empty string' })
  })

  it('deve rejeitar undefined', () => {
    const result = preValidateConditionExpression(undefined as unknown as string)
    expect(result).toEqual({ valid: false, error: 'Condition must be a non-empty string' })
  })

  it('deve rejeitar número (tipo inválido)', () => {
    const result = preValidateConditionExpression(42 as unknown as string)
    expect(result).toEqual({ valid: false, error: 'Condition must be a non-empty string' })
  })

  it('deve aceitar expressão segura', () => {
    expect(preValidateConditionExpression("{{@node1:Label.field}} === 'test'")).toEqual({ valid: true })
  })

  describe('deve detectar cada keyword perigosa', () => {
    const keywords = [
      'eval', 'Function', 'import', 'require', 'process',
      'global', 'window', 'document', '__proto__', 'constructor', 'prototype',
    ]

    for (const keyword of keywords) {
      it(`deve rejeitar keyword "${keyword}"`, () => {
        const result = preValidateConditionExpression(`${keyword}('test')`)
        expect(result.valid).toBe(false)
        expect((result as { error: string }).error).toContain('disallowed keyword')
      })
    }
  })

  it('deve ser case-insensitive na detecção de keywords', () => {
    expect(preValidateConditionExpression('EVAL()')).toHaveProperty('valid', false)
    expect(preValidateConditionExpression('Process.env')).toHaveProperty('valid', false)
    expect(preValidateConditionExpression('WINDOW.alert')).toHaveProperty('valid', false)
  })
})

// ─── Masking de literais de string: código vs dados (bugs #2/#3/#6) ──────────

describe('validateConditionExpression — conteúdo de string é DADO opaco', () => {
  it('aceita literal com 3+ palavras (não vira identificador não autorizado) [#2]', () => {
    expect(validateConditionExpression('__v0.includes("Quero saber mais")')).toEqual({ valid: true })
    expect(validateConditionExpression('__v0 === "Falar com atendente"')).toEqual({ valid: true })
  })

  it('aceita literal com vírgula [#1/#6]', () => {
    expect(validateConditionExpression('__v0 === "Sim, quero mais"')).toEqual({ valid: true })
  })

  it('aceita literal com parêntese solto — emoticon ":)" [#6]', () => {
    expect(validateConditionExpression('__v0.includes("obrigado :)")')).toEqual({ valid: true })
  })

  it('aceita literal com ponto e vírgula [#6]', () => {
    expect(validateConditionExpression('__v0 === "primeiro; segundo"')).toEqual({ valid: true })
  })

  it('aceita literal contendo process/document/import [#3]', () => {
    expect(validateConditionExpression('__v0.includes("Processo")')).toEqual({ valid: true })
    expect(validateConditionExpression('__v0.includes("Documento")')).toEqual({ valid: true })
    expect(validateConditionExpression('__v0 === "Importante"')).toEqual({ valid: true })
  })

  it('aceita literal com sinal de igual', () => {
    expect(validateConditionExpression('__v0.includes("a=b")')).toEqual({ valid: true })
  })

  it('aceita {{var.key}} substituído por __vN (referência permitida) [#4]', () => {
    // O executor troca {{var.reply_x}} por __vN antes de validar.
    expect(validateConditionExpression('__v0.includes("urgente")')).toEqual({ valid: true })
  })
})

describe('validateConditionExpression — ainda barra CÓDIGO fora das aspas', () => {
  it('rejeita ponto e vírgula fora de string', () => {
    expect(validateConditionExpression("__v0 === 'a'; __v1 === 'b'").valid).toBe(false)
  })

  it('rejeita eval() mesmo com argumento string mascarado', () => {
    expect(validateConditionExpression("eval('x')").valid).toBe(false)
  })

  it('rejeita identificador desconhecido fora de string', () => {
    const result = validateConditionExpression('foo === "bar"')
    expect(result.valid).toBe(false)
    expect((result as { error: string }).error).toContain('Unknown identifier')
  })

  it('rejeita template literal com ${} — crase NÃO é mascarada', () => {
    expect(validateConditionExpression('`x ${__v0}`').valid).toBe(false)
  })

  it('rejeita atribuição fora de string', () => {
    expect(validateConditionExpression('__v0 = "x"').valid).toBe(false)
  })

  it('rejeita vírgula fora de string', () => {
    expect(validateConditionExpression('__v0, __v1').valid).toBe(false)
  })
})

describe('preValidateConditionExpression — keyword só conta como CÓDIGO (fora das aspas)', () => {
  it('aceita "Documento"/"Processo"/"Importante" dentro de string [#3]', () => {
    expect(preValidateConditionExpression('{{@n:L.f}}.includes("Documento")')).toEqual({ valid: true })
    expect(preValidateConditionExpression('{{@n:L.f}}.includes("Processo")')).toEqual({ valid: true })
    expect(preValidateConditionExpression('{{@n:L.f}} === "Importante"')).toEqual({ valid: true })
  })

  it('ainda rejeita a keyword usada como código (fora das aspas)', () => {
    expect(preValidateConditionExpression('process.env').valid).toBe(false)
    expect(preValidateConditionExpression('eval("x")').valid).toBe(false)
  })
})

// ─── sanitizeForDisplay ──────────────────────────────────────────────────────

describe('sanitizeForDisplay', () => {
  it('deve escapar < para &lt;', () => {
    expect(sanitizeForDisplay('<script>')).toBe('&lt;script&gt;')
  })

  it('deve escapar > para &gt;', () => {
    expect(sanitizeForDisplay('a > b')).toBe('a &gt; b')
  })

  it('deve escapar " para &quot;', () => {
    expect(sanitizeForDisplay('"hello"')).toBe('&quot;hello&quot;')
  })

  it("deve escapar ' para &#39;", () => {
    expect(sanitizeForDisplay("it's")).toBe('it&#39;s')
  })

  it('deve escapar múltiplos caracteres na mesma string', () => {
    expect(sanitizeForDisplay('<div class="test">it\'s</div>')).toBe(
      '&lt;div class=&quot;test&quot;&gt;it&#39;s&lt;/div&gt;'
    )
  })

  it('deve retornar string vazia para entrada vazia', () => {
    expect(sanitizeForDisplay('')).toBe('')
  })

  it('deve preservar texto sem caracteres especiais', () => {
    expect(sanitizeForDisplay('hello world 123')).toBe('hello world 123')
  })

  it('deve lidar com & (não mencionado no código, mas verifica ausência)', () => {
    // O código NÃO escapa & — verificamos o comportamento real
    expect(sanitizeForDisplay('a & b')).toBe('a & b')
  })
})

// ─── Bypass por colchete/escapes (achado crítico da auditoria 2026-10-11) ─────

describe('validateConditionExpression — bypass do sandbox por colchete (RCE)', () => {
  const payloads = [
    '__v0["constructor"]["constructor"]("return process.version")()',
    '""["constructor"]["constructor"]("return process.version")()',
    "''['constructor']['constructor']('return 1')()",
    '__v0["\\u0063onstructor"]',
    "__v0['\\x63onstructor']",
    '__v0["__proto__"]',
    "__v0['prototype']",
    '__v0[0]["constructor"]',
    '__v0["includes"]("x")',
    '__v0.toString()["constructor"]',
    '(__v0)["constructor"]',
  ]

  for (const payload of payloads) {
    it(`rejeita: ${payload}`, () => {
      expect(validateConditionExpression(payload).valid).toBe(false)
      expect(validateRawConditionExpression(payload.replace(/__v0/g, '{{@n:L.f}}')).valid).toBe(false)
    })
  }
})

// ─── Validação do grafo cru (PATCH/publish/rollback/create) ───────────────────

function conditionNode(id: string, condition: unknown, label = id) {
  return {
    id,
    type: 'action',
    position: { x: 0, y: 0 },
    data: { type: 'action', label, config: { actionType: 'Condition', condition } },
  }
}

describe('limite de tamanho (antes das regex superlineares)', () => {
  it('validate e preValidate rejeitam expressão acima do limite sem processar', () => {
    const huge = 'a['.repeat(15_000)
    expect(validateConditionExpression(huge)).toEqual({
      valid: false,
      error: expect.stringContaining('too long'),
    })
    expect(preValidateConditionExpression(huge)).toEqual({
      valid: false,
      error: expect.stringContaining('too long'),
    })
  })

  it('palavra longa seguida de "[" não é quadrática na checagem de colchetes', () => {
    const started = Date.now()
    const result = validateConditionExpression(`${'a'.repeat(19_000)}[`)
    expect(result.valid).toBe(false)
    expect(Date.now() - started).toBeLessThan(1500)
  })
})

describe('validateRawConditionExpression', () => {
  it('aceita referências {{@id:Label.campo}} e {{var.chave}} como o executor', () => {
    expect(validateRawConditionExpression('{{@ask__var:Resposta.value}} === "Sim"')).toEqual({ valid: true })
    expect(validateRawConditionExpression('{{var.reply_ask}}.includes("urgente")')).toEqual({ valid: true })
    expect(
      validateRawConditionExpression('!({{var.reply_ask}}.includes("a")) && !({{@__trigger:Gatilho.message}} === "b")')
    ).toEqual({ valid: true })
  })

  it('rejeita keyword perigosa fora de string na expressão crua', () => {
    expect(validateRawConditionExpression('process.env.X').valid).toBe(false)
  })
})

describe('findInvalidWorkflowConditions', () => {
  it('não acusa nada num grafo compilado pela UI', () => {
    const cond: Step = {
      id: 'cond',
      type: 'condition',
      name: 'Condição',
      config: {},
      next: null,
      branches: [
        { id: 'b1', label: 'Urgente', child: null, operator: 'contains', value: 'urgente "já"' },
        { id: 'b2', label: 'Igual', child: null, operator: 'equals', value: 'Sim, quero' },
        { id: 'b3', label: 'Não contém', child: null, operator: 'not_contains', value: 'spam' },
        { id: 'b4', label: 'None', child: null, locked: true },
      ],
    }
    const ask: Step = {
      id: 'ask',
      type: 'interactive',
      name: 'Pergunta',
      config: { message: 'Escolha' },
      next: cond,
      branches: [
        { id: 'i1', label: 'Vendas', child: null },
        { id: 'i2', label: 'Suporte', child: null },
      ],
    }
    const flow: Flow = {
      schemaVersion: 1,
      id: 'f1',
      name: 'Fluxo',
      trigger: { label: 'Palavras-chave', keywords: ['oi'] },
      root: ask,
    }
    const compiled = compileFlow(flow)
    const conditionCount = compiled.nodes.filter((n) => n.data.config?.actionType === 'Condition').length
    expect(conditionCount).toBeGreaterThan(0)
    expect(findInvalidWorkflowConditions(compiled.nodes)).toEqual([])
  })

  it('acusa a condição maliciosa injetada no grafo cru', () => {
    const issues = findInvalidWorkflowConditions([
      conditionNode('ok', '{{@__trigger:Gatilho.message}}.includes("oi")'),
      conditionNode('evil', '{{@__trigger:Gatilho.message}}["constructor"]["constructor"]("return process")()', 'Maliciosa'),
    ])
    expect(issues).toHaveLength(1)
    expect(issues[0].nodeId).toBe('evil')
    expect(issues[0].label).toBe('Maliciosa')
    expect(describeWorkflowConditionIssues(issues)).toContain('Condição inválida no nó "Maliciosa"')
  })

  it('aceita condição booleana/ausente (semântica antiga) e rejeita tipo inválido/vazia', () => {
    expect(findInvalidWorkflowConditions([conditionNode('a', true), conditionNode('b', undefined)])).toEqual([])
    const issues = findInvalidWorkflowConditions([conditionNode('c', { x: 1 }), conditionNode('d', '')])
    expect(issues.map((i) => i.nodeId)).toEqual(['c', 'd'])
  })

  it('ignora nós que não são Condition e entradas não-array', () => {
    expect(findInvalidWorkflowConditions(null)).toEqual([])
    expect(
      findInvalidWorkflowConditions([
        { id: 'x', data: { type: 'action', config: { actionType: 'HTTP Request', condition: '__v0["constructor"]' } } },
        null,
        'lixo',
      ])
    ).toEqual([])
  })

  it('mensagem agrega a contagem quando há várias condições inválidas', () => {
    const issues = findInvalidWorkflowConditions([
      conditionNode('a', 'this'),
      conditionNode('b', 'globalThis'),
    ])
    expect(describeWorkflowConditionIssues(issues)).toContain('e mais 1')
  })
})
