# CRM Empreende IA — plano de produto, UX e tours guiados

Consulte `EXECUCAO-CRM.md` para os comportamentos implementados e as evidências. O usuário definiu testes locais como critério de entrega desta etapa; publicação e piloto com participantes ficam para um ciclo posterior. Este documento preserva a inspeção inicial e o plano de produto; as descrições do código abaixo são históricas.

Data: 06/09/2026. Documento de planejamento baseado na inspeção local do CRM e da implementação de orientação da Lara.

## 1. Intenção e escopo

O primeiro trabalho é aplicar o Design System da Empreende IA à interface existente: identidade, tipografia, cores, superfícies, navegação, componentes, estados e responsividade. A validação deve conferir temas claro e escuro, desktop e celular, sem alterar silenciosamente o significado dos dados ou o comportamento das ações.

As funcionalidades e os tours descritos neste documento são propostas para as próximas entregas. Sua descrição não significa que já estejam implementados. A troca de identidade visual não converte, por si só, a base clínica em um CRM comercial. Não foi realizada, como parte deste plano, migração de pacientes, consultas, prontuários ou pagamentos para entidades comerciais.

Antes de uso operacional, separar o ambiente de backend da base copiada e validar o modelo/dados destinados ao novo CRM. Nenhum banco novo foi provisionado neste redesign.

O objetivo de produto proposto é permitir que a equipe entenda cada relacionamento, saiba qual é a próxima ação e acompanhe sua execução. O sistema deve explicar o que está disponível, quem pode agir e o que aconteceu após uma ação.

## 2. O que o código ativo demonstra

A inspeção é do código local; não certifica dados, disponibilidade de integrações ou saúde do ambiente de produção.

| Área | Comportamento encontrado | Implicação para o plano |
|---|---|---|
| Estrutura | As páginas autenticadas usam `PageScaffold`, com navegação desktop por `AppRail`, navegação móvel, busca global e painéis laterais. | O DS pode ser aplicado de forma consistente a partir da fundação compartilhada. |
| Dashboard | Consulta `activities`, `patients` e `payments`; apresenta consultas, confirmação, ausência, receita e pacientes sem retorno. | Esses indicadores continuam clínicos até existir um modelo comercial validado. Não chamar ausência de consulta de perda comercial. |
| Cadastro | `/patients`, `/professionals`, `/records` e `/health-goals` são rotas ativas, com entidades e campos clínicos. | Decidir quais módulos serão substituídos, arquivados ou mantidos antes de mudar nomes e contratos de dados. |
| Pipeline | Busca `pipelines` e `pipeline_stages`, mas distribui consultas de `activities` nas colunas comparando `stage.name` com o rótulo de `appointment_status`. | Renomear uma etapa pode esvaziar sua coluna. Um pipeline de oportunidades exigirá associação explícita por `stage_id` e vínculo ao pipeline correto. |
| Atividades e tarefas | Ambas usam `activities`; Tarefas filtra `type = task`. Também consultam `contacts`, `deals`, `companies` ou `profiles`. Atividades ainda consulta `imoveis`. | Há conceitos de versões anteriores convivendo com a aplicação clínica. Consolidar significados e vínculos antes de construir a visão comercial. |
| Busca global | Busca pacientes e profissionais com limite de cinco resultados por grupo. A seleção leva à lista, sem abrir diretamente o registro encontrado. | Corrigir o destino é uma melhoria de UX objetiva. A busca ainda não comprova pesquisa comercial completa de contatos e oportunidades. |
| Onboarding | Há modal de sete etapas com retomada persistida e checklist flutuante separado. O modal salva progresso em `profiles` e `onboarding_progress`; o checklist também usa `onboarding_progress`. | Unificar a apresentação e os critérios para não ter dois progressos divergentes. O modal atual bloqueia Esc; isso precisa entrar na revisão de acessibilidade. |
| Copilot | Existe interface de conversa integrada ao shell. | Não presumir que toda resposta possui evidência verificável nem que ações propostas já contam com revisão e auditoria. Essas capacidades devem ser verificadas e projetadas. |

