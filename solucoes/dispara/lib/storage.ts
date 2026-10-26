import { Campaign, Contact, CampaignStatus, ContactStatus, AppSettings, Message, MessageStatus, Template, TemplateStatus } from '../types';

const KEYS = {
  CAMPAIGNS: 'dispara_campaigns',
  CONTACTS: 'dispara_contacts',
  SETTINGS: 'dispara_settings',
  TEMPLATES: 'dispara_templates',
};

// Mapa de migração: valores antigos em inglês → novos em português
const STATUS_MIGRATION: Record<string, CampaignStatus> = {
  'Draft': CampaignStatus.DRAFT,
  'Scheduled': CampaignStatus.SCHEDULED,
  'Sending': CampaignStatus.SENDING,
  'Completed': CampaignStatus.COMPLETED,
  'Paused': CampaignStatus.PAUSED,
  'Failed': CampaignStatus.FAILED,
  'Cancelled': CampaignStatus.CANCELLED,
};

// Normaliza status de campanha (migra valores antigos em inglês)
const normalizeCampaignStatus = (status: string): CampaignStatus => {
  return STATUS_MIGRATION[status] || (status as CampaignStatus);
};

// Helper to get data from localStorage with a default fallback
const get = <T>(key: string, defaultVal: T): T => {
  if (typeof window === 'undefined') return defaultVal;
  const stored = localStorage.getItem(key);
  if (!stored) return defaultVal;
  try {
    return JSON.parse(stored);
  } catch {
    return defaultVal;
  }
};

// Helper to save data to localStorage
const set = (key: string, value: any) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
};

// Initialize storage - just ensures localStorage keys exist (no mock data)
export const initStorage = () => {
  if (typeof window === 'undefined') return;
  
  // Initialize empty arrays if not present
  if (!localStorage.getItem(KEYS.CAMPAIGNS)) {
    set(KEYS.CAMPAIGNS, []);
  }
  if (!localStorage.getItem(KEYS.CONTACTS)) {
    set(KEYS.CONTACTS, []);
  }
  if (!localStorage.getItem(KEYS.TEMPLATES)) {
    set(KEYS.TEMPLATES, []);
  }
  // Initialize default settings if not present
  if (!localStorage.getItem(KEYS.SETTINGS)) {
    set(KEYS.SETTINGS, {
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      isConnected: false
    });
  }
};

// Clear all data and reset to empty state (useful for development)
export const clearAllData = () => {
  localStorage.removeItem(KEYS.CAMPAIGNS);
  localStorage.removeItem(KEYS.CONTACTS);
  localStorage.removeItem(KEYS.TEMPLATES);
  localStorage.removeItem(KEYS.SETTINGS);
  initStorage();
};

// Generate a simple ID
const generateId = () => Math.random().toString(36).substr(2, 9);

