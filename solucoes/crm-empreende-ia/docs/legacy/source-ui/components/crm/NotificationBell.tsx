import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ds/popover";
import {
  Bell, Phone, Mail, Calendar, FileText, CheckSquare, Clock, Check, Stethoscope,
} from "lucide-react";
type Activity = any;
type ActivityType = string;

const typeIcons: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  call: Phone, email: Mail, meeting: Calendar, note: FileText, task: CheckSquare, visit: Calendar, whatsapp: Mail, appointment: Stethoscope,
};
const typeLabels: Record<ActivityType, string> = {
  call: "Ligação", email: "Email", meeting: "Reunião", note: "Nota", task: "Tarefa", visit: "Visita", whatsapp: "WhatsApp", appointment: "Consulta",
};

export function NotificationBell() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const [pending, setPending] = useState<Activity[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchPending = useCallback(async () => {
    if (!orgId || !user) return;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const { data } = await (supabase as any)
      .from("activities")
      .select("*")
      .eq("org_id", orgId)
      .eq("created_by", user.id)
      .is("completed_at", null)
      .lte("due_date", today.toISOString())
      .order("due_date", { ascending: true })
      .limit(20);
    setPending(data || []);
  }, [orgId, user]);

  useEffect(() => { fetchPending(); }, [fetchPending]);
  // Refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchPending, 60000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  const markComplete = async (id: string) => {
    await supabase.from("activities").update({ completed_at: new Date().toISOString() }).eq("id", id);
    fetchPending();
  };

  const markAllRead = () => {
    setDismissed(new Set(pending.map((p) => p.id)));
  };

  const visibleCount = pending.filter((p) => !dismissed.has(p.id)).length;

  const isOverdue = (a: Activity) => a.due_date && new Date(a.due_date) < new Date();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Notificações"
          className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
        >
          <Bell className="h-4 w-4" />
          {visibleCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground">
              {visibleCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-semibold">Notificações</span>
          {pending.length > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Marcar tudo como lido
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {pending.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma pendência
            </div>
          ) : (
            pending.map((a) => {
              const Icon = typeIcons[a.type] ?? FileText;
              const overdue = isOverdue(a);
              const read = dismissed.has(a.id);
              return (
                <div key={a.id} className={`flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 transition-colors ${read ? "opacity-50" : "bg-muted/30"}`}>
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${overdue ? "bg-destructive/10" : "bg-primary/10"}`}>
                    <Icon className={`h-3.5 w-3.5 ${overdue ? "text-destructive" : "text-primary"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{a.title}</p>
                    <p className={`text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      <Clock className="inline mr-0.5 h-2.5 w-2.5" />
                      {a.due_date ? new Date(a.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Sem data"}
                      {overdue && " · Atrasada"}
                    </p>
                  </div>
                  <button
                    onClick={() => markComplete(a.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-success/10 hover:text-success transition-colors"
                    title="Marcar como concluído"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