Referências de código do CRM estão no fim deste documento. A presença de uma tabela ou componente antigo não comprova que seu fluxo esteja completo ou deva ser preservado no produto final.

## 3. Prioridades de UI e UX

### Prioridade imediata — clareza e consistência

- Aplicar o DS às páginas públicas, shell, filtros, tabelas, formulários, painéis laterais, confirmações e estados vazios. Definir uma hierarquia estável de título, descrição, informação auxiliar e ação principal.
- Fazer a seleção de um resultado da busca abrir sua ficha. Guardar contexto suficiente para voltar à lista e aos filtros anteriores. No caso de registro indisponível ou sem acesso, apresentar esse estado com clareza.
- Diferenciar carregamento, ausência de registros, filtro sem resultados, falha e acesso insuficiente. Oferecer a ação adequada em cada caso, como limpar filtros, tentar novamente ou criar o primeiro registro.
- Exibir responsável e próxima ação onde já houver dados válidos. Quando não houver, apresentar a lacuna sem inventar prioridade ou prazo.
- Padronizar botões desabilitados com motivo, salvamento em andamento, confirmação de sucesso e recuperação de erro. Preservar campos preenchidos após falha.
- Conferir textos, contraste, navegação por teclado e comportamento de painéis com conteúdo longo. Evitar dependência exclusiva de cor para status.

### Próxima camada — organizar o trabalho diário

**Hoje:** uma visão proposta sobre `activities`, reunindo tarefas, compromissos e retornos por responsável, prazo e situação. A mesma atividade deve manter o mesmo ID, estado e destino em todas as visões. Definir a regra que identifica cada tipo e impedir contagem duplicada. Não substituir o Dashboard clínico por indicadores comerciais sem sua implementação correspondente.

**Próxima ação:** definir um compromisso operacional explícito por relacionamento ou oportunidade: ação, responsável, vencimento e estado. Decidir se será uma atividade vinculada ou um campo derivado. Priorizar reaproveitar `activities` quando isso preservar o significado e a integridade dos vínculos.

**Fila de atenção:** mostrar itens com motivo verificável, como tarefa vencida, ausência de responsável ou retorno combinado pendente. Cada item deve informar o motivo, o registro de origem e a ação possível. Regras de prioridade precisam ser configuráveis e explicáveis.

**Visões salvas:** persistir filtros, ordenação e colunas, inicialmente por usuário e organização. Compartilhamento com a equipe exige definição de permissão e responsável pela visão. Informar quando o filtro está ativo e permitir restaurar o padrão.

### Camada comercial — depende das decisões de domínio

**Relacionamento 360:** ficha com pessoa, empresa, responsáveis, oportunidades, histórico de atividades e próxima ação. Documentar de onde vem cada informação. Não misturar paciente com contato por igualdade de nome ou e-mail sem regra de identidade e tratamento de duplicidades.

**Pipeline comercial:** oportunidades associadas a `pipeline_id` e `stage_id`, independente do texto exibido na etapa. Renomear a etapa não deve mudar a distribuição. Movimentação deve respeitar permissões, registrar origem/destino e oferecer alternativa ao arrastar. Definir significado de ganho, perda, valor e probabilidade antes de calcular conversão ou previsão.

**Copilot com evidências:** resposta acompanhada de links para os registros usados e indicação de informação ausente ou inferida. Sugestões de próxima ação precisam apresentar objetivo e contexto; ações com gravação devem mostrar o que será alterado e executar somente pela interação prevista no produto. Um tour nunca executa essas ações.

## 4. Orientação contextual e onboarding

### Como a pessoa entra e volta

