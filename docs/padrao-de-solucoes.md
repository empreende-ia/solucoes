# Padrão de soluções

Toda pasta em `solucoes/` segue este contrato. A ideia é que qualquer pessoa (ou
qualquer agente) consiga entender, rodar e operar a solução sem conversar com quem a
construiu.

## Estrutura mínima

```
solucoes/<nome>/
  README.md          o que é, stack, como roda, como publica, índice do docs/
  docs/
    README.md        índice comentado da documentação
    arquitetura.md   camadas, fluxo de dados, tabelas, integrações
    operacao.md      deploy, secrets, rotinas, diagnóstico de problemas
  <código>
```

Documentos específicos (integração com um fornecedor, plano de testes, auditoria de
escopo) entram em `docs/` com nome descritivo e aparecem no índice.

## O que o README da solução precisa responder

1. **O que é e para quem** — uma frase que um cliente entenderia.
2. **Stack** — front, backend, IA, canais, integrações, onde cada parte roda.
3. **Como rodar local** — comandos exatos, incluindo as variáveis de ambiente.
4. **Como publicar** — front e backend, com os comandos e o que cada um mexe.
5. **Configuração do produto** — o que o operador configura pela interface.
6. **Índice da documentação** — link para cada arquivo de `docs/`.

## Regras de escrita

- Português do Brasil, voz direta, sem adjetivo de marketing na documentação técnica.
- Números verificáveis: quantidade de edge functions, de migrations, de tabelas. Se o
  código mudou, o número muda — documentação com número errado é bug.
- Nada de credencial em texto. Variável de ambiente é citada pelo nome; valor fica no
  cofre do ambiente (Vault do Supabase, env vars da Vercel, interface do produto).
- Diagrama em bloco de código ASCII, que sobrevive a qualquer leitor.
- Quando um comportamento é governado (publicação travada, aprovação humana, limite de
  taxa), a documentação diz **quem** aprova e **o que** acontece se falhar.
