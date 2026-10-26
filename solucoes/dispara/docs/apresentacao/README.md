# Apresentação comercial

Material para passar a clientes: 12 slides, 16:9, no design system Empreende.IA V2
(Manrope, preto/branco/neutros, esmeralda pontual, vidro representado por preenchimento,
borda e sombra — sem blur, que não é confiável em PDF).

| Arquivo | O que é |
| --- | --- |
| [`dispara-apresentacao.pdf`](./dispara-apresentacao.pdf) | **O material pronto.** É este que vai para o cliente |
| `deck.html` | Fonte do PDF — edite aqui e gere de novo |
| `assets/` | Wordmark, monograma, arte de vidro e a fonte Manrope (OFL) |

## Slides

1. Capa
2. O problema — disparo às cegas, resposta perdida, número queimado
3. A solução — uma plataforma, um deploy por empresa
4. O que entra no pacote — 8 capacidades
5. Diferencial — a campanha é conferida antes de sair (precheck)
6. Proteção do número — faixas da Meta e o que o Dispara faz em cada uma
7. Atendimento com IA — o caminho de uma resposta
8. Automação — fluxos que esperam dias
9. Implantação — três passos
10. Propriedade e dados — plataforma compartilhada × Dispara
11. Maturidade do produto — números do código-fonte
12. Próximo passo — demonstração

## Gerar o PDF de novo

Depois de editar `deck.html`:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --allow-file-access-from-files \
  --no-pdf-header-footer --virtual-time-budget=10000 \
  --print-to-pdf="docs/apresentacao/dispara-apresentacao.pdf" \
  "file://$(pwd)/docs/apresentacao/deck.html"
```

Confira o resultado antes de enviar:

```bash
pdftoppm -png -r 72 docs/apresentacao/dispara-apresentacao.pdf /tmp/slide
```

## Regras do conteúdo

Os números dos slides 6 e 11 são verificáveis: os do slide 6 são os limites publicados
pela Meta; os do 11 saem da contagem do próprio código (outubro de 2026) e estão marcados
como tal. **Não há métrica de uso, resultado de cliente, depoimento ou preço** — o design
system proíbe inventar prova social, e qualquer número comercial precisa de origem antes
de entrar aqui.

Ao adaptar para um cliente específico, troque o slide 12 pelo próximo passo combinado e
mantenha o rodapé de fonte em qualquer slide que ganhe número novo.