- Por padrão, o tour começa por escolha explícita: botão **Tour desta tela** no cabeçalho ou na Ajuda. Na primeira visita elegível, pode haver um convite discreto **Conhecer esta tela**, sem capturar foco nem abrir um modal sozinho.
- A pessoa pode ativar orientação automática nas preferências. Mesmo ativada, ela aguarda a tela estar pronta, não interrompe digitação e não disputa espaço com formulário, confirmação ou onboarding.
- Controles: **Próximo**, **Voltar**, **Pausar**, **Pular tour** e **Concluir**. X e Esc pausam. Pular registra dispensa. Nenhum controle executa o botão destacado.
- Se houver pausa válida, o disparador oferece **Continuar tour** e **Recomeçar**. O replay manual continua disponível após dispensa, conclusão ou desativação de convites.
- Cada passo possui um ID estável. A retomada usa esse ID, não apenas um índice, para resistir a elementos ocultos e diferenças entre desktop e celular.

### Estado e isolamento

Proposta de chave: `empreende-crm:tours:v1:<orgId>:<userId>`, com codificação segura dos identificadores. Não compartilhar preferências entre organizações ou pessoas que usam o mesmo navegador.

Persistir somente estado de orientação: preferência, ID e versão do roteiro, estado `paused | completed | dismissed` e ID do passo pausado. Não guardar nomes de contatos, conteúdo de mensagens, credenciais ou valores dos formulários no estado dos tours.

A primeira versão pode usar armazenamento local com recuperação de JSON inválido e fallback em memória. Sincronização entre dispositivos é uma evolução distinta, que exige persistência no backend e regras de acesso. Trocar de organização ou sair da conta encerra o overlay e descarta pedidos pendentes.

Uma versão nova invalida posição de passo incompatível. Atualizações relevantes podem mostrar um convite para conhecer a mudança; não reabrir automaticamente apenas por ajuste de texto. Preservar a preferência global da pessoa.

### Coordenação com o onboarding atual

- Manter uma única fonte de verdade para a conclusão de configuração. Não marcar configuração concluída porque um tour foi visto.
- Tornar o checklist a visão dos requisitos reais, com atalho para resolver cada pendência. O wizard conduz o preenchimento e deve permitir sair e retomar sem perder dados já salvos.
- Bloquear tours durante o onboarding nesta primeira entrega. Tours internos em etapas só entram após resolver foco, Esc, camadas e persistência do modal atual.
- Evitar coexistência de checklist flutuante, convite de tour e Copilot cobrindo o conteúdo. Reservar a ajuda persistente no shell; usar avisos contextuais quando necessários.
- Reutilizar a engine de orientação da Lara e adaptar sua política de abertura. A retomada de passos pausados e o padrão de adesão explícita são evoluções propostas sobre aquela referência.

### Contrato técnico e acessibilidade

O componente de página informa um `data-product-tour`; cada região usa uma âncora estável `data-tour`. O catálogo descreve ID, versão, objetivo e passos. Não construir seletores a partir de nomes de pacientes, IDs de dados pessoais ou estrutura CSS incidental.

A seleção de passos respeita elementos visíveis e permissões já aplicadas pela página. Alvo ausente antes de iniciar é ignorado. Alvo que desaparece durante o tour gera explicação curta e permite avançar ou pausar. Sem âncoras disponíveis, o disparador fica indisponível com contexto, sem abrir uma máscara vazia.

Usar o diálogo acessível já disponível no projeto: título e descrição associados, foco inicial no título, Tab contido, Esc previsível e foco devolvido ao disparador. Se o disparador saiu da tela, voltar a um elemento estável do shell. Anunciar o número do passo sem repetir toda a tela. Setas decorativas e destaque não devem poluir a leitura assistiva.

O cartão precisa caber em 320 CSS px, zoom, paisagem e viewport reduzido por teclado. Conteúdo longo rola dentro dele. O destaque acompanha scroll e resize sem cobrir conteúdo fora do container visível. Respeitar movimento reduzido e não depender de animação para comunicar progresso. Validar light e dark com status, foco e texto legíveis.

