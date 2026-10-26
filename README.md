# Soluções Empreende.IA

Repositório guarda-chuva das soluções de IA aplicada a negócios da Empreende.IA. Cada
solução é um produto completo (front, backend, integrações e documentação) que vive em
sua própria pasta dentro de `solucoes/`.

## Catálogo

| Solução | O que faz | Stack | Documentação |
| --- | --- | --- | --- |
| [**Lara**](solucoes/lara-empreende-ia) · SDR com IA | Atende, qualifica e agenda no WhatsApp e no Instagram DM; move os deals no pipeline e responde só com o que está na base de conhecimento do cliente | Vite + React + TypeScript · Supabase (Postgres, RLS, Edge Functions) · OpenAI · Meta Cloud API / Zernio · Nylas | [README](solucoes/lara-empreende-ia/README.md) · [docs/](solucoes/lara-empreende-ia/docs) · [deck comercial](solucoes/lara-empreende-ia/apresentacao) |
| [**CRM Empreende.IA**](solucoes/crm-empreende-ia) | CRM comercial multissegmento: contas, pipeline e rotina do time de vendas | React + TypeScript · Supabase · Playwright | [README](solucoes/crm-empreende-ia/README.md) · [docs/](solucoes/crm-empreende-ia/docs) · [deck comercial](solucoes/crm-empreende-ia/docs/apresentacao) |
| [**Dispara**](solucoes/dispara) | SaaS de disparo e automação por WhatsApp na API Oficial, com fluxos e agentes de IA | Next.js + TypeScript · Supabase · AI SDK (Anthropic, OpenAI, Google) · Playwright | [README](solucoes/dispara/README.md) |

Origem do código de cada uma: [lara-empreende-ia](https://github.com/henriquegabriel-ia/lara-empreende-ia) ·
[crm-empreende-ia](https://github.com/henriquegabriel-ia/crm-empreende-ia) ·
[dispara](https://github.com/henriquegabriel-ia/dispara).

## Como este repositório é organizado

```
README.md                      índice e padrão (este arquivo)
docs/padrao-de-solucoes.md     o que toda pasta de solução precisa ter
solucoes/<nome-da-solucao>/    uma solução por pasta, autocontida
  docs/                        arquitetura, operação e integrações
  apresentacao/                material comercial em PDF, quando houver
                               (o CRM mantém o dele em docs/apresentacao/)
```

Cada pasta de solução é autocontida: tem o próprio `package.json`, as próprias
migrations, o próprio `docs/` e o próprio deploy. Nada é compartilhado entre soluções
por enquanto — quando algo passar a ser (tokens de design, scripts de deploy), ganha
uma pasta `comum/` na raiz e isso é registrado aqui.

## Como adicionar uma solução

Resumo: crie `solucoes/<nome>/`, leve o código, escreva o `README.md` da solução
seguindo [docs/padrao-de-solucoes.md](docs/padrao-de-solucoes.md) e acrescente a linha
dela no catálogo acima.

## Origem do código

As soluções podem ter nascido em repositórios próprios (muitas vêm do Lovable). Quando
for o caso, a tabela acima e o README da solução apontam o repositório de origem. A
cópia aqui é feita a partir do estado atual do código, sem o histórico de commits da
origem — este repositório passa a ser a referência a partir da data da cópia.

## Documentação

- [Padrão de soluções](docs/padrao-de-solucoes.md) — o contrato de documentação de cada pasta.
- Documentação de produto, arquitetura e operação fica dentro de cada solução, em `docs/`.
