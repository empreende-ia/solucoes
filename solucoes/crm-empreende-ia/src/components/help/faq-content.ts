export interface FaqItem { q: string; a: string }
export interface FaqCategory { id: string; title: string; items: FaqItem[] }

export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: 'primeiros-passos', title: 'Primeiros passos', items: [
    { q: 'Como começo a usar o CRM?', a: 'Abra Configurar CRM nesta Ajuda ou nas ações rápidas do cabeçalho. O guia leva aos dados da organização e do perfil, pipeline, contatos, oportunidades e atividades. O progresso é verificado nos registros atuais. Você pode usar as demais telas sem terminar o guia.' },
    { q: 'Sair da configuração apaga o que já salvei?', a: 'Não. Esc ou o botão de fechar pausam apenas o guia. Os dados salvos nas telas do CRM ficam preservados. Ao reabrir, você continua da etapa escolhida e pode verificar novamente o progresso.' },
    { q: 'Terminar um tour conclui a configuração?', a: 'Não. Tours explicam a interface. O checklist de configuração é atualizado somente quando os registros necessários existem e podem ser verificados no CRM.' },
  ] },
  { id: 'contatos', title: 'Contatos e empresas', items: [
    { q: 'Qual é a diferença entre contato, empresa e oportunidade?', a: 'Contato é uma pessoa; empresa é a organização com a qual você se relaciona; oportunidade é uma negociação específica. Use os vínculos da ficha para manter esse contexto sem criar cadastros duplicados.' },
    { q: 'Onde encontro o histórico de um relacionamento?', a: 'Abra a ficha do contato ou da empresa pela lista ou pela busca global. Consulte as atividades e oportunidades vinculadas e confira a próxima ação disponível.' },
    { q: 'Como reutilizo filtros da minha rotina?', a: 'Nas telas com visões salvas, aplique os filtros e salve uma visão com um nome que faça sentido para você. Elas ficam neste navegador, separadas por conta e organização. A opção padrão remove o recorte salvo.' },
  ] },
  { id: 'pipeline', title: 'Pipeline e oportunidades', items: [
    { q: 'Como acompanho uma negociação?', a: 'Crie uma oportunidade no pipeline adequado, defina a etapa e confira responsável, valor e relacionamento vinculado. Abra o cartão para consultar ou editar os detalhes disponíveis para seu papel.' },
    { q: 'Como movo uma oportunidade pelo teclado?', a: 'Use a ação de movimentação do cartão para selecionar a etapa de destino. Aguarde a confirmação de salvamento. Uma falha de gravação deve preservar a etapa anterior.' },
    { q: 'Renomear uma etapa muda as oportunidades de coluna?', a: 'Não. As oportunidades ficam vinculadas ao identificador da etapa, e não ao texto do nome. A edição de pipelines e etapas fica em Configurações e exige o acesso apropriado.' },
    { q: 'O valor do pipeline é dinheiro recebido?', a: 'Não. O valor da oportunidade representa a negociação. Consulte os lançamentos no Financeiro e seus estados para distinguir recebimentos de valores pendentes.' },
  ] },
  { id: 'rotina', title: 'Hoje, agenda e tarefas', items: [
    { q: 'O que significa a fila de atenção?', a: 'Cada item deve mostrar um motivo verificável, como tarefa vencida, oportunidade sem responsável ou retorno pendente. Abra o registro de origem para avaliar o contexto e resolver a pendência.' },
    { q: 'Por que a mesma atividade aparece em mais de uma tela?', a: 'Hoje, Agenda, Tarefas e a ficha do relacionamento são visões dos mesmos registros. Alterar a situação de uma atividade atualiza esse registro nas outras visões; não é uma nova atividade.' },
    { q: 'Como registro a próxima ação?', a: 'Crie uma tarefa, retorno ou compromisso com descrição clara, responsável e prazo quando conhecido. Vincule ao contato ou à oportunidade para manter o contexto acessível.' },
  ] },
  { id: 'automacoes', title: 'Automações e conexões', items: [
    { q: 'O que devo conferir antes de ativar uma automação?', a: 'Leia o gatilho e as ações disponíveis na configuração. Confira o estado da rotina e as informações de execução exibidas. O tour nunca ativa uma automação nem envia mensagens.' },
    { q: 'Os contatos e a agenda são sincronizados automaticamente?', a: 'A página Integrações oferece troca de contatos por CSV e exportação de compromissos por arquivo ICS. Essas operações são manuais. Confira se o recurso está habilitado, revise a prévia da importação e gere uma nova exportação após alterar a agenda.' },
  ] },
  { id: 'copiloto', title: 'Copiloto e informações', items: [
    { q: 'Como confiro uma sugestão do Copiloto?', a: 'Abra os registros citados para conferir os dados usados e avalie as lacunas informadas. Revise o contexto antes de transformar uma sugestão em uma ação do seu trabalho.' },
    { q: 'O tour ou a Ajuda alteram meus registros?', a: 'Não. Eles explicam o produto e abrem telas. Criação, edição e confirmação de operações acontecem pelos controles da tela correspondente.' },
  ] },
  { id: 'acesso', title: 'Acesso e recuperação', items: [
    { q: 'Por que não consigo criar ou editar um registro?', a: 'As ações disponíveis dependem do seu papel e da organização ativa. Consulte a explicação mostrada pela tela. Se precisar de outro acesso, fale com o administrador da organização.' },
    { q: 'O que faço quando uma lista não carrega?', a: 'Confira a conexão e use Tentar novamente. Uma falha de consulta é diferente de uma lista vazia; não conclua que os dados foram apagados. Se o erro persistir, informe a tela e a ação ao administrador ou suporte.' },
    { q: 'Quais atalhos de orientação estão disponíveis?', a: 'Ctrl+K ou ⌘K abre a busca global. Nos tours, Esc pausa e o botão Continuar tour retoma o passo salvo. Recomeçar volta ao início do roteiro.' },
  ] },
];