## 5. Oito roteiros iniciais

Todos os IDs e âncoras abaixo são propostas; devem ser implementados e conferidos na tela antes de ativar cada roteiro. Os roteiros apresentam o produto que existe naquela entrega. Conteúdo comercial entra somente quando o respectivo fluxo estiver implementado.

### 1. `dashboard` — entender a situação do dia

Contexto inicial: `/dashboard`. Objetivo: compreender os indicadores existentes e chegar às pendências.

1. `dashboard-summary` — o que cada indicador mede, seu período e o significado de ausência de medição.
2. `dashboard-appointments` — onde consultar os compromissos de hoje e abrir a agenda.
3. `dashboard-pending` — onde encontrar as atividades pendentes e consultar seus detalhes.
4. `dashboard-return` — como interpretar a lista de pacientes sem retorno no modelo atual.
5. `shell-quick-actions` — como acessar ações disponíveis para o seu papel.

Dependência: os textos continuam clínicos enquanto o Dashboard consultar o modelo atual. O roteiro será versionado quando a visão Hoje estiver pronta.

### 2. `patients` — encontrar e consultar um cadastro

Contexto inicial: `/patients`. Objetivo: localizar um cadastro e compreender sua ficha atual.

1. `patients-search` — pesquisar pelos campos efetivamente suportados.
2. `patients-filters` — refinar e limpar filtros, reconhecendo sua aplicação.
3. `patients-list` — identificar um registro e abrir seus detalhes.
4. `patients-create` — conhecer a ação de cadastro, quando disponível para o papel.

Dependência: não apresentar este roteiro como Relacionamento 360. A nova ficha comercial terá roteiro próprio após definição de pessoa, empresa e oportunidade.

### 3. `pipeline` — ler o quadro atual

Contexto inicial: `/pipeline`. Objetivo: selecionar um pipeline e interpretar colunas e registros.

1. `pipeline-selector` — selecionar o pipeline configurado.
2. `pipeline-stages` — ler etapas, contagens e valores exibidos.
3. `pipeline-board` — reconhecer os registros e navegar pelo quadro.
4. `pipeline-record` — entender como abrir os detalhes de um registro, quando houver.

Dependência: o quadro ativo usa consultas/status. Não ensinar arrastar, ganhar oportunidade, prever receita ou criar negócio enquanto essas ações não existirem neste fluxo. Após o pipeline comercial, revisar o roteiro para `stage_id` e movimentação real.

### 4. `agenda` — organizar compromissos

Contexto: `/agenda`. Objetivo: localizar um horário e entender o ciclo de um compromisso.

1. `agenda-view` — alternar entre as visões oferecidas pela interface.
2. `agenda-date` — navegar pelas datas e reconhecer o período atual.
3. `agenda-filters` — restringir a agenda pelos filtros disponíveis.
4. `agenda-calendar` — abrir um compromisso para consultar detalhes e situação.
5. `agenda-create` — conhecer a ação de criar um compromisso, sem executá-la pelo tour.

Dependência: apresentar nomenclatura e situações reais do modelo da agenda; não confundir consulta com reunião comercial automaticamente.

### 5. `tasks` — acompanhar uma tarefa até a conclusão

Contexto: `/tasks`. Objetivo: encontrar prioridades e entender responsáveis, prazos e conclusão.

1. `tasks-filters` — escolher quais tarefas visualizar e remover filtros.
2. `tasks-list` — interpretar responsável, prazo e estado.
3. `tasks-create` — conhecer a criação e os vínculos oferecidos.
4. `tasks-status` — entender a ação de concluir/reabrir conforme o comportamento disponível.

Dependência: não anunciar fila Hoje ou cálculo de prioridade antes de implementá-los. Um roteiro de Atividades pode reutilizar padrões visuais, mas deve ter ID e progresso próprios quando entrar no catálogo.

