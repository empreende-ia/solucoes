import React, { useEffect, useState } from 'react';
import { Loader2, Lock, Play, Layers, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../Button';
import { Badge } from '../ui/badge';
import { demoDataService, type DemoDataStatus } from '@/services/demoData';
import { useDemoMode } from '@/hooks/useDemoMode';

interface DemoDataSettingsProps {
  isAdmin: boolean;
}

/**
 * Liga/desliga o cenário de demonstração da plataforma.
 *
 * Ligar semeia contatos, conversas, pipeline, agenda e equipe fictícios;
 * desligar apaga exatamente o que foi semeado (nada de dado real é tocado).
 */
const DemoDataSettings: React.FC<DemoDataSettingsProps> = ({ isAdmin }) => {
  const [status, setStatus] = useState<DemoDataStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<'enable' | 'disable' | null>(null);
  const { refresh: refreshDemoMode } = useDemoMode();

  const loadStatus = async () => {
    try {
      setStatus(await demoDataService.getStatus());
    } catch (error) {
      console.error('[DemoDataSettings]', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (action: 'enable' | 'disable') => {
    setWorking(action);
    try {
      if (action === 'enable') {
        await demoDataService.enable();
        toast.success('Dados de demonstração ativados.');
      } else {
        await demoDataService.disable();
        toast.success('Dados de demonstração removidos.');
      }
      await Promise.all([loadStatus(), refreshDemoMode()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir a operação.');
    } finally {
      setWorking(null);
    }
  };

  const enabled = status?.enabled === true;
  const counts = status?.counts;

  return (
    <div className="eia-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--eia-radius-sm)] border border-border bg-secondary text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <p className="eia-eyebrow">Apresentação</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Dados de demonstração</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Preenche dashboard, chat, pipeline, agenda e equipe com um cenário fictício e coerente
              para mostrar a plataforma a clientes. Ao desativar, todo o conteúdo fictício é apagado —
              nenhum dado real é alterado.
            </p>
          </div>
        </div>
        <Badge variant={enabled ? 'success' : 'muted'}>{enabled ? 'Ativos' : 'Desativados'}</Badge>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verificando estado atual...
        </div>
      ) : (
        <>
          {enabled && counts && (
            <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
              {[
                { label: 'Contatos', value: counts.contacts },
                { label: 'Conversas', value: counts.conversations },
                { label: 'Negócios', value: counts.deals },
                { label: 'Agendamentos', value: counts.appointments },
                { label: 'Equipe', value: counts.teamMembers },
              ].map((item) => (
                <div key={item.label} className="rounded-[var(--eia-radius-sm)] border border-border bg-secondary/40 p-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground">{item.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {isAdmin ? (
              <>
                <Button
                  variant="primary"
                  onClick={() => run('enable')}
                  disabled={working !== null}
                  className="gap-2"
                >
                  {working === 'enable' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {enabled ? 'Recriar cenário' : 'Ativar demonstração'}
                </Button>
                {enabled && (
                  <Button
                    variant="ghost"
                    onClick={() => run('disable')}
                    disabled={working !== null}
                    className="gap-2"
                  >
                    {working === 'disable' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Desativar e limpar
                  </Button>
                )}
              </>
            ) : (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                Apenas administradores podem ativar ou desativar a demonstração.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default DemoDataSettings;
