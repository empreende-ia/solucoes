import { useEffect, useState } from "react";
import { Button } from "@/components/ds/button";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader, PanelBody } from "@/components/foundation/Panel";
import { StatStrip } from "@/components/foundation/StatStrip";
import { ConfirmDialog } from "@/components/foundation/ConfirmDialog";
import { Sparkles, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { countDemoData, generateDemoData, removeDemoData } from "@/lib/demoData";

interface Props {
  orgId: string | null;
  userId: string | undefined;
}

export function DemoDataSection({ orgId, userId }: Props) {
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof countDemoData>> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const refresh = async () => {
    if (!orgId) return;
    try {
      setCounts(await countDemoData(orgId));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const total = counts
    ? counts.patients + counts.activities + counts.payments + counts.medical_records +
      counts.professionals + counts.health_goals + counts.contacts + counts.companies +
      counts.deals + counts.pipelines + counts.tags
    : 0;

  const handleGenerate = async () => {
    if (!orgId || !userId) return;
    setGenerating(true);
    try {
      const res = await generateDemoData(orgId, userId);
      toast.success("Dados de demonstração criados", {
        description: `${res.patients} pacientes, ${res.appointments} consultas, ${res.payments} pagamentos, ${res.tasks} tarefas.`,
      });
      await refresh();
    } catch (e: any) {
      toast.error("Erro ao gerar dados", { description: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleRemove = async () => {
    if (!orgId) return;
    setRemoving(true);
    try {
      await removeDemoData(orgId);
      toast.success("Dados de demonstração removidos");
      await refresh();
    } catch (e: any) {
      toast.error("Erro ao remover", { description: e.message });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Gerar dados de demonstração
            </span>
          }
          description={
            <>
              Popule o CRM com um cenário realista de clínica para testar agenda, prontuários, financeiro e relatórios.
              Todos os registros são marcados com <Badge variant="outline" className="mx-1">[DEMO]</Badge> e podem ser removidos a qualquer momento.
            </>
          }
        />
        <PanelBody className="space-y-4">
          <StatStrip
            stats={[
              { label: "Médicos", value: 4 },
              { label: "Pacientes", value: 10 },
              { label: "Consultas", value: 24 },
              { label: "Prontuários", value: 10 },
              { label: "Pagamentos", value: 13 },
              { label: "Metas", value: 4 },
              { label: "CRM (deals)", value: 6 },
              { label: "Tarefas", value: 5 },
            ]}
          />
          <Button onClick={handleGenerate} disabled={generating || !orgId || !userId}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Gerar dados fictícios
          </Button>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Limpar dados de demonstração
            </span>
          }
          description="Remove apenas registros marcados com [DEMO]. Seus dados reais não serão afetados."
        />
        <PanelBody className="space-y-4">
          {counts && (
            <div className="text-sm text-muted-foreground">
              Atualmente: <strong className="text-foreground">{total}</strong> registros de demonstração na sua conta
              {total > 0 && ` (${counts.professionals} médicos, ${counts.patients} pacientes, ${counts.activities} atividades, ${counts.medical_records} prontuários, ${counts.payments} pagamentos, ${counts.health_goals} metas, ${counts.contacts} contatos, ${counts.companies} empresas, ${counts.deals} negócios, ${counts.tags} tags)`}.
            </div>
          )}
          <Button variant="destructive" disabled={removing || total === 0} onClick={() => setConfirmRemoveOpen(true)}>
            {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Remover dados fictícios
          </Button>
          <ConfirmDialog
            open={confirmRemoveOpen}
            onOpenChange={setConfirmRemoveOpen}
            title="Remover todos os dados de demonstração?"
            description={`Esta ação remove permanentemente todos os ${total} registros marcados com [DEMO]. Seus dados reais permanecerão intactos. Esta ação não pode ser desfeita.`}
            confirmLabel="Remover"
            loading={removing}
            onConfirm={async () => {
              await handleRemove();
              setConfirmRemoveOpen(false);
            }}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