### 6. `financeiro` — compreender os lançamentos

Contexto: `/financeiro`. Objetivo: ler valores e situações sem confundir recebimento com previsão.

1. `finance-summary` — entender os totais e o recorte usados.
2. `finance-filters` — aplicar período e situação disponíveis.
3. `finance-list` — consultar os lançamentos e seus vínculos.
4. `finance-create` — conhecer a ação de lançar pagamento, caso esteja disponível.

Dependência: valores vêm de pagamentos do modelo atual. Forecast e valor de oportunidade são medidas diferentes e dependem do modelo comercial.

### 7. `automations` — entender uma automação antes de ativar

Contexto: `/automations`. Objetivo: localizar rotinas, reconhecer seus gatilhos e encontrar sua configuração.

1. `automations-list` — consultar as rotinas existentes e seus estados.
2. `automations-trigger` — identificar o evento que inicia uma rotina na interface disponível.
3. `automations-create` — conhecer a entrada de criação/configuração.
4. `automations-status` — compreender controles de ativação e informações de execução efetivamente disponíveis.

Dependência: só ensinar condições, simulação, histórico ou cancelamento quando essas capacidades estiverem presentes e validadas. O guia é explicativo; avançar nunca ativa uma rotina nem envia mensagens.

### 8. `integrations` — reconhecer o estado de uma conexão

Contexto: `/settings/integrations`. Objetivo: identificar a integração desejada, seus requisitos e a próxima ação possível.

1. `integrations-catalog` — conhecer as integrações oferecidas no produto.
2. `integrations-status` — distinguir conexão configurada, pendência e falha usando estados reais.
3. `integrations-configure` — encontrar a configuração e entender quem tem permissão para alterá-la.
4. `integrations-help` — acessar orientação de requisitos ou recuperação quando disponível.

Dependência: se um diagnóstico ou atalho de ajuda ainda não existir, implementá-lo antes de adicionar a explicação correspondente. Tours de Equipe e Copilot entram numa expansão do catálogo, depois de revisar permissões e evidências.

## 6. Fases, entregáveis e critérios de aceite

| Fase | Entrega proposta | Critério de aceite |
|---|---|---|
| 0 — Redesign em andamento | DS aplicado à fundação, marca, acesso, shell e componentes centrais. | Páginas representativas coerentes em light/dark e celular; foco visível; sem overflow horizontal involuntário; build/typecheck e revisão do diff; fluxos preservados. |
| 1 — Correções de uso | Busca abre a ficha; estados vazios/erro/sem acesso consistentes; ajuda acessível no shell; clareza de salvamento. | Encontrar, abrir e voltar ao registro preserva contexto; falha não apaga preenchimento; ações desabilitadas têm explicação; rotas profundas tratam falta de acesso. |
| 2 — Orientação contextual | Engine adaptada, catálogo inicial, pausa/replay, convites por adesão e coordenação com onboarding. | Os oito roteiros funcionam somente onde seus alvos e ações existem; isolamento por usuário/organização; pausa e retomada válidas; opt-out respeitado; testes de teclado, recarga, versão e mobile. |
| 3 — Modelo comercial | Decisões documentadas; entidades e relacionamentos canônicos; pipeline por ID; estratégia para o legado. | Renomear etapas não altera vínculos; cada oportunidade pertence ao pipeline correto; nenhuma transformação de dados é feita por inferência de nomes; plano de migração/reversão revisado antes de executar. |
| 4 — Operação diária | Hoje, próxima ação, fila de atenção, ficha 360 e visões salvas sobre o modelo aprovado. | Um registro mantém estado consistente entre visões; sem duplicidades de contagem; fila explica seus critérios; filtros e acessos respeitam organização e papel. |
| 5 — IA e melhoria contínua | Copilot com evidências e sugestões revisáveis; expansão dos tours e ajuda a partir das dificuldades observadas. | Afirmações sobre registros possuem origem consultável; lacunas são explícitas; nenhuma ação é executada pelo tour; falhas de busca e de gravação são comunicadas e recuperáveis. |

