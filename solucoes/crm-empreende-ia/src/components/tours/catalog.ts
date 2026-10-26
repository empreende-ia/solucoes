import type { ProductTourDefinition, ProductTourStep } from './types';

const step = (id: string, title: string, description: string): ProductTourStep => ({ id, target: `[data-tour="${id}"]`, title, description });

/** Anchors describe capabilities actually rendered by each page. Missing/forbidden targets are omitted. */
export const productTours: ProductTourDefinition[] = [
  {
    id: 'dashboard', version: 1, path: '/dashboard', title: 'Sua rotina de hoje',
    description: 'Encontre compromissos, pendências e a próxima ação do dia.',
    steps: [
      step('today-summary', 'Comece pelo panorama', 'Leia os indicadores com seu período e situação. Um valor zero significa que nenhum registro entrou nesse recorte; não é uma estimativa.'),
      step('today-attention', 'Saiba por que um item precisa de atenção', 'A fila mostra o motivo de cada pendência, como prazo vencido ou ausência de responsável. Abra o registro de origem para resolver o que falta.'),
      step('today-activities', 'Encontre o próximo compromisso', 'Consulte tarefas, reuniões e retornos. Ao abrir uma atividade, você vê seu responsável, prazo e relacionamento vinculado.'),
      step('shell-quick-actions', 'Crie a próxima ação', 'Use os atalhos disponíveis para seu papel. O guia apenas explica: criar ou alterar registros depende de uma ação sua na tela.'),
    ],
  },
  {
    id: 'contacts', version: 1, path: '/contacts', title: 'Relacionamentos e contatos',
    description: 'Localize pessoas e acompanhe o histórico de cada relacionamento.',
    steps: [
      step('contacts-search', 'Encontre a pessoa certa', 'Digite no campo de busca para localizar contatos pelos campos indicados. Abra o resultado para consultar sua ficha.'),
      step('contacts-filters', 'Reduza a lista com filtros', 'Use os filtros para focar na carteira desejada. A indicação de filtro ativo ajuda a diferenciar uma lista vazia de uma pesquisa sem resultados.'),
      step('contacts-views', 'Guarde uma visão da sua rotina', 'Salve os filtros que você reutiliza. Suas visões ficam associadas à sua conta e organização; restaure a visão padrão quando quiser.'),
      step('contacts-list', 'Abra o relacionamento completo', 'A ficha reúne dados do contato, empresa, oportunidades e atividades vinculadas. Confira a próxima ação para entender como dar continuidade.'),
      step('contacts-create', 'Cadastre com contexto', 'O novo contato começa por suas informações de identificação e relacionamento. Confira possíveis duplicidades antes de salvar.'),
    ],
  },
  {
    id: 'pipeline', version: 1, path: '/pipeline', title: 'Pipeline comercial',
    description: 'Leia as etapas e acompanhe cada oportunidade até seu resultado.',
    steps: [
      step('pipeline-selector', 'Escolha o processo comercial', 'O pipeline selecionado define as etapas e oportunidades que aparecem no quadro. Uma oportunidade pertence a um processo específico.'),
      step('pipeline-summary', 'Interprete valores e situações', 'Confira o recorte e a situação das oportunidades ao ler os totais. Valor de oportunidade representa negociação; recebimento é acompanhado no Financeiro.'),
      step('pipeline-board', 'Acompanhe as oportunidades por etapa', 'Abra um cartão para consultar seus detalhes, responsável e próxima ação. Cada etapa mantém seus vínculos mesmo quando seu nome muda.'),
      step('pipeline-move', 'Mova com controle', 'Use a ação de mover no cartão para selecionar a etapa, inclusive pelo teclado. A mudança registra a etapa anterior e a nova; uma falha deve manter a situação anterior.'),
      step('pipeline-create', 'Crie uma oportunidade', 'Associe o negócio ao contato, escolha etapa e responsável e informe o valor conhecido. Complete os detalhes na tela: avançar neste tour nunca cria um negócio.'),
    ],
  },
  {
    id: 'agenda', version: 1, path: '/agenda', title: 'Agenda comercial',
    description: 'Organize horários e consulte os compromissos da equipe.',
    steps: [
      step('agenda-view', 'Escolha como ver a agenda', 'Alterne entre as visões disponíveis para encontrar a escala de tempo mais útil para sua rotina.'),
      step('agenda-date', 'Reconheça o período atual', 'Navegue pelas datas e use o atalho de hoje para voltar ao período atual.'),
      step('agenda-filters', 'Consulte a agenda certa', 'Aplique os filtros disponíveis e confira quais estão ativos. Se nada aparecer, revise o período e os filtros.'),
      step('agenda-calendar', 'Abra o compromisso', 'Consulte os detalhes de um horário para conferir responsável, vínculos e situação. A mesma atividade mantém seu estado nas outras visões do CRM.'),
      step('agenda-create', 'Combine o próximo encontro', 'Use a criação de compromisso para registrar data, responsável e contexto. O tour não reserva horários nem envia convites.'),
    ],
  },
  {
    id: 'tasks', version: 1, path: '/tasks', title: 'Tarefas e retornos',
    description: 'Organize responsáveis, prazos e a conclusão das próximas ações.',
    steps: [
      step('tasks-filters', 'Foque nas tarefas relevantes', 'Selecione o recorte da sua rotina. Limpe os filtros quando precisar voltar a todas as tarefas disponíveis para você.'),
      step('tasks-list', 'Confira prazo e responsável', 'Leia o estado de cada tarefa e abra seus detalhes. Prazo ausente e responsável ausente são lacunas a resolver, não prioridades presumidas.'),
      step('tasks-create', 'Registre uma próxima ação clara', 'Crie uma tarefa com ação, prazo, responsável e vínculo ao relacionamento ou oportunidade quando disponível.'),
      step('tasks-status', 'Mantenha o trabalho atualizado', 'Use o controle de situação para concluir ou reabrir uma tarefa. A mudança vale para todas as telas que consultam essa mesma atividade.'),
    ],
  },
  {
    id: 'financeiro', version: 1, path: '/financeiro', title: 'Lançamentos financeiros',
    description: 'Diferencie valores previstos, pendentes e recebidos.',
    steps: [
      step('finance-summary', 'Leia os totais no contexto', 'Confira período e situação dos lançamentos. Recebimentos, valores pendentes e oportunidades comerciais medem coisas diferentes.'),
      step('finance-filters', 'Aplique o recorte desejado', 'Use período e situação para conferir os lançamentos que compõem os valores exibidos.'),
      step('finance-list', 'Consulte cada lançamento', 'Abra o registro para entender valor, vencimento, situação e os vínculos disponíveis. Confira os dados antes de confirmar uma alteração.'),
      step('finance-create', 'Registre o lançamento', 'A ação de criar fica disponível para quem tem permissão. Informe os dados na tela; o tour nunca confirma pagamentos ou recebimentos.'),
    ],
  },
  {
    id: 'automations', version: 1, path: '/automations', title: 'Automações',
    description: 'Entenda gatilhos e configurações antes de ativar uma rotina.',
    steps: [
      step('automations-list', 'Conheça as rotinas disponíveis', 'Consulte as automações e seus estados. Uma configuração cadastrada não comprova, por si só, que uma execução ocorreu.'),
      step('automations-trigger', 'Entenda o que inicia a rotina', 'Leia o evento de entrada e as condições apresentadas. Verifique se o comportamento atende ao processo da sua equipe.'),
      step('automations-create', 'Configure a automação', 'Use esta entrada para definir a rotina e revisar suas ações. O guia não ativa automações nem envia mensagens.'),
      step('automations-status', 'Confira antes de ativar', 'Revise o estado e as informações de execução disponíveis. Se houver uma pendência ou falha, resolva a causa indicada antes de depender da rotina.'),
    ],
  },
  {
    id: 'integrations', version: 1, path: '/settings/integrations', title: 'Importação e integrações',
    description: 'Conheça a troca de contatos por CSV e compromissos por calendário.',
    steps: [
      step('integrations-catalog', 'Conheça os recursos de troca de dados', 'Consulte os cartões de contatos por CSV e agenda por arquivo ICS. Cada cartão explica as operações disponíveis e seus limites.'),
      step('integrations-status', 'Confira se o recurso está habilitado', 'A situação indica se a organização permite usar este recurso. A troca por arquivo exige uma ação sua e não mantém dados sincronizados automaticamente.'),
      step('integrations-configure', 'Gerencie a disponibilidade', 'Administradores podem habilitar ou desabilitar o recurso para a organização. Avançar no guia não altera essa configuração.'),
      step('integrations-help', 'Prepare o arquivo corretamente', 'Confira o cabeçalho aceito para contatos e revise a prévia da importação. O calendário exportado representa aquele momento: alterações posteriores exigem nova exportação.'),
    ],
  },
];

export const tourById = new Map(productTours.map((tour) => [tour.id, tour]));
/** Hoje uses the same stable guide whether the application calls its route today or dashboard. */
export function getProductTour(id: string): ProductTourDefinition | undefined {
  return tourById.get(id === 'today' ? 'dashboard' : id);
}
