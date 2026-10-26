import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusChip } from "@/components/foundation/StatusChip";
import { EmptyState } from "@/components/foundation/EmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ds/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ds/dropdown-menu";
import {
  Plus, AlertTriangle, Clock, MoreHorizontal, Trash2, Calendar,
  ChevronDown, ChevronRight, Users, User,
  AlertCircle, ArrowUp, ArrowDown, Minus, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Activity = any;
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const priorityIndicators: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  urgent: { icon: AlertCircle, label: "Urgente", color: "text-destructive" },
  high:   { icon: ArrowUp, label: "Alta", color: "text-warning" },
  medium: { icon: Minus, label: "Média", color: "text-primary" },
  low:    { icon: ArrowDown, label: "Baixa", color: "text-muted-foreground" },
};

function getDateSection(dueDate: string | null): string {
  if (!dueDate) return "no_date";
  const now = new Date();
  const due = new Date(dueDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
  
  if (due < today) return "overdue";
  if (due < tomorrow) return "today";
  if (due < new Date(tomorrow.getTime() + 86400000)) return "tomorrow";
  if (due <= endOfWeek) return "this_week";
  return "later";
}

const sectionLabels: Record<string, string> = {
  overdue: "Atrasadas",
  today: "Hoje",
  tomorrow: "Amanhã",
  this_week: "Esta semana",
  later: "Mais tarde",
  no_date: "Sem data",
};
const sectionOrder = ["overdue", "today", "tomorrow", "this_week", "later", "no_date"];

interface TaskPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskPanel({ open, onOpenChange }: TaskPanelProps) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<Activity[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [quickTitle, setQuickTitle] = useState("");
  const [filter, setFilter] = useState<"mine" | "team">("mine");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const fetchTasks = useCallback(async () => {
    if (!orgId) return;
    let q = (supabase as any)
      .from("activities")
      .select("*")
      .eq("org_id", orgId)
      .eq("type", "task")
      .is("completed_at", null)
      .order("due_date", { ascending: true });
    if (filter === "mine" && user) {
      q = q.eq("created_by", user.id);
    }
    const { data } = await q;
    setTasks(data || []);
  }, [orgId, user, filter]);

  const fetchMembers = useCallback(async () => {
    if (!orgId) return;
    const { data } = await (supabase as any).from("profiles").select("*").eq("org_id", orgId);
    setMembers(data || []);
  }, [orgId]);

  useEffect(() => {
    if (open) { fetchTasks(); fetchMembers(); }
  }, [open, fetchTasks, fetchMembers]);

  const toggleComplete = async (id: string) => {
    await (supabase as any).from("activities").update({ completed_at: new Date().toISOString() }).eq("id", id);
    fetchTasks();
  };

  const deleteTask = async (id: string) => {
    await (supabase as any).from("activities").delete().eq("id", id);
    fetchTasks();
    toast({ title: "Tarefa excluída" });
  };

  const quickCreate = async () => {
    if (!orgId || !quickTitle.trim()) return;
    await (supabase as any).from("activities").insert({
      org_id: orgId,
      type: "task" as const,
      title: quickTitle.trim(),
      created_by: user?.id,
      due_date: new Date().toISOString(),
    });
    setQuickTitle("");
    fetchTasks();
    toast({ title: "Tarefa criada" });
  };

  const handleQuickKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      quickCreate();
    }
  };

  const sections = useMemo(() => {
    const map = new Map<string, Activity[]>();
    sectionOrder.forEach((s) => map.set(s, []));
    tasks.forEach((t) => {
      const section = getDateSection(t.due_date);
      map.get(section)?.push(t);
    });
    return map;
  }, [tasks]);

  const toggleSection = (s: string) => {
    const next = new Set(collapsedSections);
    next.has(s) ? next.delete(s) : next.add(s);
    setCollapsedSections(next);
  };

  const getMemberName = (id: string | null) => {
    if (!id) return null;
    const m = members.find((m) => m.id === id);
    return m?.name || m?.email || null;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:max-w-[400px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Tarefas
          </SheetTitle>
          <SheetDescription>
            {tasks.length} tarefas pendentes
          </SheetDescription>
          {/* Filter */}
          <div className="flex gap-1 mt-2">
            <button
              onClick={() => setFilter("mine")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === "mine" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <User className="h-3 w-3" />Minhas
            </button>
            <button
              onClick={() => setFilter("team")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === "team" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Users className="h-3 w-3" />Equipe
            </button>
          </div>
        </SheetHeader>

        {/* Quick create */}
        <div className="p-3 border-b border-border">
          <div className="flex gap-2">
            <Input
              placeholder="Nova tarefa... (⌘+Enter)"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={handleQuickKeyDown}
              className="h-8 text-sm"
            />
            <Button size="sm" className="h-8 px-2" onClick={quickCreate} disabled={!quickTitle.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Task sections */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {sectionOrder.map((sectionKey) => {
              const sectionTasks = sections.get(sectionKey) || [];
              if (sectionTasks.length === 0) return null;
              const isCollapsed = collapsedSections.has(sectionKey);
              const isOverdue = sectionKey === "overdue";
              return (
                <div key={sectionKey} className="mb-3">
                  <button
                    onClick={() => toggleSection(sectionKey)}
                    className={`flex items-center gap-2 px-2 py-1.5 w-full text-left text-xs font-semibold ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {isOverdue && <AlertTriangle className="h-3 w-3" />}
                    {sectionLabels[sectionKey]}
                    <StatusChip tone={isOverdue ? "danger" : "neutral"} dot={false} className="ml-auto text-xs">
                      {sectionTasks.length}
                    </StatusChip>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-1">
                      {sectionTasks.map((t) => (
                        <div
                          key={t.id}
                          className={`flex items-start gap-2 rounded-md px-2 py-2 hover:bg-secondary/60 transition-colors group ${isOverdue ? "bg-destructive/5" : ""}`}
                        >
                          <Checkbox
                            checked={false}
                            onCheckedChange={() => toggleComplete(t.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm leading-tight">{t.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {t.due_date && (
                                <span className={`text-xs flex items-center gap-0.5 ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                                  <Clock className="h-2.5 w-2.5" />
                                  {new Date(t.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                                </span>
                              )}
                              {filter === "team" && t.created_by && (
                                <span className="text-xs text-muted-foreground">
                                  {getMemberName(t.created_by)}
                                </span>
                              )}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:bg-secondary/60 transition-all">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => deleteTask(t.id)} className="text-destructive">
                                <Trash2 className="mr-2 h-3.5 w-3.5" />Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {tasks.length === 0 && (
              <EmptyState
                icon={CheckCircle2}
                title="Nenhuma tarefa pendente"
                description="Tudo em dia por aqui."
                className="m-1 py-10"
              />
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