As fases indicam dependência, não prazo. Correções independentes de UX podem avançar enquanto as decisões comerciais são discutidas. Não iniciar migração estrutural para apenas satisfazer uma mudança visual.

## 7. Medição sem metas artificiais

Medir uma linha de base antes de fixar metas. Comparar por papel, organização, dispositivo e contexto, evitando concluir que terminar um tour equivale a concluir uma tarefa real.

| Sinal | Definição proposta | Uso |
|---|---|---|
| Sucesso de tarefa | A pessoa alcança o resultado esperado em um fluxo definido, sem intervenção necessária. | Comparar localizar cadastro, criar tarefa, reagendar compromisso e configurar conexão. |
| Tempo até a primeira ação útil | Intervalo entre entrada elegível e primeira ação de trabalho concluída. | Avaliar onboarding e excesso de orientação. |
| Esforço de navegação | Passos para sair da busca e chegar ao registro correto; retorno preservando contexto. | Verificar benefício do deep link e da organização da informação. |
| Adoção e interrupção de tours | Convite visto, início voluntário, pausa, retomada, dispensa, conclusão e replay por versão. | Identificar roteiros úteis e passos que criam atrito; conclusão isolada não é sucesso. |
| Erros de orientação | Alvo ausente, roteiro indisponível, falha de persistência e sobreposição bloqueada. | Detectar quebra entre catálogo e interface. |
| Clareza da rotina | Tarefas sem responsável/próxima ação e proporção de itens vencidos no recorte definido. | Entender lacunas de processo depois que os dados forem confiáveis. |
| Necessidade de ajuda | Acessos à ajuda, motivo de contato com suporte e dificuldade relatada por fluxo. | Priorizar texto, componente ou roteiro que exige revisão. |

Eventos propostos: `tour_invitation_viewed`, `tour_started`, `tour_step_viewed`, `tour_paused`, `tour_resumed`, `tour_dismissed`, `tour_completed`, `tour_replayed`, `tour_target_missing`. Registrar IDs de roteiro/passo/versão e contexto técnico necessário; não incluir conteúdo de cadastros ou formulários. Instrumentação e destino dos eventos precisam de decisão de implementação; este documento não presume telemetria já instalada.

## 8. Decisões necessárias sobre o CRM comercial

1. **Operação atendida:** vendas de serviços, mentoria/comunidade, implantação de IA, atendimento recorrente, ou combinação? Qual é o primeiro processo que precisa funcionar de ponta a ponta?
2. **Unidade de relacionamento:** pessoa, empresa e oportunidade serão entidades distintas? Uma pessoa pode ter múltiplas empresas ou oportunidades? O que define duplicidade?
3. **Oferta e ciclo comercial:** quais produtos/serviços serão vendidos, quais etapas e critérios de entrada/saída, e o que caracteriza ganho/perda?
4. **Trabalho diário:** quem assume o relacionamento, como funciona transferência e qual regra determina a próxima ação e seu vencimento?
5. **Canais e IA:** quais canais entram no primeiro lançamento, o que o Copilot pode consultar e quais ações devem ser sugeridas ou executadas pela interface?
6. **Financeiro:** acompanhar apenas valores de oportunidades, lançamentos/recebimentos ou integração com outro sistema? Como distinguir contrato, parcela, previsão e caixa?
7. **Papéis e equipes:** quais permissões variam entre gestor, vendedor, operação e administrador? Existem carteiras ou restrições por equipe?
8. **Destino do legado:** há dados reais a preservar? Quais módulos clínicos devem permanecer acessíveis, ser arquivados ou sair da navegação? Se houver migração, como validar mapeamento, duplicidades, integridade e reversão?
9. **Adoção:** qual equipe participará da primeira validação e quais tarefas reais serão observadas? Como coletar dificuldades sem induzir respostas?

