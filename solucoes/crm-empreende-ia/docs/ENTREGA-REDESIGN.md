# Redesign inicial — Empreende.IA CRM

Data: 06/09/2026.

## Implementado

- Assets oficiais do DS V2: logos, ícone, Manrope com licença e arte de vidro.
- Tokens claros/escuros com ponte HSL para Tailwind 3; escuro inicial e preferência de sistema.
- Acesso e recuperação de senha com nova composição; handlers de autenticação preservados.
- Shell, navegação expansível, cabeçalho, KPIs e materiais de painéis adaptados.
- Camada DS sobre botões, inputs, textarea, cards, tabs, selects e overlays Radix existentes.
- Tipografia de metadados ampliada; contraste de ações destrutivas e tooltips de gráficos ajustados.
- Menu móvel com acesso aos destinos já existentes e à central de ajuda.
- Suporte configurável; nenhuma mensagem é enviada automaticamente.
- Plano de produto, UX e oito tours em `PLANO-CRM.md`. Tours e novas funções comerciais ainda são propostas.

## Verificação realizada

| Verificação | Resultado |
|---|---|
| TypeScript (`bunx tsc --noEmit -p tsconfig.app.json`) | Passou |
| Build de produção (`bun run build`) | Passou; aviso de bundle acima de 500 kB |
| Lint | 553 erros e 18 avisos, mesmos totais e regras do estado anterior; nenhuma nova violação por regra |
| Inicialização do tema | Sete cenários passaram: dark padrão, light/dark persistidos, system nas duas opções, valor inválido e storage indisponível |
| Diff | Sem erros de whitespace |
| Marca indesejada | Nenhuma ocorrência nos 266 arquivos examinados |
| CSS e componentes | Revisão independente de cascata, refs/props, aliases de cor, contraste e menu de 320 px; correções aplicadas |
| Prévia | HTTP 200 e inspeção da tela de acesso no tema escuro |

Não foi validada visualmente toda a aplicação autenticada, nem executado teste operacional de integrações. A tela de acesso apresentou uma falha de conexão de autenticação durante a prévia; o backend herdado não foi alterado neste trabalho. A conclusão dos testes de login e fluxos requer um ambiente de backend funcional para este CRM.

## Próximas entregas propostas

Separar o backend da base copiada, corrigir busca e estados, adaptar tours da Lara e definir o modelo comercial. O plano detalha dependências e diferencia módulos clínicos ativos de componentes comerciais legados.
