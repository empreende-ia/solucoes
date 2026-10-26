import React, { useEffect, useRef, useState } from 'react';
import { Shield, Bot, Plug, Share2, Loader2, Save, RotateCcw, Lock, CalendarDays, Layers } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import AgentWorkspaceSettings from './settings/AgentWorkspaceSettings';
import ApiSettings, { ApiSettingsRef } from './settings/ApiSettings';
import ChannelSettings from './settings/ChannelSettings';
import WhatsAppTemplatesSettings from './settings/WhatsAppTemplatesSettings';
import CalendarSettings from './settings/CalendarSettings';
import DemoDataSettings from './settings/DemoDataSettings';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { Button } from './Button';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { useOutletContext, useSearchParams } from 'react-router-dom';


interface OutletContext {
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
}

const Settings: React.FC = () => {
  const { companyName, isAdmin } = useCompanySettings();
  const displayCompanyName = companyName || 'Minha empresa';
  const apiRef = useRef<ApiSettingsRef>(null);
  const { resetWizard } = useOnboardingStatus();
  const { setShowOnboarding } = useOutletContext<OutletContext>();
  // A URL é a fonte única da aba (/settings?tab=apis): deep-links da página
  // Ajuda e do aviso de chave funcionam sempre, e F5 preserva a aba visível
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = tabParam && ['agent', 'channels', 'calendar', 'apis', 'demo'].includes(tabParam) ? tabParam : 'agent';

  // ?setup=1 só faz sentido na aba Agente; em outra aba ele ficaria armado na
  // URL e detonaria o assistente numa visita futura, sem relação com a intenção.
  useEffect(() => {
    if (activeTab === 'agent' || searchParams.get('setup') !== '1') return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('setup');
      return next;
    }, { replace: true });
  }, [activeTab, searchParams, setSearchParams]);
  const setActiveTab = (tab: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === 'agent') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      return next;
    }, { replace: true });
  };

  // Cada aba monta na primeira visita e permanece viva depois: trocar de aba não
  // descarta edições, mas entrar em Configurações não dispara os fetches das quatro.
  const [visitedTabs, setVisitedTabs] = useState<string[]>([activeTab]);
  useEffect(() => {
    setVisitedTabs((current) => current.includes(activeTab) ? current : [...current, activeTab]);
  }, [activeTab]);

  const handleReopenOnboarding = () => {
    resetWizard();
    setShowOnboarding(true);
  };

  const handleSave = async () => {
    if (activeTab === 'apis') {
      await apiRef.current?.save();
    }
  };

  const handleCancel = () => {
    if (activeTab === 'apis') {
      apiRef.current?.cancel();
    }
  };

  const isSaving = apiRef.current?.isSaving;
  
  return (
    <div className="operation-page custom-scrollbar">
      <div className="operation-container operation-container--settings">
      <header className="operation-header">
        <div>
          <p className="eia-eyebrow">Central de controle</p>
          <h1>Configurações.</h1>
          <p>
            Central de controle da sua instância {displayCompanyName}.
            {!isAdmin && (
              <span className="ml-2 text-muted-foreground">(somente leitura)</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReopenOnboarding}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Refazer onboarding
            </Button>
          )}
          <span className="eia-meta-chip settings-access">
            {isAdmin ? (
              <>
                <Shield className="w-3 h-3 mr-1" /> Admin
              </>
            ) : (
              <>
                <Lock className="w-3 h-3 mr-1" /> Somente leitura
              </>
            )}
          </span>
        </div>
      </header>

      <Tabs value={activeTab} className="settings-tabs w-full" onValueChange={setActiveTab}>
        <div className="settings-toolbar">
          <TabsList>
            <TabsTrigger value="agent" className="gap-2">
              <Bot className="w-4 h-4" />
              Agente
            </TabsTrigger>
            <TabsTrigger value="channels" className="gap-2">
              <Share2 className="w-4 h-4" />
              Canais
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <CalendarDays className="w-4 h-4" />
              Agenda
            </TabsTrigger>
            <TabsTrigger value="apis" className="gap-2">
              <Plug className="w-4 h-4" />
              APIs
            </TabsTrigger>
            <TabsTrigger value="demo" className="gap-2">
              <Layers className="w-4 h-4" />
              Demonstração
            </TabsTrigger>
          </TabsList>


          {activeTab === 'apis' && isAdmin && (
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={isSaving}
                className="gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar alterações
                  </>
                )}
              </Button>
            </div>
          )}
          
          {activeTab === 'apis' && !isAdmin && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="w-4 h-4" />
              Apenas administradores podem editar
            </div>
          )}
        </div>

        {/* forceMount: trocar de aba não pode descartar edições não salvas
            (ex.: escolher provedor no Comportamento e ir salvar a chave em APIs) */}
        <TabsContent value="agent" forceMount className="data-[state=inactive]:hidden">
          {visitedTabs.includes('agent') && <AgentWorkspaceSettings />}
        </TabsContent>

        <TabsContent value="channels" forceMount className="data-[state=inactive]:hidden">
          {visitedTabs.includes('channels') && (
            <div className="space-y-8">
              <ChannelSettings />
              <WhatsAppTemplatesSettings />
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar" forceMount className="data-[state=inactive]:hidden">
          {visitedTabs.includes('calendar') && <CalendarSettings />}
        </TabsContent>

        <TabsContent value="apis" forceMount className="data-[state=inactive]:hidden">
          {visitedTabs.includes('apis') && <ApiSettings ref={apiRef} />}
        </TabsContent>

        <TabsContent value="demo" forceMount className="data-[state=inactive]:hidden">
          {visitedTabs.includes('demo') && <DemoDataSettings isAdmin={isAdmin} />}
        </TabsContent>
      </Tabs>

      </div>
    </div>
  );
};

export default Settings;