Enquanto essas decisões não estiverem fechadas, o redesign pode seguir e a orientação pode explicar os fluxos existentes com seus nomes e limites atuais.

## 9. Referências locais

> Os links abaixo apontam para o diretório de trabalho original e para o projeto Lara, fora deste repositório. O código do CRM citado foi arquivado em `docs/legacy/`.

### CRM — evidências da inspeção

- [Rotas ativas](</Users/henriquegabriel/Documents/ChatGPT/CRM - Empreende IA/src/App.tsx>).
- [Dashboard clínico](</Users/henriquegabriel/Documents/ChatGPT/CRM - Empreende IA/src/pages/Dashboard.tsx>).
- [Pipeline e associação por nome de etapa](</Users/henriquegabriel/Documents/ChatGPT/CRM - Empreende IA/src/pages/Pipeline.tsx>).
- [Atividades](</Users/henriquegabriel/Documents/ChatGPT/CRM - Empreende IA/src/pages/Activities.tsx>) e [Tarefas](</Users/henriquegabriel/Documents/ChatGPT/CRM - Empreende IA/src/pages/Tasks.tsx>).
- [Busca global](</Users/henriquegabriel/Documents/ChatGPT/CRM - Empreende IA/src/components/CommandPalette.tsx>).
- [Modal de onboarding](</Users/henriquegabriel/Documents/ChatGPT/CRM - Empreende IA/src/components/onboarding/OnboardingModal.tsx>), [persistência](</Users/henriquegabriel/Documents/ChatGPT/CRM - Empreende IA/src/components/onboarding/persistence.ts>) e [checklist](</Users/henriquegabriel/Documents/ChatGPT/CRM - Empreende IA/src/components/crm/OnboardingChecklist.tsx>).

### Lara — referência de implementação, sem alteração do projeto

- [Comportamento e limites documentados](/Users/henriquegabriel/Documents/ChatGPT/Lara/docs/entrega-tours-e-percurso-treinamento-2026-09-05.md).
- [Provider e gatilhos de abertura](/Users/henriquegabriel/Documents/ChatGPT/Lara/src/components/tours/ProductTourProvider.tsx).
- [Overlay, foco e acessibilidade](/Users/henriquegabriel/Documents/ChatGPT/Lara/src/components/tours/ProductTourOverlay.tsx).
- [Estado, versões e posicionamento](/Users/henriquegabriel/Documents/ChatGPT/Lara/src/components/tours/tour-state.ts) e [âncoras e viewport](/Users/henriquegabriel/Documents/ChatGPT/Lara/src/components/tours/tour-dom.ts).
- [Catálogo operacional](/Users/henriquegabriel/Documents/ChatGPT/Lara/src/components/tours/operationalTours.ts) e [catálogo de configuração](/Users/henriquegabriel/Documents/ChatGPT/Lara/src/components/tours/trainingTours.ts).
- [Testes de preferências, contratos e viewport](/Users/henriquegabriel/Documents/ChatGPT/Lara/src/components/tours/tour-state.test.ts).
- [Retomada de configuração](/Users/henriquegabriel/Documents/ChatGPT/Lara/src/components/settings/AgentSetupAssistant.tsx), [percurso visual](/Users/henriquegabriel/Documents/ChatGPT/Lara/src/components/settings/TrainingJourney.tsx) e [checklist de configuração real](/Users/henriquegabriel/Documents/ChatGPT/Lara/src/components/GoLiveChecklist.tsx).

### Referências de produto

- [Intercom: boas práticas de tours curtos e contextuais](https://www.intercom.com/help/en/articles/3095688-best-practices-for-using-product-tours).
- [HubSpot: timeline de atividades e filtros no registro](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline).
