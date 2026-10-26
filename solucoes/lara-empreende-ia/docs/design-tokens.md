# Design system Empreende.IA no painel da Lara

Os quatro arquivos canônicos vêm do reference site do DS (`empreende-ia-ds`) e
não recebem adaptação local:

- `src/styles/eia-tokens.css` — tokens de cor, tipo, raio, sombra, glass, motion (claro + escuro)
- `src/styles/eia-surfaces.css` — controles e acabamento (`.eia-pill-link`, `.eia-tile`, `.eia-row-card`, `.eia-meta-chip`, `.eia-bar-glass`)
- `src/styles/eia-data.css` — tabelas e números (`.eia-table*`, `.eia-metric*`, `.eia-delta`, `.eia-spark`)
- `src/styles/eia-primitives.css` — acabamento dos primitives shadcn (arquivo do app, segue os tokens)

`src/index.css` é a PONTE: converte os hex do DS para canais HSL crus no
contrato do shadcn (`--background`, `--primary`…) e define os aliases do app
(`--eia-app-*`). Se o DS mudar, é lá que se reconverte.

## Regras da casa

1. **Dark-first.** O tema padrão é o escuro (grafite `#050505`); o claro existe
   completo e é escolhido no toggle. Sem preferência gravada, nasce escuro.
2. **Grafite é estrutura; verde `#0fa968` é a marca.** Verde aparece em CTA,
   foco, item ativo, dado primário — com parcimônia. Se tudo é verde, nada é verde.
3. **Verde como TEXTO sobre claro reprova AA.** Texto/link verde no claro usa
   `--eia-link` (brand-700 `#0b6b43`); `--primary` é preenchimento, com texto
   `--eia-on-accent` (`#02160d`) por cima.
4. **Glass e glow são linguagem EXCLUSIVA do escuro.** No claro: cards brancos
   limpos, hairline uniforme, sombra grafite — sem blur, sem aura. O
   `.eia-card` do app já faz essa troca sozinho.
5. **Sombra de elevação SEMPRE em `--eia-shadow-ink-*`.** Token `--eia-ink-*`
   em box-shadow inverte no escuro e vira halo branco.
6. **Tokens semânticos, nunca hardcode**: texto usa `--eia-text-primary/body/muted/soft`,
   superfície usa `--eia-surface`/`--eia-bg-*`, borda usa `--eia-border-*`.
   De-ênfase é por COR (degrau `faint`), nunca por opacity.
7. **Acento funcional só com função**: violet = IA, cyan = informativo,
   amber = alerta (`--eia-accent-alert`), red = destrutivo real. Cor decorativa
   é sempre errada. Gold/amarelo decorativo, segue banido em qualquer nível.
8. **Banidos**: emoji na interface, ícone `Sparkles` (usar Compass/Layers/Gauge…),
   itálico (ênfase = peso + cor), barra lateral colorida como ênfase (borda
   uniforme nos 4 lados), CAPS LOCK em CTA, bolinha decorativa em pill.
9. **Pill canônica**: 11px · peso 500 · `-0.004em` · nowrap · sem dot.
   Eyebrow ≠ pill: eyebrow é mono uppercase tracking largo, sem padding/radius.
10. **Dataviz**: 1 série = verde (`--eia-data-1`); 2 séries = verde + grafite com
    segundo canal (tracejado/marcador); 3+ = small multiples, nunca cor nova.
    Rampa `--chart-1..5` é grafite monocromática.
11. **Tipografia**: Sora (display, h1/h2) · Inter (corpo) · JetBrains Mono
    (eyebrow, números, código). Os nomes de família instalados são os do
    fontsource (`Sora Variable`, `Inter Variable`, `JetBrains Mono Variable`).
12. **Links em texto corrido são sublinhados** e usam `--eia-link`.

## O que NÃO fazer

- Não usar variantes `dark:` do Tailwind para cor — os tokens já resolvem o
  tema. (Exceção: troca de asset por tema, ex. wordmark tinta/branco.)
- Não editar os arquivos canônicos; adaptação local mora em `src/index.css`.
- Não adicionar dependência de UI nova sem necessidade — shadcn + tokens cobrem.
- Não recriar o wordmark como texto: usar os SVGs oficiais em `src/assets/`
  (lockup completo sempre; monograma só em espaço mínimo, ex. sidebar colapsada).
