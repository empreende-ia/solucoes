import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LifeBuoy, CreditCard, KeyRound, Link2, MessageCircle, RefreshCw,
  GraduationCap, ChevronDown, ExternalLink, Check, ArrowRight, Plug,
  Bot, Compass, Target, BookOpen, Wrench, ClipboardCheck, Settings2,
  CalendarDays, FileText, Presentation,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { channelsApi, ZernioStatus } from '@/services/channels';
import { supabase } from '@/integrations/supabase/client';

// Passos marcados à mão (os que o sistema não consegue detectar sozinho)
const MANUAL_STEPS_KEY = 'lara_help_manual_steps';

function loadManualSteps(): string[] {
  try {
    const raw = localStorage.getItem(MANUAL_STEPS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface StepDef {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  auto: boolean;
  content: React.ReactNode;
  action?: { label: string; to?: string; href?: string };
}

const ease = [0.22, 1, 0.36, 1] as const;

const Help: React.FC = () => {
  const navigate = useNavigate();
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [manualDone, setManualDone] = useState<string[]>(loadManualSteps);
  const [status, setStatus] = useState<ZernioStatus | null>(null);
  const [hasConversations, setHasConversations] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [hasCloudApi, setHasCloudApi] = useState(false);
  const [altOpen, setAltOpen] = useState(false);
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  useEffect(() => {
    // Status real da integração: marca os passos 3-5 sozinho.
    // Membros sem papel admin recebem 403 aqui — o guia segue sem os selos.
    channelsApi.status().then(setStatus).catch(() => setStatus(null));
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (error) {
          console.error('[Help] Falha ao contar conversas:', error);
          return;
        }
        setHasConversations((count ?? 0) > 0);
      });
    // Caminho alternativo (Cloud API própria): a view pública expõe só a flag,
    // então o selo funciona para qualquer usuário logado
    supabase
      .from('lara_settings_public')
      .select('has_whatsapp_cloud')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('[Help] Falha ao ler o status do WhatsApp Cloud:', error);
          return;
        }
        setHasCloudApi(!!data?.has_whatsapp_cloud);
      });
  }, []);

  const whatsappActive = !!status?.connections.some(
    (c) => c.platform === 'whatsapp' && c.status === 'active'
  );

  const toggleManual = (id: string) => {
    setManualDone((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      localStorage.setItem(MANUAL_STEPS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const steps: StepDef[] = useMemo(() => [
    {
      id: 'conta',
      icon: CreditCard,
      title: 'Criar a conta na Zernio no plano usage-based',
      summary: 'O WhatsApp e o Inbox só existem nesse plano — e as 2 primeiras contas são grátis.',
      auto: false,
      content: (
        <ul className="space-y-2">
          <li>Crie a conta em zernio.com. O WhatsApp (inclusive por coexistência) e o Inbox só existem no plano usage-based.</li>
          <li>As 2 primeiras contas conectadas são grátis para sempre, já com Inbox, templates e broadcasts inclusos.</li>
          <li>Da 3ª conta em diante: USD 6 por conta/mês — cai para USD 3 acima de 10 contas e USD 1 acima de 100.</li>
          <li>Conta já existente em outro plano? Em zernio.com/dashboard/billing, use "Switch to usage-based pricing".</li>
        </ul>
      ),
      action: { label: 'Abrir zernio.com', href: 'https://zernio.com/dashboard/billing' },
    },
    {
      id: 'chave',
      icon: KeyRound,
      title: 'Gerar a chave da API',
      summary: 'Settings → API Keys na Zernio. A chave aparece uma única vez.',
      auto: false,
      content: (
        <ul className="space-y-2">
          <li>Na Zernio, vá em Settings → API Keys e crie uma chave nova.</li>
          <li>Ela começa com sk_ e é exibida uma única vez — copie na hora.</li>
          <li>Trate a chave como uma senha: quem a tiver controla seus canais.</li>
        </ul>
      ),
    },
    {
      id: 'conectar-chave',
      icon: Link2,
      title: 'Conectar a chave ao sistema',
      summary: 'Cole a chave em Configurações → APIs e salve.',
      auto: true,
      content: (
        <ul className="space-y-2">
          <li>Aqui no sistema, abra Configurações → APIs, seção Zernio API (ou use o assistente inicial).</li>
          <li>Cole a chave e salve: o sistema valida na Zernio e cria o perfil que agrupa suas contas.</li>
          <li>Este passo se marca sozinho quando a chave estiver salva e validada.</li>
        </ul>
      ),
      action: { label: 'Ir para Configurações', to: '/settings?tab=apis' },
    },
    {
      id: 'whatsapp',
      icon: MessageCircle,
      title: 'Conectar o WhatsApp por coexistência',
      summary: 'O mesmo número continua no celular e passa a responder por aqui também.',
      auto: true,
      content: (
        <ul className="space-y-2">
          <li>Clique em "Conectar WhatsApp": uma aba da Meta abre com a autorização oficial.</li>
          <li>Escolha conectar a conta existente do app WhatsApp Business e escaneie o QR code com o celular.</li>
          <li>O número continua funcionando normalmente no aplicativo — a coexistência é exatamente isso.</li>
          <li>Requisitos: conta Meta Business e app WhatsApp Business atualizado (2.24.17 ou mais novo).</li>
          <li>Até 6 meses de conversas são sincronizados; grupos e mensagens temporárias não passam pela API.</li>
        </ul>
      ),
      action: { label: 'Ir para Configurações', to: '/settings?tab=channels' },
    },
    {
      id: 'sincronizar',
      icon: RefreshCw,
      title: 'Sincronizar e fazer o primeiro teste',
      summary: 'Clique em Sincronizar, mande uma mensagem de teste e veja a conversa no Chat ao vivo.',
      auto: true,
      content: (
        <ul className="space-y-2">
          <li>De volta ao sistema, clique em "Sincronizar" — a conta aparece como Ativa.</li>
          <li>Peça para alguém mandar uma mensagem ao seu número e acompanhe a mensagem chegando no Chat ao vivo.</li>
          <li>Se você responder pelo próprio app do WhatsApp, a Lara pausa naquela conversa e o atendimento vira humano — dá para devolver para ela no Chat ao vivo.</li>
        </ul>
      ),
      action: { label: 'Abrir o Chat ao vivo', to: '/chat' },
    },
    {
      id: 'treinar',
      icon: GraduationCap,
      title: 'Preparar a agente e publicar a primeira versão',
      summary: 'Preencha o essencial, teste no simulador e publique — o resto pode vir depois.',
      auto: false,
      content: (
        <ul className="space-y-2">
          <li>Em Configurações → Agente, preencha o essencial de Identidade e negócio: a empresa, o que ela vende e para quem. Só isso já libera o ciclo — ofertas, etapas e conhecimento melhoram a agente, mas não travam nada.</li>
          <li>Converse com o rascunho no simulador, em Testar e publicar. Nada ali executa ações reais.</li>
          <li>Execute as situações de teste. Erros críticos bloqueiam a publicação; alertas podem ser revisados e aceitos conscientemente.</li>
          <li>Publique. Só a versão publicada atende clientes — tudo que você editar depois fica no rascunho até testar e publicar de novo.</li>
        </ul>
      ),
      action: { label: 'Abrir Testar e publicar', to: '/settings?section=publish' },
    },
  ], []);

  const isDone = (step: StepDef): boolean => {
    if (step.id === 'conectar-chave') return !!status?.hasKey || manualDone.includes(step.id);
    if (step.id === 'whatsapp') return whatsappActive || manualDone.includes(step.id);
    if (step.id === 'sincronizar') return (whatsappActive && hasConversations) || manualDone.includes(step.id);
    return manualDone.includes(step.id);
  };

  const doneCount = steps.filter(isDone).length;
  const progress = Math.round((doneCount / steps.length) * 100);

  // Guia por tela: o que cada menu configura, o que é essencial e o que é
  // opcional. Complementa os passos de canal acima — canal conecta a agente ao
  // WhatsApp; estes menus definem quem ela é e o que pode fazer.
  const guide: Array<{
    id: string;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    summary: string;
    body: React.ReactNode;
    action?: { label: string; to: string };
  }> = [
    {
      id: 'visao-geral',
      icon: Bot,
      title: 'Visão geral',
      summary: 'O painel de controle da configuração: o que falta, o que é opcional e por onde continuar.',
      body: (
        <ul className="space-y-2">
          <li>Mostra em duas listas separadas o que impede a publicação e o que é opcional e recomendado. Configuração parcial já publica e já atende — o resto é lapidação.</li>
          <li>Os cartões levam direto à seção certa, e o indicador Configurar → Testar → Publicar mostra em que ponto do ciclo você está.</li>
          <li>É também onde você abre o Configurar com IA e revisa sugestões geradas a partir das conversas reais.</li>
        </ul>
      ),
      action: { label: 'Abrir a Visão geral', to: '/settings' },
    },
    {
      id: 'identidade',
      icon: Compass,
      title: 'Identidade e negócio',
      summary: 'Quem a agente é, o que a empresa vende e para quem — o único bloco com campos obrigatórios.',
      body: (
        <ul className="space-y-2">
          <li>Nome e função da agente, empresa, o que a empresa vende e público principal são o essencial: sem eles não há publicação.</li>
          <li>Ofertas cadastradas viram o cardápio de recomendação — a agente só recomenda o que está ativo aqui. Provas sociais só entram no comportamento depois de aprovadas com fonte.</li>
          <li>Diferenciais, regiões atendidas e perfis excluídos refinam como ela se apresenta e para quem ela diz não.</li>
        </ul>
      ),
      action: { label: 'Abrir Identidade e negócio', to: '/settings?section=identity' },
    },
    {
      id: 'vendas',
      icon: Target,
      title: 'Atendimento e vendas',
      summary: 'Como a conversa avança: modelo comercial, etapas, qualificação, objeções e follow-up.',
      body: (
        <ul className="space-y-2">
          <li>Tudo aqui é opcional — cada bloco preenchido vira instrução de comportamento. Etapas dão direção à conversa; informações de qualificação definem o que ela precisa descobrir sobre o lead.</li>
          <li>Objeções guardam os argumentos aprovados e as promessas proibidas. O mapeamento necessidade → oferta conecta o problema do lead à oferta certa.</li>
          <li>O follow-up reengaja quem parou de responder, nos intervalos que você definir. Pedido de parada do lead é respeitado sempre — essa proteção é fixa.</li>
          <li>Em Comunicação, os tamanhos de mensagem são em caracteres, e o estilo (formalidade, uso do nome) vale para todas as respostas.</li>
        </ul>
      ),
      action: { label: 'Abrir Atendimento e vendas', to: '/settings?section=sales' },
    },
    {
      id: 'conhecimento',
      icon: BookOpen,
      title: 'Conhecimento',
      summary: 'O que a agente sabe: informações confirmadas, FAQs, materiais e a fila de dúvidas dela.',
      body: (
        <ul className="space-y-2">
          <li>Só informação confirmada vira resposta. A agente nunca escolhe silenciosamente entre informações conflitantes — conflitos viram pendência para você decidir.</li>
          <li>A fila "precisa da sua ajuda" junta o que ela não soube responder nas conversas reais. Resolver um item ali ensina a resposta de uma vez por todas.</li>
          <li>A busca de verificação mostra exatamente o que ela encontra sobre um assunto — bom para testar antes de o lead perguntar.</li>
        </ul>
      ),
      action: { label: 'Abrir Conhecimento', to: '/settings?section=knowledge' },
    },
    {
      id: 'acoes',
      icon: Wrench,
      title: 'Ações',
      summary: 'O que ela pode executar de verdade: agendar reuniões e transferir para humano.',
      body: (
        <ul className="space-y-2">
          <li>Agendamentos exigem a agenda conectada (aba Agenda) e definem duração, antecedência, dias e horários. Se os objetivos pedem agendamento com a ação desligada, a tela avisa — senão a agente oferece reunião que não consegue marcar.</li>
          <li>A transferência para humano define destino, motivos e o comportamento fora do horário da equipe.</li>
          <li>Proteção fixa: toda ação exige confirmação explícita do lead, e a agente só dá algo como feito quando a ferramenta confirma que foi.</li>
        </ul>
      ),
      action: { label: 'Abrir Ações', to: '/settings?section=actions' },
    },
    {
      id: 'testar-publicar',
      icon: ClipboardCheck,
      title: 'Testar e publicar',
      summary: 'O portão entre o rascunho e o atendimento real: simulador, situações de teste e versões.',
      body: (
        <ul className="space-y-2">
          <li>O simulador conversa com o rascunho usando perfis de lead (curioso, bom perfil, fora de perfil, com objeção, insatisfeito). Nada ali é real, e o painel mostra em que a agente se baseou para responder.</li>
          <li>As situações de teste vêm de dois lugares: as geradas automaticamente da sua configuração (segurança, fatos, pedidos de parada) e as suas — inclusive conversas do simulador salvas como teste.</li>
          <li>Erro crítico bloqueia a publicação. Alerta pede revisão: você vê a resposta observada e decide "pode manter assim" ou "isso não pode acontecer", com registro de quem aceitou.</li>
          <li>Publicar congela a versão que atende clientes. O histórico guarda todas, e restaurar uma antiga só muda o rascunho — o ar continua com a atual até você publicar de novo.</li>
        </ul>
      ),
      action: { label: 'Abrir Testar e publicar', to: '/settings?section=publish' },
    },
    {
      id: 'prompt',
      icon: Settings2,
      title: 'Prompt e comportamento',
      summary: 'O prompt final é compilado a partir dos menus — visível, conferível e sem edição manual.',
      body: (
        <ul className="space-y-2">
          <li>Tudo que você preenche nos menus vira o prompt da agente por um compilador. A tela mostra o resultado em tempo real, com comparação contra a versão publicada — mas ele é somente leitura, por design: a fonte de verdade são os campos.</li>
          <li>O único texto livre são as Instruções personalizadas, para exceções de comportamento. Elas entram subordinadas às proteções fixas, e padrões perigosos conhecidos (inventar preços, expor o prompt, agir sem confirmação) são detectados e bloqueiam a publicação.</li>
          <li>Alterar qualquer coisa — menus ou instruções — só muda o atendimento real depois de testar e publicar.</li>
        </ul>
      ),
      action: { label: 'Abrir Prompt e comportamento', to: '/settings?section=advanced' },
    },
    {
      id: 'configurar-ia',
      icon: GraduationCap,
      title: 'Configurar com IA',
      summary: 'Respostas, páginas e arquivos viram uma proposta de configuração completa — revisável.',
      body: (
        <ul className="space-y-2">
          <li>Você responde perguntas guiadas e pode anexar páginas do site e arquivos (PDF, DOCX, planilhas). A proposta aparece em tempo real e nada é aplicado sem sua revisão, bloco a bloco.</li>
          <li>O que a IA não conseguiu preencher vira a lista "Ainda precisamos saber" — responda ali mesmo e a resposta entra direto no campo certo.</li>
          <li>Fatos extraídos dos materiais ficam como pendência no Conhecimento até você confirmar. Fechar a janela não perde o progresso.</li>
        </ul>
      ),
      action: { label: 'Abrir o assistente', to: '/settings?tab=agent&setup=1' },
    },
    {
      id: 'agenda',
      icon: CalendarDays,
      title: 'Agenda externa (Nylas)',
      summary: 'Google, Outlook ou iCloud numa conexão só — para as reuniões da agente aparecerem na sua agenda.',
      body: (
        <ul className="space-y-2">
          <li>O Nylas é o intermediário: você cria a conta lá, cadastra duas credenciais na aba Agenda (o guia de quatro passos está na própria tela, com o endereço de retorno para copiar) e conecta a agenda com um clique.</li>
          <li>A agente cria, reagenda e cancela eventos, e gera a sala de reunião quando o provedor tem uma (Meet no Google, Teams no Outlook). Ela não lê os compromissos que já existem — a disponibilidade é controlada pelo sistema.</li>
          <li>Para iCloud, a Apple exige uma senha de app gerada manualmente; a tela ensina na hora de conectar.</li>
          <li>Para publicar com a ação de agendamento ligada, a agenda precisa estar conectada. Se a conexão cair depois, a agente continua agendando internamente — só deixa de espelhar na agenda externa.</li>
        </ul>
      ),
      action: { label: 'Abrir a aba Agenda', to: '/settings?tab=calendar' },
    },
    {
      id: 'templates',
      icon: FileText,
      title: 'Templates de mensagem da Meta',
      summary: 'Obrigatórios fora da janela de 24 horas — sem eles, os follow-ups longos não chegam.',
      body: (
        <ul className="space-y-2">
          <li>Regra da Meta: mensagem livre só até 24 horas depois da última mensagem do cliente. Os follow-ups mais longos da agente — os que caem fora dessa janela, nos intervalos que você configurou — só são entregues com um template aprovado.</li>
          <li>Crie em Configurações → Canais: variáveis com exemplo real, preview de como o lead recebe, e o status da análise da Meta (aprovado, em análise, rejeitado com motivo) atualiza na lista.</li>
          <li>Vale para o caminho WhatsApp Cloud API. Conversas via Zernio usam os templates gerenciados na própria Zernio.</li>
        </ul>
      ),
      action: { label: 'Abrir a aba Canais', to: '/settings?tab=channels' },
    },
    {
      id: 'demonstracao',
      icon: Presentation,
      title: 'Modo demonstração',
      summary: 'Um cenário fictício completo para apresentar a plataforma — apagável sem tocar em dado real.',
      body: (
        <ul className="space-y-2">
          <li>Preenche dashboard, chat, pipeline, agenda e equipe com um cenário coerente em um clique. A sidebar avisa enquanto estiver ativo.</li>
          <li>Desativar apaga exatamente o que foi criado — nenhum dado real é alterado. Apenas administradores ativam ou desativam.</li>
        </ul>
      ),
      action: { label: 'Abrir a aba Demonstração', to: '/settings?tab=demo' },
    },
  ];

  const faqs = [
    {
      q: 'Quanto custa a Zernio?',
      a: 'As 2 primeiras contas conectadas são grátis para sempre, com WhatsApp, Inbox, templates e broadcasts inclusos. Da 3ª conta em diante: USD 6 por conta/mês até 10 contas, USD 3 de 11 a 100 e USD 1 acima disso. Número conectado por coexistência não paga taxa extra por número.',
    },
    {
      q: 'Preciso usar a Zernio?',
      a: 'Não. O sistema também funciona conectado direto na API oficial da Meta, com token próprio — o passo a passo está no card "Caminho alternativo", logo acima. A diferença prática é que esse caminho não tem coexistência: o número fica dedicado à API e a cobrança por conversa vem direto da Meta. A Zernio é recomendada quando você quer manter o mesmo número no WhatsApp Business.',
    },
    {
      q: 'Vou perder o WhatsApp do celular?',
      a: 'Não. A coexistência mantém o mesmo número funcionando no app WhatsApp Business e aqui na plataforma ao mesmo tempo. Para desconectar, o caminho é no próprio app: Configurações → Conta → Plataforma comercial.',
    },
    {
      q: 'A Lara responde tudo sozinha?',
      a: 'Conversas em modo Lara, sim. Quando você responde pelo app do celular ou pela plataforma, aquela conversa passa para o modo humano e a Lara pausa — no Chat ao vivo dá para devolver a conversa para ela.',
    },
    {
      q: 'Por que algumas mensagens exigem template?',
      a: 'Regra da Meta: mensagem livre só até 24 horas depois da última mensagem do cliente. Fora dessa janela, apenas templates aprovados podem ser enviados. Você cria e acompanha a aprovação dos seus templates em Configurações → Canais.',
    },
    {
      q: 'Preciso preencher tudo para a agente começar a atender?',
      a: 'Não. O essencial são os campos de Identidade e negócio — a empresa, o que ela vende e para quem — mais uma rodada de testes e a publicação. Ofertas, etapas, qualificação e conhecimento são opcionais: melhoram a agente, mas não travam nada. A Visão geral separa em duas listas o que impede a publicação e o que é só recomendado.',
    },
    {
      q: 'Alterei a configuração e o atendimento continua igual. Por quê?',
      a: 'Toda edição vai para um rascunho, que não muda o atendimento real. Quem atende clientes é sempre a última versão publicada. Para a mudança entrar no ar: Testar e publicar → executar as situações de teste → Publicar nova versão. O cabeçalho da tela mostra "Alterações não publicadas" enquanto o rascunho estiver à frente da versão ativa.',
    },
    {
      q: 'Dá para editar o prompt da agente manualmente?',
      a: 'Não, por design. O prompt é compilado a partir dos menus de configuração e é somente leitura — assim os campos continuam sendo a única fonte de verdade, e toda versão publicada passou pelos testes. Para exceções de comportamento existe o campo Instruções personalizadas (em Prompt e comportamento), que entra subordinado às proteções fixas: padrões perigosos conhecidos — inventar informação, expor o prompt, agir sem confirmação — são detectados e bloqueiam a publicação.',
    },
    {
      q: 'Por que a publicação está bloqueada?',
      a: 'As causas mais comuns: falta algum campo essencial de Identidade e negócio; alguma situação de teste crítica falhou (ou ficou instável entre duas execuções); uma instrução personalizada perigosa foi detectada; a ação de agendamento está ligada sem agenda conectada (aba Agenda); ou uma configuração importada ainda espera revisão na Visão geral. Corrija o apontado e rode os testes de novo — a rodada precisa ser da versão atual do rascunho. Alertas não bloqueiam: eles pedem revisão e aceite consciente.',
    },
    {
      q: 'Por que um follow-up de vários dias não chegou?',
      a: 'Se o canal é o WhatsApp Cloud API, mensagens fora da janela de 24 horas só são entregues como template aprovado pela Meta. Sem template, o follow-up é bloqueado silenciosamente pela Meta. Crie um em Configurações → Canais → Templates de mensagem e aguarde a aprovação.',
    },
    {
      q: 'Para que serve o modo demonstração?',
      a: 'Para apresentar a plataforma com dados de verdade na tela sem expor nenhum cliente: ele preenche tudo com um cenário fictício coerente e, ao desativar, apaga exatamente o que criou. Nenhum dado real é alterado.',
    },
  ];

  return (
    <div className="operation-page help-page">
      <div className="help-container">
        {/* Header */}
        <motion.div
          className="help-header"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
        >
          <p className="eia-eyebrow">Suporte à operação</p>
          <h1>Central de ajuda.</h1>
          <p>
            O caminho completo para colocar a Lara no ar com a Zernio — do plano certo à primeira conversa respondida.
            Prefere não passar pela Zernio? O caminho alternativo pela API oficial da Meta está logo abaixo dos passos.
            Mais adiante, o guia de cada tela da configuração da agente: o que é essencial, o que é opcional e onde
            cada coisa mora.
          </p>
        </motion.div>

        {/* Progresso */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease }}
          className="help-progress eia-tile eia-tile--atmos"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">Implementação com a Zernio</p>
            <span className="eia-pill border border-border text-muted-foreground">
              {doneCount} de {steps.length} passos
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Os passos com selo "automático" se marcam sozinhos conforme a configuração avança. Os demais você marca ao concluir.
          </p>
        </motion.div>

        {/* Passos */}
        <div className="mt-6 space-y-3">
          {steps.map((step, idx) => {
            const done = isDone(step);
            const open = openStep === step.id;
            const Icon = step.icon;
            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.12 + idx * 0.06, ease }}
                className={`rounded-2xl border bg-card overflow-hidden transition-colors ${
                  open ? 'border-primary/40' : 'border-border/60 hover:border-border'
                }`}
              >
                <button
                  onClick={() => setOpenStep(open ? null : step.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left"
                >
                  {/* Indicador do passo */}
                  {/* A cor do texto vive aqui, não no número: quando o passo
                      é concluído o círculo muda na hora, mas o número ainda
                      leva a animação de saída pra sumir. Herdando a cor, ele
                      sai legível em vez de piscar sobre o fundo novo. */}
                  <div
                    className={`relative w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                      done
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground'
                    }`}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {done ? (
                        <motion.span
                          key="done"
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.4, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                        >
                          <Check className="w-4 h-4" />
                        </motion.span>
                      ) : (
                        <motion.span
                          key="num"
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.6, opacity: 0 }}
                          className="text-sm font-medium"
                        >
                          {idx + 1}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-primary shrink-0" />
                      <p className={`font-medium truncate ${done ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {step.title}
                      </p>
                      {step.auto && (
                        <span className="eia-pill border border-primary/30 text-primary hidden sm:inline-flex">automático</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{step.summary}</p>
                  </div>

                  <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease }}
                    >
                      <div className="px-5 pb-5 pl-[4.5rem] text-sm text-muted-foreground leading-relaxed [&_li]:relative [&_li]:pl-4 [&_li:before]:content-[''] [&_li:before]:absolute [&_li:before]:left-0 [&_li:before]:top-[0.55em] [&_li:before]:w-1.5 [&_li:before]:h-1.5 [&_li:before]:rounded-full [&_li:before]:bg-primary/40">
                        {step.content}
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          {step.action && (
                            step.action.to ? (
                              <button
                                onClick={() => navigate(step.action!.to!)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                {step.action.label}
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <a
                                href={step.action.href}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                              >
                                {step.action.label}
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )
                          )}
                          {!step.auto && (
                            <button
                              onClick={() => toggleManual(step.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {manualDone.includes(step.id) ? 'Desmarcar passo' : 'Marcar como concluído'}
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Caminho alternativo: Cloud API própria, sem Zernio */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.5, ease }}
          className={`mt-6 rounded-2xl border bg-card overflow-hidden transition-colors ${
            altOpen ? 'border-primary/40' : 'border-border/60 hover:border-border'
          }`}
        >
          <button
            onClick={() => setAltOpen(!altOpen)}
            className="w-full flex items-center gap-4 px-5 py-4 text-left"
          >
            <div className="w-9 h-9 rounded-full border border-border bg-background flex items-center justify-center shrink-0">
              <Plug className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground truncate">
                  Caminho alternativo: API oficial da Meta, com token próprio
                </p>
                {hasCloudApi && (
                  <span className="eia-pill border border-primary/30 text-primary hidden sm:inline-flex">configurado</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                Para quem prefere a própria conta na WhatsApp Cloud API, sem passar pela Zernio.
              </p>
            </div>
            <motion.span animate={{ rotate: altOpen ? 180 : 0 }} transition={{ duration: 0.25 }}>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {altOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease }}
              >
                <div className="px-5 pb-5 pl-[4.5rem] text-sm text-muted-foreground leading-relaxed space-y-4">
                  <p>
                    O sistema também conversa direto com a Cloud API da Meta. Antes de escolher, saiba as diferenças:
                    esse caminho não tem coexistência (o número fica dedicado à API e sai do app do celular), e a
                    cobrança por conversa vem direto da Meta — sem mensalidade da Zernio.
                  </p>
                  <ol className="space-y-2 list-decimal pl-4 marker:text-primary/60 marker:font-medium">
                    <li>
                      No <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">Meta for Developers</a>,
                      crie um app do tipo Business e adicione o produto WhatsApp. Para produção, cadastre um número que
                      possa ficar exclusivo da API.
                    </li>
                    <li>
                      Em API Setup, copie o Access Token, o WABA ID e o Phone Number ID. O token de teste vence em
                      24 horas — para valer, gere um token permanente com um System User no Business Manager.
                    </li>
                    <li>
                      Aqui no sistema, abra Configurações, aba APIs, seção WhatsApp Cloud API: cole o token, o
                      WABA ID e o Phone Number ID e salve.
                    </li>
                    <li>
                      Na mesma tela, abra "Configuração de Webhook" e copie a Callback URL e o Verify Token.
                      Na Meta, em WhatsApp → Configuration → Webhook, cole os dois e assine o campo "messages".
                    </li>
                    <li>
                      Valide com o "Teste de Envio" da própria aba e peça uma mensagem de volta — a conversa
                      aparece no Chat ao vivo e a Lara responde por ali.
                    </li>
                  </ol>
                  <p>
                    Feito isso, o restante do guia vale igual: configuração, revisão, testes e publicação são os mesmos nos dois caminhos.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => navigate('/settings?tab=apis')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Abrir a aba APIs
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      Abrir a documentação da Meta
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Guia das telas: cada menu da configuração da agente e as integrações */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.56, ease }}
          className="mt-10"
        >
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Guia das telas</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            O que cada menu da configuração faz, o que é essencial e o que é opcional. O único bloco
            obrigatório é o essencial de Identidade e negócio — todo o resto melhora a agente sem
            travar a publicação.
          </p>
          <div className="space-y-3">
            {guide.map((item) => {
              const open = openGuide === item.id;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border bg-card overflow-hidden transition-colors ${
                    open ? 'border-primary/40' : 'border-border/60 hover:border-border'
                  }`}
                >
                  <button
                    onClick={() => setOpenGuide(open ? null : item.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left"
                  >
                    <div className="w-9 h-9 rounded-full border border-border bg-background flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{item.title}</p>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{item.summary}</p>
                    </div>
                    <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease }}
                      >
                        <div className="px-5 pb-5 pl-[4.5rem] text-sm text-muted-foreground leading-relaxed [&_li]:relative [&_li]:pl-4 [&_li:before]:content-[''] [&_li:before]:absolute [&_li:before]:left-0 [&_li:before]:top-[0.55em] [&_li:before]:w-1.5 [&_li:before]:h-1.5 [&_li:before]:rounded-full [&_li:before]:bg-primary/40">
                          {item.body}
                          {item.action && (
                            <div className="mt-4">
                              <button
                                onClick={() => navigate(item.action!.to)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                {item.action.label}
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.62, ease }}
          className="mt-10"
        >
          <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4">Perguntas frequentes</h2>
          <div className="rounded-2xl border border-border/60 bg-card divide-y divide-border/60">
            {faqs.map((faq, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-sm font-medium text-foreground">{faq.q}</span>
                  <motion.span animate={{ rotate: openFaq === i ? 180 : 0 }} transition={{ duration: 0.25 }}>
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease }}
                    >
                      <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="mt-8 mb-4 text-xs text-muted-foreground text-center">
          Travou em algum passo? Questões de plano, conta ou conexão se resolvem no{' '}
          <a href="https://zernio.com" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
            suporte da Zernio
          </a>
          {' '}— ou no{' '}
          <a href="https://developers.facebook.com/support" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
            suporte da Meta
          </a>
          , se você foi pela API oficial; dúvidas sobre o sistema, com quem implantou para você.
        </p>
      </div>
    </div>
  );
};

export default Help;
