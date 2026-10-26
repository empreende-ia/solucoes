import { useState, useEffect, useMemo, useRef, useCallback, useReducer } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@/lib/navigation';
import { toast } from 'sonner';
import { campaignService, contactService, templateService } from '../services';
import { settingsService } from '../services/settingsService';
import { CampaignStatus, ContactStatus, MessageStatus, Template, TestContact } from '../types';
import { useAccountLimits } from './useAccountLimits';
import { CampaignValidation } from '../lib/meta-limits';
import { normalizePhoneNumber } from '@/lib/phone-formatter';
import {
  calculateAudienceStats,
  getContactIdsByCriteria,
  applyPreset,
  findTopTag,
  type AudienceCriteria,
  type AudiencePresetId,
} from '@/lib/business/audience';
import { getTemplateVariableInfo } from '@/lib/business/template';
import {
  wizardReducer,
  initialWizardState,
  audienceReducer,
  initialAudienceState,
  schedulingReducer,
  initialSchedulingState,
} from './campaigns/campaignWizardReducer';

export const useCampaignWizardController = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Grouped state via reducers (reduces re-renders)
  const [wizard, dispatchWizard] = useReducer(wizardReducer, initialWizardState);
  const [audience, dispatchAudience] = useReducer(audienceReducer, initialAudienceState);
  const [scheduling, dispatchScheduling] = useReducer(schedulingReducer, initialSchedulingState);

  // Destructure for easier access
  const { step, name, selectedTemplateId, templateVariables } = wizard;
  const { recipientSource, selectedContactIds, audiencePreset, audienceCriteria, contactSearchTerm } = audience;
  const { scheduledAt, isScheduling } = scheduling;

  // State setters (backward compatible API)
  const setStep = useCallback((s: number) => dispatchWizard({ type: 'SET_STEP', payload: s }), []);
  const setName = useCallback((n: string) => dispatchWizard({ type: 'SET_NAME', payload: n }), []);
  const setSelectedTemplateId = useCallback((id: string) => dispatchWizard({ type: 'SET_TEMPLATE', payload: id }), []);
  const setTemplateVariables = useCallback((vars: typeof templateVariables) => dispatchWizard({ type: 'SET_TEMPLATE_VARIABLES', payload: vars }), []);
  const setRecipientSource = useCallback((src: typeof recipientSource) => dispatchAudience({ type: 'SET_SOURCE', payload: src }), []);
  const setSelectedContactIds = useCallback((ids: string[]) => dispatchAudience({ type: 'SET_SELECTED_IDS', payload: ids }), []);
  const setContactSearchTerm = useCallback((term: string) => dispatchAudience({ type: 'SET_SEARCH', payload: term }), []);
  const setAudiencePreset = useCallback((preset: AudiencePresetId | null) => dispatchAudience({ type: 'SET_PRESET', payload: preset }), []);
  const setAudienceCriteria = useCallback((criteria: AudienceCriteria) => dispatchAudience({ type: 'SET_CRITERIA', payload: criteria }), []);
  const setScheduledAt = useCallback((at: string | null) => dispatchScheduling({ type: 'SET_SCHEDULED_AT', payload: at }), []);
  const setIsScheduling = useCallback((is: boolean) => dispatchScheduling({ type: 'SET_IS_SCHEDULING', payload: is }), []);

  // Validation Modal State
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [validationResult, setValidationResult] = useState<CampaignValidation | null>(null);

  // Pré-check (dry-run) state
  const [precheckResult, setPrecheckResult] = useState<any>(null);
  const [isPrechecking, setIsPrechecking] = useState(false);
  const lastAutoPrecheckKeyRef = useRef<string>('');

  // Test contact: garante um contactId real (necessário para campaign_contacts e workflow)
  const [resolvedTestContactId, setResolvedTestContactId] = useState<string | null>(null);
  const [isEnsuringTestContact, setIsEnsuringTestContact] = useState(false);

  // Account Limits Hook
  const { validate, limits, isLoading: limitsLoading, tierName } = useAccountLimits();

  // --- Queries ---
  const contactsQuery = useQuery({
    queryKey: ['contacts'],
    queryFn: contactService.getAll,
    enabled: step >= 2,
    staleTime: 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: templateService.getAll,
    select: (data) => data.filter(t => t.status === 'APPROVED'),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Get settings (mostly for limits/credentials)
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // NEW: Fetch test contact from DB (Source of Truth)
  const testContactQuery = useQuery({
    queryKey: ['testContact'],
    queryFn: settingsService.getTestContact,
    staleTime: 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Prefer DB data, fallback to settings (legacy/local)
  const testContact = testContactQuery.data || settingsQuery.data?.testContact;

  // Quando a fonte é "Contato de Teste", criamos (ou atualizamos) um contato no banco por telefone
  // para obter um contactId real. Isso evita:
  // - pré-check ignorando por MISSING_CONTACT_ID
  // - criação de campanha quebrando por campaign_contacts exigir contact_id
  useEffect(() => {
    let cancelled = false;

    const ensure = async () => {
      if (recipientSource !== 'test' || !testContact?.phone) {
        setResolvedTestContactId(null);
        setIsEnsuringTestContact(false);
        return;
      }

      setIsEnsuringTestContact(true);
      try {
        const saved = await contactService.add({
          name: testContact.name || 'Contato de Teste',
          phone: testContact.phone,
          email: null,
          status: ContactStatus.OPT_IN,
          tags: [],
          custom_fields: {},
        } as any);

        if (!cancelled) {
          setResolvedTestContactId(saved?.id || null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setResolvedTestContactId(null);
          toast.error(e?.message || 'Não foi possível preparar o contato de teste para envio');
        }
      } finally {
        if (!cancelled) setIsEnsuringTestContact(false);
      }
    };

    ensure();
    return () => {
      cancelled = true;
    };
  }, [recipientSource, testContact?.phone, testContact?.name]);

  // Initialize name
  useEffect(() => {
    if (!name) {
      const date = new Date().toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
      setName(`Campanha ${date}`);
    }
  }, []);

  // Update selected contact IDs when switching to "all"
  useEffect(() => {
    if (recipientSource === 'all' && contactsQuery.data) {
      setSelectedContactIds(contactsQuery.data.map(c => c.id));
    } else if (recipientSource === 'test') {
      // Test mode doesn't use contact IDs - handled separately
      setSelectedContactIds([]);
    }
  }, [recipientSource, contactsQuery.data]);

  // --- Mutations ---
  const createCampaignMutation = useMutation({
    mutationFn: campaignService.create,
    onMutate: async (input) => {
      // Generate temp ID for immediate navigation
      const tempId = `temp_${Date.now()}`;

      // 🚀 PRE-SET cache with PENDING messages BEFORE API call
      const contacts = input.selectedContacts || [];
      const pendingMessages = contacts.map((contact, index) => ({
        id: `msg_${tempId}_${index}`,
        campaignId: tempId,
        contactId: contact.id,
        contactName: contact.name || contact.phone,
        contactPhone: contact.phone,
        status: MessageStatus.PENDING,
        sentAt: '-',
      }));

      // Pre-populate the campaign in cache
      const pendingCampaign = {
        id: tempId,
        name: input.name,
        templateName: input.templateName,
        recipients: input.recipients,
        // Prévia leve (não salvar a lista inteira para não explodir memória)
        pendingContacts: contacts.slice(0, 50).map(c => ({
          name: c.name || '',
          phone: c.phone,
        })),
        sent: 0,
        delivered: 0,
        read: 0,
        skipped: 0,
        failed: 0,
        status: (input.scheduledAt ? 'SCHEDULED' : 'SENDING') as CampaignStatus,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData(['campaign', tempId], pendingCampaign);

      // Importante:
      // A tela de detalhes usa queryKey ['campaignMessages', id, filterStatus, includeRead].
      // Aqui pré-populamos o formato esperado para evitar “Carregando...” enquanto o backend
      // faz pré-check/dispatch (pode levar ~10s).
      queryClient.setQueryData(['campaignMessages', tempId, null, false], {
        messages: pendingMessages,
        stats: {
          total: pendingMessages.length,
          pending: pendingMessages.length,
          sent: 0,
          delivered: 0,
          read: 0,
          skipped: 0,
          failed: 0,
        },
        pagination: {
          limit: pendingMessages.length,
          offset: 0,
          total: pendingMessages.length,
          hasMore: false,
        },
      });

      // Navigate IMMEDIATELY (before API responds)
      navigate(`/campaigns/${tempId}`);

      return { tempId };
    },
    onSuccess: (campaign, _input, context) => {
      const tempId = context?.tempId;

      // Copy cached data to real campaign ID
      if (tempId) {
        const cachedMessages = queryClient.getQueryData(['campaignMessages', tempId, null, false]);
        if (cachedMessages) {
          queryClient.setQueryData(['campaignMessages', campaign.id, null, false], cachedMessages);
        }
        // Clean up temp cache
        queryClient.removeQueries({ queryKey: ['campaign', tempId] });
        queryClient.removeQueries({ queryKey: ['campaignMessages', tempId] });
      }

      // Preenche imediatamente o cache da campanha real (evita flicker após replace)
      if (campaign?.id) {
        queryClient.setQueryData(['campaign', campaign.id], campaign);
      }

      queryClient.invalidateQueries({ queryKey: ['campaigns'] });

      // Navigate to real campaign (replaces temp URL)
      navigate(`/campaigns/${campaign.id}`, { replace: true });

      if (campaign?.status === 'Agendado') {
        toast.success('Campanha criada e agendada com sucesso!');
      } else {
        toast.success('Campanha criada e disparada com sucesso!');

        // Para campanhas pequenas/médias, o envio pode terminar antes do Realtime conectar.
        // Refetch automático após 2s para atualizar as stats.
        if (campaign?.recipients && campaign.recipients < 2500) {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['campaign', campaign.id] });
            queryClient.invalidateQueries({ queryKey: ['campaignMessages', campaign.id] });
            queryClient.invalidateQueries({ queryKey: ['campaignMetrics', campaign.id] });
          }, 2000);
        }
      }
    },
    onError: (_error, _input, context) => {
      // Clean up temp cache on error
      if (context?.tempId) {
        queryClient.removeQueries({ queryKey: ['campaign', context.tempId] });
        queryClient.removeQueries({ queryKey: ['campaignMessages', context.tempId] });
      }
      toast.error('Erro ao criar campanha.');
      navigate('/campaigns');
    }
  });

  // --- Logic ---
  const allContacts = contactsQuery.data || [];
  const totalContacts = allContacts.length;
  const selectedContacts = allContacts.filter(c => selectedContactIds.includes(c.id));

  // Supressões globais por telefone (best-effort): mantém UI/contagens alinhadas com o backend.
  const suppressionsQuery = useQuery({
    queryKey: ['phoneSuppressionsActive', contactsQuery.dataUpdatedAt],
    enabled: (contactsQuery.data?.length || 0) > 0,
    queryFn: async (): Promise<{ phones: string[] }> => {
      const phones = Array.from(
        new Set((contactsQuery.data || []).map((c: any) => String(c?.phone || '').trim()).filter(Boolean))
      );

      if (phones.length === 0) return { phones: [] };

      const res = await fetch('/api/phone-suppressions/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones }),
      });

      if (!res.ok) {
        // best-effort: se falhar, seguimos sem supressões para não travar o wizard
        return { phones: [] };
      }

      return res.json();
    },
    select: (data) => {
      const normalized = (data?.phones || [])
        .map((p) => normalizePhoneNumber(String(p || '').trim()))
        .filter(Boolean);
      return new Set(normalized);
    },
    staleTime: 30 * 1000,
  });

  const suppressedPhones = suppressionsQuery.data || new Set<string>();

  // Use pure function from business logic
  const topTag = useMemo(() => findTopTag(allContacts), [allContacts]);

  // Use pure function from business logic
  const audienceStats = useMemo(
    () => calculateAudienceStats(allContacts, suppressedPhones, topTag),
    [allContacts, suppressedPhones, topTag]
  );

  // Use pure function from business logic for criteria filtering
  // Uses batch action to update all audience state in one dispatch (reduces re-renders)
  const applyAudienceCriteria = useCallback((criteria: AudienceCriteria, preset?: AudiencePresetId) => {
    const ids = getContactIdsByCriteria(allContacts, criteria, suppressedPhones);
    dispatchAudience({
      type: 'APPLY_PRESET',
      payload: {
        source: 'specific',
        preset: preset ?? 'manual',
        criteria,
        selectedIds: ids,
      },
    });
  }, [allContacts, suppressedPhones]);

  // Use pure function from business logic for preset application
  // Uses batch action to update all audience state in one dispatch (reduces re-renders)
  const selectAudiencePreset = useCallback((preset: AudiencePresetId) => {
    if (preset === 'test') {
      dispatchAudience({
        type: 'APPLY_PRESET',
        payload: {
          source: 'test',
          preset: 'test',
          criteria: initialAudienceState.audienceCriteria,
          selectedIds: [],
        },
      });
      return;
    }

    if (preset === 'manual') {
      dispatchAudience({
        type: 'APPLY_PRESET',
        payload: {
          source: 'specific',
          preset: 'manual',
          criteria: {
            status: 'ALL',
            includeTag: null,
            createdWithinDays: null,
            excludeOptOut: false,
            noTags: false,
            uf: null,
            ddi: null,
            customFieldKey: null,
            customFieldMode: null,
            customFieldValue: null,
          },
          selectedIds: [],
        },
      });
      return;
    }

    // Use applyPreset from business logic for all other presets
    const result = applyPreset(preset, allContacts, suppressedPhones, { topTag });
    dispatchAudience({
      type: 'APPLY_PRESET',
      payload: {
        source: 'specific',
        preset: result.fallbackPreset ?? preset,
        criteria: result.criteria,
        selectedIds: result.contactIds,
      },
    });
  }, [allContacts, suppressedPhones, topTag]);

  // Default audience (Jobs-mode): novos (7d), once contacts are available.
  useEffect(() => {
    if (step !== 2) return;
    if (audiencePreset) return;
    if (!allContacts || allContacts.length === 0) return;
    // Default (simples): Todos (já exclui opt-out + supressões)
    selectAudiencePreset('all');
  }, [step, allContacts.length, audiencePreset]);

  // Filter contacts by search term (name, phone, email, tags)
  const filteredContacts = useMemo(() => {
    if (!contactSearchTerm.trim()) return allContacts;
    const term = contactSearchTerm.toLowerCase().trim();
    return allContacts.filter(contact => {
      const nameMatch = contact.name?.toLowerCase().includes(term);
      const phoneMatch = contact.phone?.toLowerCase().includes(term);
      const emailMatch = contact.email?.toLowerCase().includes(term);
      const tagsMatch = contact.tags?.some(tag => tag.toLowerCase().includes(term));
      return nameMatch || phoneMatch || emailMatch || tagsMatch;
    });
  }, [allContacts, contactSearchTerm]);

  // Calculate recipient count - 1 for test mode, otherwise selected contacts
  const recipientCount = recipientSource === 'test' && testContact ? 1 : selectedContacts.length;

  // Get contacts for sending - test contact or selected contacts (includes email and custom_fields for variable resolution)
  const contactsForSending = recipientSource === 'test' && testContact
    ? (() => {
      const testId = resolvedTestContactId;
      if (!testId) return [];
      return [
        {
          id: testId,
          contactId: testId,
          name: testContact.name || testContact.phone,
          phone: testContact.phone,
          email: (testContact as any).email || '',
          custom_fields: (testContact as any).custom_fields || {},
        },
      ];
    })()
    : selectedContacts.map(c => ({ id: c.id, contactId: c.id, name: c.name || c.phone, phone: c.phone, email: c.email || '', custom_fields: c.custom_fields || {} }));

  const availableTemplates = templatesQuery.data || [];
  const selectedTemplate = availableTemplates.find(t => t.id === selectedTemplateId);

  // Use pure function from business logic for template variable parsing
  const templateVariableInfo = useMemo(() => {
    const info = getTemplateVariableInfo(selectedTemplate);
    // Adapter: expose totalExtra for backward compatibility (lib uses totalCount)
    return {
      ...info,
      totalExtra: info.totalCount,
    };
  }, [selectedTemplate]);

  // For backward compatibility - count of extra variables
  const templateVariableCount = templateVariableInfo.totalCount;

  // AUTO-MAPPING & Reset
  // Strategy: Only auto-fill when Meta variable name EXACTLY matches our system fields
  // System fields: nome, telefone, email (Portuguese)
  useEffect(() => {
    const systemFields = ['nome', 'telefone', 'email'];

    // Build header array - one value per header variable
    const headerVars = templateVariableInfo.header
      .sort((a, b) => a.index - b.index)
      .map(v => {
        const lowerKey = v.key.toLowerCase();
        return systemFields.includes(lowerKey) ? `{{${lowerKey}}}` : '';
      });

    // Build body array - one value per body variable
    const bodyVars = templateVariableInfo.body
      .sort((a, b) => a.index - b.index)
      .map(v => {
        const lowerKey = v.key.toLowerCase();
        return systemFields.includes(lowerKey) ? `{{${lowerKey}}}` : '';
      });

    setTemplateVariables({ header: headerVars, body: bodyVars });
  }, [templateVariableInfo]);

  // 🔴 LIVE VALIDATION - Check limits in real-time as user selects contacts
  const liveValidation = useMemo(() => {
    if (recipientCount === 0) return null;
    return validate(recipientCount);
  }, [recipientCount, validate]);

  const isOverLimit = liveValidation ? !liveValidation.canSend : false;
  // Use the limit from validation (respects DEBUG mode) not from API limits
  const currentLimit = liveValidation?.currentLimit || limits?.maxUniqueUsersPerDay || 250;

  const toggleContact = useCallback((contactId: string) => {
    dispatchAudience({ type: 'TOGGLE_CONTACT', payload: contactId });
  }, []);

  const handleNext = () => {
    if (step === 1) {
      if (!name) { toast.error('Por favor insira o nome da campanha'); return; }
      if (!selectedTemplateId) { toast.error('Por favor selecione um template'); return; }
    }
    if (step === 2) {
      if (!recipientSource) { toast.error('Por favor selecione uma fonte de destinatários'); return; }
      if (recipientSource === 'specific' && selectedContactIds.length === 0) {
        toast.error('Por favor selecione pelo menos um contato');
        return;
      }
      if (recipientSource === 'test' && !testContact) {
        toast.error('Contato de teste não configurado. Configure em Ajustes.');
        return;
      }
    }
    dispatchWizard({ type: 'NEXT_STEP' });
  };

  const handleBack = () => dispatchWizard({ type: 'PREV_STEP' });

  const runPrecheck = async (options?: { silent?: boolean; force?: boolean }) => {
    if (!selectedTemplate?.name) {
      if (!options?.silent) toast.error('Selecione um template antes de validar');
      return;
    }

    // Em modo teste, pode existir um pequeno delay até termos o contactId resolvido.
    // Evita UX confusa de "Selecione pelo menos um contato".
    if (recipientSource === 'test' && testContact && !resolvedTestContactId) {
      if (!options?.silent) toast.info('Preparando contato de teste…');
      return;
    }

    if (!contactsForSending || contactsForSending.length === 0) {
      if (!options?.silent) toast.error('Selecione pelo menos um contato');
      return;
    }

    setIsPrechecking(true);
    try {
      const result = await campaignService.precheck({
        templateName: selectedTemplate.name,
        contacts: contactsForSending,
        templateVariables:
          (templateVariables.header.length > 0 || templateVariables.body.length > 0 || (templateVariables.buttons && Object.keys(templateVariables.buttons).length > 0) || templateVariables.headerLocation?.latitude)
            ? templateVariables
            : undefined,
      });

      setPrecheckResult(result);

      const skipped = result?.totals?.skipped ?? 0;
      const valid = result?.totals?.valid ?? 0;
      if (!options?.silent) {
        if (skipped > 0) {
          toast.warning(`Pré-check: ${valid} válidos, ${skipped} serão ignorados (ver detalhes)`);
        } else {
          toast.success(`Pré-check OK: ${valid} destinatários válidos`);
        }
      }

      return result;
    } catch (e: any) {
      if (!options?.silent) toast.error(e?.message || 'Falha ao validar destinatários');
      return null;
    } finally {
      setIsPrechecking(false);
    }
  };

  const handlePrecheck = async (): Promise<void> => {
    await runPrecheck({ silent: false, force: true });
  };

  // Auto pré-check no Step 3 (debounce). Mantém UX: o usuário "bate o olho" e já vê o que está faltando.
  const autoPrecheckKey = useMemo(() => {
    if (!selectedTemplate?.name) return '';
    if (!contactsForSending || contactsForSending.length === 0) return '';
    // Evita chaves gigantes: usamos apenas contagem + variáveis.
    const varsHash = JSON.stringify(templateVariables);
    const contactsVersion = contactsQuery.dataUpdatedAt || 0;
    const testContactVersion = testContactQuery.dataUpdatedAt || 0;
    return `${selectedTemplate.name}|${contactsForSending.length}|${varsHash}|c${contactsVersion}|t${testContactVersion}`;
  }, [
    selectedTemplate?.name,
    contactsForSending.length,
    templateVariables,
    contactsQuery.dataUpdatedAt,
    testContactQuery.dataUpdatedAt,
  ]);

  useEffect(() => {
    if (step !== 3) return;
    if (!autoPrecheckKey) return;
    if (isPrechecking) return;
    if (createCampaignMutation.isPending) return;

    const t = setTimeout(() => {
      if (lastAutoPrecheckKeyRef.current === autoPrecheckKey) return;
      lastAutoPrecheckKeyRef.current = autoPrecheckKey;
      runPrecheck({ silent: true });
    }, 650);

    return () => clearTimeout(t);
  }, [step, autoPrecheckKey, isPrechecking, createCampaignMutation.isPending]);

  // INTELLIGENT VALIDATION - Prevents users from sending campaigns that exceed limits
  const handleSend = async (scheduleTime?: string) => {
    if (recipientSource === 'test' && testContact && !resolvedTestContactId) {
      toast.info('Preparando contato de teste…');
      return;
    }

    // Validate that all required template variables are filled
    if (templateVariableCount > 0) {
      // Check if we have enough keys filled? 
      // Actually we should check against templateVariableInfo requirements.
      // For now, simpler check: do we have at least `templateVariableCount` keys?
      // Or better: are any values empty?
      // Since we initialize empty, we rely on user filling them.

      const isFilled = (v: unknown) => {
        if (typeof v !== 'string') return false;
        return v.trim().length > 0;
      };

      const filledCount =
        [...templateVariables.header, ...templateVariables.body].filter(isFilled).length +
        Object.values(templateVariables.buttons || {}).filter(isFilled).length;
      if (filledCount < templateVariableCount) {
        toast.error(`Preencha todas as variáveis do template (${templateVariableCount - filledCount} pendentes)`);
        return;
      }
    }

    // Dry-run pré-check antes de criar/disparar (UX). Backend continua blindado.
    // Regra: se NENHUM válido, não cria a campanha.
    const result = await runPrecheck();
    if (result?.totals && result.totals.valid === 0) {
      toast.error('Nenhum destinatário válido para envio. Corrija os contatos ignorados e valide novamente.');
      return;
    }

    // Validate campaign against account limits
    const validation = validate(recipientCount);
    setValidationResult(validation);

    // If campaign is blocked, show modal with explanation
    if (!validation.canSend) {
      setShowBlockModal(true);
      return;
    }

    // Show warnings if any (but allow to proceed)
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(warning => {
        toast.warning(warning);
      });
    }

    // Proceed with campaign creation
    createCampaignMutation.mutate({
      name: recipientSource === 'test' ? `[TESTE] ${name}` : name,
      templateName: selectedTemplate?.name || 'unknown_template',
      recipients: recipientCount,
      selectedContacts: contactsForSending,
      selectedContactIds: recipientSource === 'test' ? [] : selectedContactIds, // Save for resume functionality
      scheduledAt: scheduleTime || scheduledAt || undefined, // Use provided time or state
      templateVariables: (templateVariables.header.length > 0 || templateVariables.body.length > 0 || templateVariables.headerLocation?.latitude) ? templateVariables : undefined,
    });
  };

  // Schedule campaign for later
  const handleSchedule = (scheduleTime: string) => {
    setScheduledAt(scheduleTime);
    handleSend(scheduleTime);
  };

  // Close the block modal
  const closeBlockModal = () => {
    setShowBlockModal(false);
    setValidationResult(null);
  };

  return {
    step,
    setStep,
    name,
    setName,
    selectedTemplateId,
    setSelectedTemplateId,
    recipientSource,
    setRecipientSource,
    totalContacts,
    recipientCount,
    allContacts,
    filteredContacts,
    contactSearchTerm,
    setContactSearchTerm,
    selectedContacts,
    selectedContactIds,
    toggleContact,

    // Jobs/Ive audience
    audiencePreset,
    audienceCriteria,
    topTag,
    applyAudienceCriteria,
    selectAudiencePreset,
    audienceStats,
    availableTemplates,
    selectedTemplate,
    handleNext,
    handleBack,
    handlePrecheck,
    handleSend,
    isCreating: createCampaignMutation.isPending,
    // Pré-check (dry-run)
    precheckResult,
    isPrechecking,

    // Test Contact
    testContact,
    isEnsuringTestContact,

    // Template Variables (for {{2}}, {{3}}, etc.)
    templateVariables,
    setTemplateVariables,
    templateVariableCount,
    templateVariableInfo, // Detailed info about each variable location

    // Account Limits & Validation state
    accountLimits: limits,
    isBlockModalOpen: showBlockModal,
    setIsBlockModalOpen: setShowBlockModal,
    blockReason: validationResult,
    tierName,

    // Live validation (real-time as user selects)
    liveValidation,
    isOverLimit,
    currentLimit,

    // Scheduling
    scheduledAt,
    setScheduledAt,
    isScheduling,
    setIsScheduling,
    handleSchedule,
  };
};
