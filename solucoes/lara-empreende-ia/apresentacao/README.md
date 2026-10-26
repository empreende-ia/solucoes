# Material de apresentação — Lara

Deck comercial da Lara para enviar a cliente, no design system Empreende.IA V2
("Vidro em movimento"): Manrope, preto/neutros com esmeralda pontual, vidro
representado por preenchimento e sombra (arquivo estático não promete blur de
navegador).

| Arquivo | O que é |
| --- | --- |
| `Lara-SDR-com-IA-Empreende-IA.pdf` | **O material para enviar.** 13 páginas, A4 paisagem (297×210 mm), fontes embutidas. |
| `deck.html` | A fonte do PDF. Edite aqui e gere de novo. |
| `assets/` | Manrope variável, wordmark Empreende.IA e a arte `empreende-glass-hero.jpg`, todos do repositório do design system. |

## Gerar o PDF de novo

```sh
cd apresentacao
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="Lara-SDR-com-IA-Empreende-IA.pdf" deck.html
```

Cada `<section class="slide">` é uma página. Abrir o `deck.html` no navegador mostra o
deck rolando, que é o jeito rápido de revisar antes de gerar.

## Roteiro das 13 páginas

1. Capa
2. O problema — a conversa que morre esperando resposta
3. O que é a Lara, e o que ela não faz
4. Canais: WhatsApp por coexistência, Cloud API e Instagram Direct
5. Como funciona: chega → agrupa → decide → responde
6. O que ela pode fazer sozinha (as ações da agente)
7. As seis camadas que impedem a invenção
8. O ciclo governado: configurar → testar → publicar → observar
9. O painel, área por área
10. Agendamento e a regra da confirmação explícita
11. Segurança e dados
12. Implantação em seis fases e o que o cliente precisa trazer
13. Próximos passos

## O que foi deliberadamente deixado de fora

Não há métrica de resultado, prazo prometido, preço nem depoimento — nada disso existe
de forma verificável neste repositório, e material comercial com número inventado é
exatamente o problema que a solução resolve. Preço, prazo e caso de cliente entram por
quem está conduzindo a conversa, na proposta.