export const storage = {
  campaigns: {
    getAll: (): Campaign[] => {
      const campaigns = get<Campaign[]>(KEYS.CAMPAIGNS, []);
      // Normaliza status antigos em inglês para português
      return campaigns.map(c => ({
        ...c,
        status: normalizeCampaignStatus(c.status)
      }));
    },

    getById: (id: string): Campaign | undefined => {
      const campaigns = get<Campaign[]>(KEYS.CAMPAIGNS, []);
      const campaign = campaigns.find(c => c.id === id);
      if (!campaign) return undefined;
      // Normaliza status antigo em inglês para português
      return { ...campaign, status: normalizeCampaignStatus(campaign.status) };
    },

    add: (campaign: Omit<Campaign, 'id' | 'createdAt' | 'status' | 'delivered' | 'read' | 'failed'> & { scheduledAt?: string; selectedContactIds?: string[]; pendingContacts?: { name: string; phone: string }[] }) => {
      const campaigns = get<Campaign[]>(KEYS.CAMPAIGNS, []);
      const isScheduled = !!campaign.scheduledAt;
      
      const newCampaign: Campaign = {
        ...campaign,
        id: generateId(),
        createdAt: new Date().toISOString(),
        status: isScheduled ? CampaignStatus.SCHEDULED : CampaignStatus.SENDING,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        startedAt: isScheduled ? undefined : new Date().toISOString(),
        selectedContactIds: campaign.selectedContactIds,
        pendingContacts: campaign.pendingContacts,
      };
      
      // Only auto-complete if not scheduled (immediate send)
      if (!isScheduled) {
        setTimeout(() => {
          const current = get<Campaign[]>(KEYS.CAMPAIGNS, []);
          const updated = current.map(c =>
            c.id === newCampaign.id && c.status === CampaignStatus.SENDING
              ? { ...c, status: CampaignStatus.COMPLETED, completedAt: new Date().toISOString(), delivered: c.recipients }
              : c
          );
          set(KEYS.CAMPAIGNS, updated);
        }, 3000);
      }

      set(KEYS.CAMPAIGNS, [newCampaign, ...campaigns]);
      return newCampaign;
    },

    delete: (id: string) => {
      const campaigns = get<Campaign[]>(KEYS.CAMPAIGNS, []);
      set(KEYS.CAMPAIGNS, campaigns.filter(c => c.id !== id));
    },

    duplicate: (id: string) => {
      const campaigns = get<Campaign[]>(KEYS.CAMPAIGNS, []);
      const original = campaigns.find(c => c.id === id);
      if (original) {
        // Garantir que pendingContacts seja copiado
        // Se não existir, criar a partir de selectedContactIds ou deixar vazio
        let pendingContacts = original.pendingContacts || [];
        
        // Se não tem pendingContacts, tentar usar selectedContactIds + contacts do localStorage
        if (pendingContacts.length === 0 && original.selectedContactIds && original.selectedContactIds.length > 0) {
          const allContacts = get<Contact[]>(KEYS.CONTACTS, []);
          pendingContacts = allContacts
            .filter(c => original.selectedContactIds!.includes(c.id))
            .map(c => ({ name: c.name || '', phone: c.phone }));
        }
        
        const copy: Campaign = {
          ...original,
          id: generateId(),
          name: `${original.name} (Cópia)`,
          status: CampaignStatus.DRAFT,
          createdAt: new Date().toISOString(),
          sent: 0,
          delivered: 0,
          read: 0,
          failed: 0,
          scheduledAt: undefined,
          startedAt: undefined,
          completedAt: undefined,
          pausedAt: undefined,
          pendingContacts, // Garantir que os contatos sejam copiados
        };
        set(KEYS.CAMPAIGNS, [copy, ...campaigns]);
      }
    },

    // Pause a running campaign
    pause: (id: string) => {
      const campaigns = get<Campaign[]>(KEYS.CAMPAIGNS, []);
      const updated = campaigns.map(c => {
        const normalizedStatus = normalizeCampaignStatus(c.status);
        return c.id === id && (normalizedStatus === CampaignStatus.SENDING || normalizedStatus === CampaignStatus.SCHEDULED)
          ? { ...c, status: CampaignStatus.PAUSED, pausedAt: new Date().toISOString() }
          : c;
      });
      set(KEYS.CAMPAIGNS, updated);
      const result = updated.find(c => c.id === id);
      return result ? { ...result, status: normalizeCampaignStatus(result.status) } : undefined;
    },

    // Resume a paused campaign
    resume: (id: string) => {
      const campaigns = get<Campaign[]>(KEYS.CAMPAIGNS, []);
      const updated = campaigns.map(c => {
        const normalizedStatus = normalizeCampaignStatus(c.status);
        return c.id === id && normalizedStatus === CampaignStatus.PAUSED
          ? { ...c, status: CampaignStatus.SENDING, pausedAt: undefined, startedAt: c.startedAt || new Date().toISOString() }
          : c;
      });
      set(KEYS.CAMPAIGNS, updated);
      const result = updated.find(c => c.id === id);
      return result ? { ...result, status: normalizeCampaignStatus(result.status) } : undefined;
    },

    // Start a scheduled campaign immediately
    start: (id: string) => {
      const campaigns = get<Campaign[]>(KEYS.CAMPAIGNS, []);
      const updated = campaigns.map(c => {
        const normalizedStatus = normalizeCampaignStatus(c.status);
        return c.id === id && (normalizedStatus === CampaignStatus.SCHEDULED || normalizedStatus === CampaignStatus.DRAFT)
          ? { ...c, status: CampaignStatus.SENDING, startedAt: new Date().toISOString(), scheduledAt: undefined }
          : c;
      });
      set(KEYS.CAMPAIGNS, updated);
      const result = updated.find(c => c.id === id);
      return result ? { ...result, status: normalizeCampaignStatus(result.status) } : undefined;
    },

    // Update campaign status and stats (called by polling or webhooks)
    updateStatus: (id: string, updates: Partial<Pick<Campaign, 'status' | 'sent' | 'delivered' | 'read' | 'failed' | 'completedAt'>>) => {
      const campaigns = get<Campaign[]>(KEYS.CAMPAIGNS, []);
      const updated = campaigns.map(c =>
        c.id === id ? { ...c, ...updates } : c
      );
      set(KEYS.CAMPAIGNS, updated);
      return updated.find(c => c.id === id);
    },

    // DEPRECATED: Mensagens agora vêm do backend (campaign_contacts) via campaignService.getMessages()
    // Esta função existe apenas por compatibilidade e retorna array vazio
    getMessages: (_campaignId: string): Message[] => {
      // Não gerar mais dados mock - mensagens reais vêm do backend
      return [];
    }
  },

  contacts: {
    getAll: (): Contact[] => get<Contact[]>(KEYS.CONTACTS, []),

    getById: (id: string): Contact | undefined => {
      const contacts = get<Contact[]>(KEYS.CONTACTS, []);
      return contacts.find(c => c.id === id);
    },

    add: (contact: Omit<Contact, 'id' | 'lastActive'>) => {
      const contacts = get<Contact[]>(KEYS.CONTACTS, []);
      const newContact: Contact = {
        ...contact,
        id: generateId(),
        lastActive: 'Agora mesmo',
      };
      set(KEYS.CONTACTS, [newContact, ...contacts]);
      return newContact;
    },

    update: (id: string, data: Partial<Omit<Contact, 'id'>>) => {
      const contacts = get<Contact[]>(KEYS.CONTACTS, []);
      const updated = contacts.map(c => 
        c.id === id ? { ...c, ...data, lastActive: 'Agora mesmo' } : c
      );
      set(KEYS.CONTACTS, updated);
      return updated.find(c => c.id === id);
    },

    import: (newContacts: Omit<Contact, 'id' | 'lastActive'>[]) => {
      const currentContacts = get<Contact[]>(KEYS.CONTACTS, []);
      const imported = newContacts.map(c => ({
        ...c,
        id: generateId(),
        lastActive: 'Nunca'
      }));
      set(KEYS.CONTACTS, [...imported, ...currentContacts]);
      return imported.length;
    },

    delete: (id: string) => {
      const contacts = get<Contact[]>(KEYS.CONTACTS, []);
      set(KEYS.CONTACTS, contacts.filter(c => c.id !== id));
    },

    deleteMany: (ids: string[]) => {
      const contacts = get<Contact[]>(KEYS.CONTACTS, []);
      const idSet = new Set(ids);
      set(KEYS.CONTACTS, contacts.filter(c => !idSet.has(c.id)));
      return ids.length;
    },

    getTags: (): string[] => {
      const contacts = get<Contact[]>(KEYS.CONTACTS, []);
      const tagSet = new Set<string>();
      contacts.forEach(c => c.tags.forEach(t => tagSet.add(t)));
      return Array.from(tagSet).toSorted();
    },

    getStats: () => {
      const contacts = get<Contact[]>(KEYS.CONTACTS, []);
      return {
        total: contacts.length,
        optIn: contacts.filter(c => c.status === ContactStatus.OPT_IN).length,
        optOut: contacts.filter(c => c.status === ContactStatus.OPT_OUT).length
      }
    }
  },

  templates: {
    getAll: (): Template[] => get<Template[]>(KEYS.TEMPLATES, []),

    add: (template: Omit<Template, 'id' | 'status' | 'lastUpdated' | 'preview'>) => {
      const templates = get<Template[]>(KEYS.TEMPLATES, []);
      const newTemplate: Template = {
        ...template,
        id: generateId(),
        status: 'PENDING', // Created by AI/User is pending approval
        lastUpdated: new Date().toISOString().split('T')[0],
        preview: template.content.replace('{{1}}', 'Ana')
      };
      set(KEYS.TEMPLATES, [newTemplate, ...templates]);
      return newTemplate;
    },

    // Simulate syncing with Meta API
    sync: (): Promise<number> => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const current = get<Template[]>(KEYS.TEMPLATES, []);
          const newTemplate: Template = {
            id: `new_template_${Date.now()}`,
            name: `Promoção Sincronizada ${new Date().toLocaleTimeString()}`,
            category: 'MARKETING',
            language: 'pt_BR',
            status: 'APPROVED',
            content: 'Nova oferta imperdível chegou para você, {{1}}! Confira agora.',
            preview: 'Nova oferta imperdível chegou para você, Ana! Confira agora.',
            lastUpdated: new Date().toISOString().split('T')[0]
          };
          set(KEYS.TEMPLATES, [newTemplate, ...current]);
          resolve(1);
        }, 2000);
      });
    }
  },

  settings: {
    get: (): AppSettings => get<AppSettings>(KEYS.SETTINGS, {
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      isConnected: false
    }),
    save: (settings: AppSettings) => set(KEYS.SETTINGS, settings)
  },

  dashboard: {
    getStats: () => {
      const campaigns = get<Campaign[]>(KEYS.CAMPAIGNS, []);

      const sent24h = campaigns
        .filter(c => {
          const date = new Date(c.createdAt);
          const now = new Date();
          const diffTime = Math.abs(now.getTime() - date.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays <= 1;
        })
        .reduce((acc, curr) => acc + curr.delivered, 0);

      const totalSent = campaigns.reduce((acc, curr) => acc + curr.delivered, 0);
      const totalFailed = campaigns.reduce((acc, curr) => acc + (curr.recipients - curr.delivered), 0);

      const deliveryRate = totalSent > 0
        ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(1)
        : '100';

      const activeCampaigns = campaigns.filter(c => c.status === CampaignStatus.SENDING || c.status === CampaignStatus.SCHEDULED).length;

      const chartData = campaigns.slice(0, 7).map(c => ({
        name: c.name.substring(0, 3),
        sent: c.recipients,
        read: c.read
      })).reverse();

      return {
        sent24h: sent24h > 0 ? sent24h.toLocaleString() : '0',
        deliveryRate: `${deliveryRate}%`,
        activeCampaigns: activeCampaigns.toString(),
        failedMessages: totalFailed.toString(),
        chartData // Retorna vazio se não houver campanhas
      };
    }
  }
};

// Initialize only on client side
if (typeof window !== 'undefined') {
  initStorage();
}