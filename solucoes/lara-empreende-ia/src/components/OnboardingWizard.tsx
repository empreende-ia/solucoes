import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Check,
  Circle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  MessageCircle,
  KeyRound,
  Cloud,
  Eye,
  EyeOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useOnboardingStatus, notifyOnboardingChange } from '@/hooks/useOnboardingStatus';
import { channelsApi, type ChannelConnection } from '@/services/channels';
import { getCurrentAgentContext, saveAgentDraft, type AgentContext } from '@/services/agent-config';
import AgentSetupAssistant from '@/components/settings/AgentSetupAssistant';
import { useNavigate } from 'react-router-dom';
import { actionHref } from '@/services/goLive';

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = [
  { id: 'negocio', label: 'Seu negócio' },
  { id: 'canais', label: 'Canais' },
  { id: 'ia', label: 'Ligar a IA' },
  { id: 'cerebro', label: 'Agente' },
  { id: 'revisao', label: 'Revisão' },
] as const;

// Canais e chave de IA têm "Pular" — no passo Agente o Avançar persiste as
// edições de identidade feitas ali, então pular teria o mesmo custo de avançar.
const SKIPPABLE_STEPS = [1, 2];

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ isOpen, onClose }) => {
  const { steps, dismiss, markCompleted, goLiveReady } = useOnboardingStatus();
  const navigate = useNavigate();

  const [activeStep, setActiveStep] = useState(0);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // Passo 1 — identidade
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [sdrName, setSdrName] = useState('');

  // Passo 2 — canal do WhatsApp (Zernio ou Cloud API)
  const [channelMethod, setChannelMethod] = useState<'zernio' | 'cloud'>('zernio');
  const [channelLoading, setChannelLoading] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [changingKey, setChangingKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [whatsappAccessToken, setWhatsappAccessToken] = useState('');
  const [whatsappBusinessAccountId, setWhatsappBusinessAccountId] = useState('');
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState('');
  const [showWhatsappToken, setShowWhatsappToken] = useState(false);
  const [hasCloudApi, setHasCloudApi] = useState(false);

  // Passo 3 — chave da OpenAI (o que faz a agente redigir resposta)
  const [openaiKey, setOpenaiKey] = useState('');
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const openaiKeyDirtyRef = useRef(false);

  // Passo 4 — cérebro
  const [whatCompanySells, setWhatCompanySells] = useState('');
  const [primaryAudience, setPrimaryAudience] = useState('');
  // Contexto do agente para embutir o "Configurar com IA" dentro do passo 3.
  const [agentContext, setAgentContext] = useState<AgentContext | null>(null);
  // Personalidade essencial da agente — campos estruturados do próprio schema
  // (identity.role/introduction e salesProcess.communication).
  const [agentRole, setAgentRole] = useState('');
  const [agentIntroduction, setAgentIntroduction] = useState('');
  const [formality, setFormality] = useState<'informal' | 'balanced' | 'formal'>('balanced');
  const [emojiUsage, setEmojiUsage] = useState<'none' | 'light' | 'moderate'>('light');
  // Quais campos a pessoa editou NESTA sessão do wizard. Só eles (mais lacunas
  // vazias do rascunho) são gravados — campo intocado nunca sobrescreve uma
  // edição concorrente feita pelo assistente ou em outra aba.
  const dirtyIdentityRef = useRef<Set<
    'companyName' | 'sdrName' | 'whatCompanySells' | 'primaryAudience'
    | 'agentRole' | 'agentIntroduction' | 'formality' | 'emojiUsage'
  >>(new Set());

  const loadSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    // O componente fica montado entre aberturas: sem este reset, uma falha de
    // carga na reabertura exibiria valores da sessão anterior como se fossem
    // atuais, e o Avançar gravaria identidade obsoleta por cima do rascunho.
    dirtyIdentityRef.current = new Set();
    openaiKeyDirtyRef.current = false;
    setOpenaiKey('');
    setShowOpenaiKey(false);
    setWhatCompanySells('');
    setPrimaryAudience('');
    setAgentRole('');
    setAgentIntroduction('');
    setFormality('balanced');
    setEmojiUsage('light');
    try {
      const { data } = await (supabase as any)
        .from('lara_settings')
        .select('id, company_name, sdr_name, openai_api_key, whatsapp_access_token, whatsapp_business_account_id, whatsapp_phone_number_id')
        .limit(1)
        .maybeSingle();

      if (data) {
        setSettingsId(data.id);
        // A carga fica em voo enquanto a pessoa já pode digitar (o stepper
        // permite pular de passo): valor editado não é sobrescrito pelo fetch.
        if (!dirtyIdentityRef.current.has('companyName')) setCompanyName(data.company_name || '');
        if (!dirtyIdentityRef.current.has('sdrName')) setSdrName(data.sdr_name || '');
        if (!openaiKeyDirtyRef.current) setOpenaiKey(data.openai_api_key || '');
        setHasOpenaiKey(Boolean(data.openai_api_key));
        setWhatsappAccessToken(data.whatsapp_access_token || '');
        setWhatsappBusinessAccountId(data.whatsapp_business_account_id || '');
        setWhatsappPhoneNumberId(data.whatsapp_phone_number_id || '');
        const cloudConfigured = !!(
          data.whatsapp_access_token
          && data.whatsapp_business_account_id
          && data.whatsapp_phone_number_id
        );
        setHasCloudApi(cloudConfigured);
        if (cloudConfigured) setChannelMethod('cloud');
      }

      try {
        const context = await getCurrentAgentContext();
        setAgentContext(context);
        if (context) {
          const dirty = dirtyIdentityRef.current;
          if (!dirty.has('whatCompanySells')) setWhatCompanySells(context.draftConfig.identity.whatCompanySells || '');
          if (!dirty.has('primaryAudience')) setPrimaryAudience(context.draftConfig.identity.primaryAudience || '');
          if (!dirty.has('agentRole')) setAgentRole(context.draftConfig.identity.role || '');
          if (!dirty.has('agentIntroduction')) setAgentIntroduction(context.draftConfig.identity.introduction || '');
          if (!dirty.has('formality')) setFormality(context.draftConfig.salesProcess.communication.formality);
          if (!dirty.has('emojiUsage')) setEmojiUsage(context.draftConfig.salesProcess.communication.emojiUsage);
        }
      } catch {
        // Rascunho indisponível não bloqueia o onboarding; os campos apenas
        // deixam de sobrescrever a configuração existente.
      }
    } catch (error) {
      console.error('[OnboardingWizard] Erro ao carregar configurações:', error);
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  const loadChannelStatus = useCallback(async () => {
    setChannelLoading(true);
    try {
      const status = await channelsApi.status();
      setHasKey(status.hasKey);
      const whatsappConnections = status.connections.filter(
        (connection) => connection.platform === 'whatsapp' && connection.status === 'active'
      );
      setConnections(whatsappConnections);
      if (status.hasKey && whatsappConnections.length > 0) setChannelMethod('zernio');
    } catch (error) {
      console.error('[OnboardingWizard] Erro ao consultar canais:', error);
    } finally {
      setChannelLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActiveStep(0);
      loadSettings();
      loadChannelStatus();
    }
  }, [isOpen, loadSettings, loadChannelStatus]);

  // ---- Fechamento = dispensar (retomável em Configurações) ----
  const handleDismiss = useCallback(() => {
    // Durante a transição para o assistente (ou um save), Escape/X/backdrop
    // criariam dismiss duplo e uma navegação-surpresa depois do fechamento.
    if (isSaving) return;
    dismiss();
    toast('Você pode retomar em Configurações → Refazer onboarding.');
    onClose();
  }, [dismiss, isSaving, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleDismiss]);

  // ---- Salvamento por passo (só ao avançar a partir dele) ----
  const updateSettings = useCallback(
    async (patch: Record<string, string | null>): Promise<boolean> => {
      if (!settingsId) {
        toast.error('Configurações não encontradas. Recarregue a página e tente de novo.');
        return false;
      }
      const { error } = await (supabase as any)
        .from('lara_settings')
        .update(patch)
        .eq('id', settingsId);
      if (error) {
        toast.error('Erro ao salvar: ' + error.message);
        return false;
      }
      return true;
    },
    [settingsId]
  );

  // Identidade é editável em dois passos (Seu negócio e Agente); a persistência
  // é uma só para os dois avançarem gravando exatamente a mesma coisa.
  const persistIdentity = useCallback(async (): Promise<boolean> => {
    const savedSettings = await updateSettings({
      company_name: companyName.trim() || null,
      sdr_name: sdrName.trim() || null,
    });
    if (!savedSettings) return false;
    try {
      const context = await getCurrentAgentContext();
      if (context) {
        const identity = context.draftConfig.identity;
        const dirty = dirtyIdentityRef.current;
        // Grava um campo apenas se a pessoa o editou nesta sessão, ou se ele
        // preenche uma lacuna vazia do rascunho (espelhamento da primeira
        // configuração). O estado local é um snapshot da abertura do wizard;
        // gravar campos intocados com a revisão fresca apagaria, sem conflito
        // e sem aviso, o que o assistente ou outra aba salvou nesse meio-tempo.
        const fillsGap = (local: string, draftValue: string | undefined) =>
          Boolean(local.trim()) && !String(draftValue ?? '').trim();
        const patch: Partial<typeof identity> = {};
        if (dirty.has('companyName') || fillsGap(companyName, identity.companyName)) patch.companyName = companyName.trim();
        if (dirty.has('sdrName') || fillsGap(sdrName, identity.agentName)) patch.agentName = sdrName.trim() || identity.agentName || 'Lara';
        if (dirty.has('whatCompanySells') || fillsGap(whatCompanySells, identity.whatCompanySells)) patch.whatCompanySells = whatCompanySells.trim();
        if (dirty.has('primaryAudience') || fillsGap(primaryAudience, identity.primaryAudience)) patch.primaryAudience = primaryAudience.trim();
        if (dirty.has('agentRole') || fillsGap(agentRole, identity.role)) patch.role = agentRole.trim() || identity.role || 'Assistente de vendas';
        if (dirty.has('agentIntroduction') || fillsGap(agentIntroduction, identity.introduction)) patch.introduction = agentIntroduction.trim();
        // Formalidade e emojis sempre têm um valor (defaults do schema); só a
        // escolha explícita da pessoa entra no rascunho.
        const communication = context.draftConfig.salesProcess.communication;
        const communicationPatch: Partial<typeof communication> = {};
        if (dirty.has('formality')) communicationPatch.formality = formality;
        if (dirty.has('emojiUsage')) communicationPatch.emojiUsage = emojiUsage;
        if (Object.keys(patch).length > 0 || Object.keys(communicationPatch).length > 0) {
          await saveAgentDraft(context.agentId, {
            ...context.draftConfig,
            identity: { ...identity, ...patch },
            salesProcess: {
              ...context.draftConfig.salesProcess,
              communication: { ...communication, ...communicationPatch },
            },
          }, context.draftRevision);
        }
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar o rascunho da agente.');
      return false;
    }
  }, [companyName, sdrName, whatCompanySells, primaryAudience, agentRole, agentIntroduction, formality, emojiUsage, updateSettings]);

  const saveStep = useCallback(
    async (step: number): Promise<boolean> => {
      // O passo 4 é o assistente: ele mesmo grava o rascunho. Persistir a
      // identidade local aqui sobrescreveria a proposta recém-aplicada.
      if (step === 0) return persistIdentity();

      if (step === 2) {
        if (!openaiKeyDirtyRef.current) return true;
        const key = openaiKey.trim();
        // Campo em branco é permitido: quem usa o secret OPENAI_API_KEY do
        // projeto não precisa digitar nada aqui.
        if (key && !key.startsWith('sk-')) {
          toast.error('A chave da OpenAI começa com sk-. Confira o que foi colado.');
          return false;
        }
        const saved = await updateSettings({ openai_api_key: key || null });
        if (saved) {
          setHasOpenaiKey(Boolean(key));
          openaiKeyDirtyRef.current = false;
          if (key) toast.success('Chave da OpenAI salva.');
        }
        return saved;
      }

      if (step === 1 && channelMethod === 'cloud') {
        const accessToken = whatsappAccessToken.trim();
        const businessAccountId = whatsappBusinessAccountId.trim();
        const phoneNumberId = whatsappPhoneNumberId.trim();

        if (!accessToken && !businessAccountId && !phoneNumberId) return true;
        if (!accessToken || !businessAccountId || !phoneNumberId) {
          toast.error('Preencha o Access Token, o WABA ID e o Phone Number ID para usar a Cloud API');
          return false;
        }
        if (!/^\d+$/.test(businessAccountId)) {
          toast.error('WABA ID deve conter apenas números');
          return false;
        }
        if (!/^\d+$/.test(phoneNumberId)) {
          toast.error('Phone Number ID deve conter apenas números');
          return false;
        }

        const saved = await updateSettings({
          whatsapp_access_token: accessToken,
          whatsapp_business_account_id: businessAccountId,
          whatsapp_phone_number_id: phoneNumberId,
        });
        if (saved) {
          setHasCloudApi(true);
          toast.success('WhatsApp Cloud API configurada');
        }
        return saved;
      }

      return true; // passos sem persistência própria
    },
    [
      persistIdentity,
      updateSettings,
      channelMethod,
      openaiKey,
      whatsappAccessToken,
      whatsappBusinessAccountId,
      whatsappPhoneNumberId,
    ]
  );

  const handleNext = async () => {
    setIsSaving(true);
    const ok = await saveStep(activeStep);
    setIsSaving(false);
    if (!ok) return;
    notifyOnboardingChange();
    setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  // Saltar pelo stepper salva como o botão Avançar; sem isso, pular adiante
  // descartava silenciosamente o que estava digitado no passo atual.
  const goToStep = async (index: number) => {
    if (index === activeStep || isSaving) return;
    if (index > activeStep) {
      setIsSaving(true);
      const ok = await saveStep(activeStep);
      setIsSaving(false);
      if (!ok) return;
      notifyOnboardingChange();
    }
    setActiveStep(index);
  };

  const handleSkip = () => {
    setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setActiveStep((s) => Math.max(s - 1, 0));
  };

  const fireConfetti = () => {
    const defaults = { origin: { y: 0.7 }, zIndex: 9999 };
    confetti({ ...defaults, particleCount: 80, spread: 60, startVelocity: 45 });
    confetti({ ...defaults, particleCount: 60, spread: 100, decay: 0.91, scalar: 0.8 });
    confetti({ ...defaults, particleCount: 40, spread: 120, startVelocity: 25, decay: 0.92 });
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    const completed = await markCompleted();
    setIsCompleting(false);
    // Sem sucesso não há o que celebrar: o updateOnboarding já mostrou o erro,
    // e confetti + "concluído" contradiriam o wizard reaparecendo no reload.
    if (!completed) return;

    // Comemorar com item pendente era a mentira mais cara do wizard: a pessoa
    // saía daqui achando que a Lara atendia, e nenhum lead era respondido.
    const pending = steps.filter((step) => !step.isComplete);
    if (goLiveReady && pending.length === 0) {
      fireConfetti();
      toast.success('Configuração concluída. A Lara está pronta para atender.');
    } else {
      toast(
        pending.length === 1
          ? `Configuração salva. Falta 1 item: ${pending[0].title}.`
          : `Configuração salva. Faltam ${pending.length} itens: ${pending.map((step) => step.title).join(', ')}.`,
      );
    }
    onClose();
  };

  // ---- Passo 2: ações Zernio ----
  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) {
      toast.error('Cole a chave da API Zernio antes de salvar');
      return;
    }
    setSavingKey(true);
    try {
      await channelsApi.saveKey(apiKeyInput.trim());
      setApiKeyInput('');
      setChangingKey(false);
      toast.success('Chave salva.');
      await loadChannelStatus();
    } catch (error: any) {
      toast.error(error?.message ?? 'Erro ao salvar a chave');
    } finally {
      setSavingKey(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const authUrl = await channelsApi.connect('whatsapp');
      window.open(authUrl, '_blank', 'noopener,noreferrer');
      toast('Autorize na nova aba e depois clique em Sincronizar');
    } catch (error: any) {
      toast.error(error?.message ?? 'Erro ao iniciar a conexão');
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const updated = await channelsApi.sync();
      setConnections(updated.filter((c) => c.platform === 'whatsapp' && c.status === 'active'));
      notifyOnboardingChange();
      toast.success('Contas sincronizadas');
    } catch (error: any) {
      toast.error(error?.message ?? 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  // ---- Render dos passos ----
  const renderStepNegocio = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Comece pelo básico</h3>
        <p className="text-sm text-muted-foreground mt-1">
          A Lara usa esses nomes para se apresentar nas conversas.
        </p>
      </div>
      <div className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="onboarding-company">Nome da empresa</Label>
          <Input
            id="onboarding-company"
            value={companyName}
            maxLength={160}
            onChange={(e) => { dirtyIdentityRef.current.add('companyName'); setCompanyName(e.target.value); }}
            placeholder="Ex.: Empreende.IA"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="onboarding-sdr">Nome da agente</Label>
          <Input
            id="onboarding-sdr"
            value={sdrName}
            maxLength={80}
            onChange={(e) => { dirtyIdentityRef.current.add('sdrName'); setSdrName(e.target.value); }}
            placeholder="Ex.: Lara"
          />
          <p className="text-xs text-muted-foreground">
            É assim que ela vai se apresentar para os seus leads.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="onboarding-sells">O que a empresa vende</Label>
          <textarea
            id="onboarding-sells"
            value={whatCompanySells}
            maxLength={4000}
            onChange={(e) => { dirtyIdentityRef.current.add('whatCompanySells'); setWhatCompanySells(e.target.value); }}
            className="min-h-20 w-full resize-y rounded-xl border border-input bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            placeholder="Ex.: Mentoria de implantação, treinamento da equipe e agentes de atendimento sob medida."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="onboarding-audience">Público principal</Label>
          <textarea
            id="onboarding-audience"
            value={primaryAudience}
            maxLength={4000}
            onChange={(e) => { dirtyIdentityRef.current.add('primaryAudience'); setPrimaryAudience(e.target.value); }}
            className="min-h-20 w-full resize-y rounded-xl border border-input bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            placeholder="Ex.: Donos de empresas de serviços com equipe comercial pequena e alto volume de WhatsApp."
          />
          <p className="text-xs text-muted-foreground">
            Esses dois campos já entram na configuração real da agente — o assistente de IA parte deles.
          </p>
        </div>
      </div>
    </div>
  );

  const renderStepCanais = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Como você quer conectar o WhatsApp?</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha um dos caminhos. Você pode trocar ou concluir a configuração depois.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Método de conexão do WhatsApp">
        <button
          type="button"
          aria-pressed={channelMethod === 'zernio'}
          onClick={() => setChannelMethod('zernio')}
          className={`rounded-xl border p-4 text-left transition-colors ${
            channelMethod === 'zernio'
              ? 'border-primary/30 bg-primary/10'
              : 'border-border bg-card hover:border-primary/20'
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
            Zernio
            <Badge variant="muted">Recomendado</Badge>
          </span>
          <span className="mt-2 block text-xs text-muted-foreground">
            Mantém o número no WhatsApp Business e simplifica a conexão com a Meta.
          </span>
        </button>
        <button
          type="button"
          aria-pressed={channelMethod === 'cloud'}
          onClick={() => setChannelMethod('cloud')}
          className={`rounded-xl border p-4 text-left transition-colors ${
            channelMethod === 'cloud'
              ? 'border-primary/30 bg-primary/10'
              : 'border-border bg-card hover:border-primary/20'
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Cloud className="h-4 w-4 text-primary" aria-hidden="true" />
            WhatsApp Cloud API
          </span>
          <span className="mt-2 block text-xs text-muted-foreground">
            Conexão direta com a Meta usando Access Token, WABA ID e Phone Number ID.
          </span>
        </button>
      </div>

      {channelMethod === 'zernio' ? (
        channelLoading ? (
          <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Consultando a Zernio...
          </div>
        ) : !hasKey ? (
          <div className="max-w-md space-y-3">
            <Label htmlFor="onboarding-zernio-key">Chave da API Zernio</Label>
            <div className="flex gap-2">
              <Input
                id="onboarding-zernio-key"
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Cole a chave da sua conta Zernio"
              />
              <Button variant="secondary" onClick={handleSaveKey} disabled={savingKey} className="shrink-0">
                {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Salvar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Obtenha em zernio.com → Settings → API Keys. Para WhatsApp e Inbox, use o plano usage-based.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="success">Chave configurada</Badge>
              <button
                type="button"
                onClick={() => { setChangingKey(!changingKey); setApiKeyInput(''); }}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {changingKey ? 'Manter a chave atual' : 'Trocar chave'}
              </button>
            </div>

            {changingKey && (
              <div className="flex max-w-md gap-2">
                <Input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Cole a nova chave (sk_…)"
                />
                <Button variant="secondary" onClick={handleSaveKey} disabled={savingKey} className="shrink-0">
                  {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Salvar
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={handleConnect} disabled={connecting}>
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                Conectar WhatsApp
              </Button>
              <Button variant="ghost" onClick={handleSync} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sincronizar
              </Button>
            </div>

            {connections.length > 0 ? (
              <div className="space-y-2">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary px-4 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-3 text-sm text-foreground">
                      <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        {connection.display_name || connection.username || connection.zernio_account_id}
                      </span>
                    </span>
                    <Badge variant="success">Ativa</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma conta ativa. Conecte o WhatsApp e sincronize depois de autorizar.
              </p>
            )}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant={hasCloudApi ? 'success' : 'muted'}>
              {hasCloudApi ? 'Cloud API configurada' : 'Configuração direta'}
            </Badge>
            <span className="text-xs text-muted-foreground">Os dados serão salvos ao avançar.</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="onboarding-whatsapp-token">Access Token</Label>
              <div className="relative">
                <Input
                  id="onboarding-whatsapp-token"
                  type={showWhatsappToken ? 'text' : 'password'}
                  value={whatsappAccessToken}
                  onChange={(event) => setWhatsappAccessToken(event.target.value)}
                  placeholder="EAAxxxxxxxxxxxxxxx…"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowWhatsappToken((visible) => !visible)}
                  aria-label={showWhatsappToken ? 'Ocultar Access Token' : 'Mostrar Access Token'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showWhatsappToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboarding-waba-id">WABA ID</Label>
              <Input
                id="onboarding-waba-id"
                inputMode="numeric"
                value={whatsappBusinessAccountId}
                onChange={(event) => setWhatsappBusinessAccountId(event.target.value)}
                placeholder="123456789012345"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboarding-phone-number-id">Phone Number ID</Label>
              <Input
                id="onboarding-phone-number-id"
                inputMode="numeric"
                value={whatsappPhoneNumberId}
                onChange={(event) => setWhatsappPhoneNumberId(event.target.value)}
                placeholder="123456789012345"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Depois, copie e configure o webhook em Configurações → APIs → WhatsApp Cloud API.
          </p>
        </div>
      )}
    </div>
  );

  const renderStepIa = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Ligar a IA</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A chave da OpenAI é o que faz a Lara escrever. Sem ela a mensagem do lead entra e nada sai.
        </p>
      </div>

      <div className="max-w-md space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="onboarding-openai-key">Chave da OpenAI</Label>
          <Badge variant={hasOpenaiKey ? 'success' : 'muted'}>
            {hasOpenaiKey ? 'Configurada' : 'Aguardando'}
          </Badge>
        </div>
        <div className="relative">
          <Input
            id="onboarding-openai-key"
            type={showOpenaiKey ? 'text' : 'password'}
            value={openaiKey}
            onChange={(event) => {
              openaiKeyDirtyRef.current = true;
              setOpenaiKey(event.target.value);
            }}
            placeholder="sk-proj-..."
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowOpenaiKey((visible) => !visible)}
            aria-label={showOpenaiKey ? 'Ocultar chave da OpenAI' : 'Mostrar chave da OpenAI'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Gere em{' '}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
            platform.openai.com/api-keys
          </a>
          . A chave é salva ao avançar e pode ser trocada em Configurações → APIs. Se o secret
          OPENAI_API_KEY já estiver definido no Supabase, deixe em branco.
        </p>
      </div>
    </div>
  );

  const renderStepCerebro = () => {
    if (isLoadingSettings) {
      return (
        <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando a agente...
        </div>
      );
    }

    if (!agentContext) {
      return (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Configure a agente</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Não foi possível carregar o rascunho da agente agora. Você pode continuar e configurar
              depois em <strong className="text-foreground">Configurações → Agente</strong>.
            </p>
          </div>
          <Button variant="secondary" size="sm" disabled={isLoadingSettings} onClick={() => void loadSettings()}>
            <RefreshCw className="h-4 w-4" />
            Tentar de novo
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Configure a agente</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            O assistente aproveita o que você já preencheu, lê seu site e materiais e propõe processo de
            vendas, qualificação e fatos — tudo revisável antes de aplicar.
          </p>
        </div>

        {/* Mesmo fluxo de Configurações → Agente, embutido: sem modal dentro de
            modal e sem perder o progresso ao trocar de passo. */}
        <AgentSetupAssistant
          open
          variant="embedded"
          onOpenChange={() => undefined}
          agentId={agentContext.agentId}
          currentConfig={agentContext.draftConfig}
          editable
          answerOverrides={{
            companyName,
            whatCompanySells,
            primaryAudience,
          }}
          onApply={async (config) => {
            const draft = await saveAgentDraft(agentContext.agentId, config, agentContext.draftRevision);
            setAgentContext({ ...agentContext, draftConfig: draft.config, draftRevision: draft.revision });
          }}
          onApplied={() => {
            notifyOnboardingChange();
            setActiveStep(4);
          }}
          footerExtra={
            <Button variant="ghost" onClick={() => setActiveStep(4)}>
              Pular por enquanto
            </Button>
          }
        />

        <p className="text-xs text-muted-foreground">
          Prefere fazer à mão? Tudo também é editável campo a campo em{' '}
          <strong className="text-foreground">Configurações → Agente</strong>; os fatos ficam na seção{' '}
          <strong className="text-foreground">Conhecimento</strong>.
        </p>
      </div>
    );
  };


  // Sair do wizard para consertar um item: dispensa como o X faria, para o
  // assistente não reabrir sozinho por cima da tela de destino.
  const goToFix = (href: string) => {
    dismiss();
    onClose();
    toast('Você pode retomar em Configurações → Refazer onboarding.');
    navigate(href);
  };

  const renderStepRevisao = () => {
    const pending = steps.filter((step) => !step.isComplete);

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {pending.length === 0 ? 'Tudo pronto para atender.' : 'O que ainda falta.'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {pending.length === 0
              ? 'Os seis itens que o atendimento exige estão em ordem.'
              : 'Esta lista é a mesma verificação que o painel faz. Item pendente significa lead sem resposta.'}
          </p>
        </div>

        <div className="space-y-2">
          {steps.map((step) => {
            const href = actionHref(step.action);
            return (
              <div
                key={step.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary px-4 py-3"
              >
                {step.isComplete ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <Circle className="h-3 w-3" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {step.isComplete
                      ? step.message || 'Configurado'
                      : step.message || step.description}
                  </p>
                </div>
                {!step.isComplete && href && (
                  <Button variant="secondary" size="sm" onClick={() => goToFix(href)}>
                    {step.action?.label ?? 'Resolver'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Concluir aqui não liga o atendimento: quem liga são os seis itens acima. O painel mostra a
          mesma lista e atualiza sozinho.
        </p>
      </div>
    );
  };

  const renderActiveStep = () => {
    switch (activeStep) {
      case 0:
        return renderStepNegocio();
      case 1:
        return renderStepCanais();
      case 2:
        return renderStepIa();
      case 3:
        return renderStepCerebro();
      case 4:
        return renderStepRevisao();
      default:
        return null;
    }
  };

  const isLastStep = activeStep === STEPS.length - 1;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="eia-dialog-overlay absolute inset-0"
              onClick={handleDismiss}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="eia-dialog-content relative w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Onboarding da Lara"
            >
              {/* Header */}
              <div className="flex items-start justify-between px-8 pt-7 pb-5 border-b border-border">
                <div>
                  <h2 className="eia-dialog-title">Configurar a Lara</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Passo {activeStep + 1} de {STEPS.length} — tudo pode ser ajustado depois
                  </p>
                </div>
                <button
                  onClick={handleDismiss}
                  className="eia-dialog-close -mr-2 -mt-1"
                  aria-label="Fechar onboarding"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Stepper */}
              <div className="px-8 py-5 border-b border-border bg-secondary">
                <div className="flex items-center">
                  {STEPS.map((step, index) => {
                    const isVisited = index < activeStep;
                    const isActive = index === activeStep;
                    return (
                      <React.Fragment key={step.id}>
                        <button
                          onClick={() => void goToStep(index)}
                          disabled={isSaving}
                          className="flex flex-col items-center gap-1.5 shrink-0 group disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`Ir para o passo ${step.label}`}
                        >
                          <span
                            className={`flex items-center justify-center w-8 h-8 rounded-full border text-xs font-semibold transition-colors ${
                              isVisited
                                ? 'bg-primary border-primary text-primary-foreground'
                                : isActive
                                ? 'border-primary text-primary bg-primary/10'
                                : 'border-border text-muted-foreground bg-secondary group-hover:border-primary/40'
                            }`}
                          >
                            {isVisited ? <Check className="w-4 h-4" /> : index + 1}
                          </span>
                          <span
                            className={`text-[11px] font-medium whitespace-nowrap ${
                              isActive ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {step.label}
                          </span>
                        </button>
                        {index < STEPS.length - 1 && (
                          <div className="flex-1 h-px mx-2 mb-5 bg-border overflow-hidden rounded-full">
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{ width: index < activeStep ? '100%' : '0%' }}
                            />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Conteúdo */}
              <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-6">
                {isLoadingSettings && activeStep === 0 ? (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground py-10">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando configurações...
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeStep}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                    >
                      {renderActiveStep()}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-8 py-5 border-t border-border bg-secondary">
                <Button variant="ghost" onClick={handleBack} disabled={activeStep === 0 || isSaving}>
                  <ChevronLeft className="w-4 h-4" />
                  Voltar
                </Button>

                <div className="flex items-center gap-2">
                  {SKIPPABLE_STEPS.includes(activeStep) && (
                    <Button variant="ghost" onClick={handleSkip} disabled={isSaving}>
                      Pular por enquanto
                    </Button>
                  )}
                  {/* No passo do assistente a navegação vive no rodapé dele:
                      dois "Avançar" na tela dariam caminhos divergentes. */}
                  {activeStep === 3 ? null : isLastStep ? (
                    <Button variant="primary" onClick={handleComplete} disabled={isCompleting}>
                      {isCompleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Concluir onboarding
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={handleNext} disabled={isSaving}>
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Avançar
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </>
  );
};
