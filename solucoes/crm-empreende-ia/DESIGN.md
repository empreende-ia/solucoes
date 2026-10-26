# Empreende.IA CRM — Design System V2

A direção visual é **Vidro em movimento**, conforme o DS local `Empreende IA - DS/empreende-ia-ds-v2`. A marca oficial, Manrope e os materiais foram incorporados ao CRM mantendo React 18, Vite, Tailwind 3 e as primitivas Radix existentes.

## Fonte e adaptação

- `src/styles/eia-tokens.css`: tokens oficiais escuros e claros, sem a ponte de Tailwind 4 do catálogo.
- `src/index.css`: aliases HSL equivalentes para os utilitários de opacidade já usados no CRM. Não atribuir cores completas como `#080a09` a variáveis consumidas por `hsl(var(--background))`.
- `src/styles/eia-components.css`: materiais e composição visual. É importado em `main.tsx` **depois** de `index.css`, para ter precedência sobre os utilitários das primitivas.
- `src/components/ds`: camadas de composição sobre as primitivas de `components/ui`. Preservam props, refs, portais, teclado e contratos dos controles.
- `public/brand`: assinaturas oficiais. A versão light é para superfície escura; a dark é para superfície clara. Preservar proporções e não recriar o logo em texto.
- `public/fonts`: Manrope variável e sua licença OFL.

## Identidade

Canvas escuro `#080a09`, claro `#f4f7f5`; cinzas com matiz verde e esmeralda `#0fa968` pontual. Manrope em toda a interface. Controles de 36/44/52 px; raios de 13 px em controles, 23 px em painéis e 30 px nas grandes superfícies.

Materiais por função: `hero` para arte e destaque; `panel` para contexto e agrupamentos; `dense` para tabelas, listas extensas e overlays de operação. Vidro precisa de variação real atrás dele. Tabelas e leituras longas não recebem blur. Manter distinção semântica de sucesso, alerta e erro.

## Tema e acessibilidade

O padrão é escuro. A preferência usa `empreende-ia-theme`, aceita dark/light/system e aplica `data-eia-theme` e a classe `.dark` no HTML. O script no `index.html` resolve o tema antes da pintura. `ThemeContext` acompanha o sistema quando solicitado e preserva a escolha na sessão se o storage estiver indisponível.

Os tokens são definidos no HTML com `.eia-theme`, chegando também aos portais anexados ao body. A cor de identidade é fixa; aparência continua oferecendo tema e densidade. Preferências de densidade e menu usam namespace próprio do CRM.

Preservar foco visível, nomes acessíveis de botões, contraste e redução de movimento. Textos menores que 12 px não devem ser introduzidos. Campos e ações mantêm rótulos claros; estados vazios, loading e erro são distintos.

## Composição do produto

Shell com navegação lateral expansível, superfície principal delimitada e cabeçalho por `PageScaffold`. O menu móvel oferece os mesmos destinos, com ajuda acessível. `Panel` é a superfície compartilhada; `StatStrip` mantém métricas consistentes. A autenticação usa a arte oficial e o formulário mantém os handlers existentes.

O redesign não altera os modelos de dados clínicos da base. Não renomear entidades ou alterar etapas por texto sem revisar seus vínculos. O plano de produto, UX e tours está em `docs/PLANO-CRM.md`.

## Verificação

Executar `bunx tsc --noEmit -p tsconfig.app.json` e `bun run build`. O lint global tinha 553 erros e 18 avisos antes desta adaptação; comparar o resultado com a linha de base e não ocultar erros preexistentes. Compilação não comprova validação visual nem integração operacional. Não enviar mensagens ou criar registros de produção para verificar uma alteração visual.
