import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Calendar,
  ClipboardList,
  DollarSign,
  HelpCircle,
  Kanban,
  LayoutDashboard,
  LayoutTemplate,
  ListTodo,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Settings as SettingsIcon,
  Shield,
  Building2,
  Target,
  UserCog,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import Wordmark, { BrandGlyph } from "@/components/brand/Wordmark";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { HelpCenter } from "@/components/help/HelpCenter";
import { InitialsAvatar } from "@/components/foundation/InitialsAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ds/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Só ativa com pathname idêntico (evita /settings acender nas sub-rotas). */
  exact?: boolean;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Geral",
    items: [
      { title: "Hoje", url: "/dashboard", icon: LayoutDashboard },
      { title: "Contatos", url: "/contacts", icon: Users },
      { title: "Empresas", url: "/companies", icon: Building2 },
      { title: "Agenda", url: "/agenda", icon: Calendar },
    ],
  },
  {
    label: "Operacional",
    items: [
      { title: "Automações", url: "/automations", icon: Zap },
      { title: "Pipeline", url: "/pipeline", icon: Kanban },
      { title: "Financeiro", url: "/financeiro", icon: DollarSign },
      { title: "Atividades", url: "/activities", icon: Activity },
      { title: "Tarefas", url: "/tasks", icon: ListTodo },
      { title: "Templates", url: "/templates", icon: LayoutTemplate },
    ],
  },
  {
    label: "Resultados",
    items: [
      { title: "Relatórios", url: "/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Equipe", url: "/team", icon: UserCog },
      { title: "Configurações", url: "/settings", icon: SettingsIcon, exact: true },
      { title: "Integrações", url: "/settings/integrations", icon: Plug },
      { title: "Segurança", url: "/settings/security", icon: Shield },
    ],
  },
];

const RAIL_EXPANDED_KEY = "empreende-crm-rail-expanded";

const UserPopover: React.FC = () => {
  const { profile, signOut } = useAuth();
  const name = profile?.name || "Usuário";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Conta"
          className="rounded-lg ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <InitialsAvatar name={name} src={profile?.avatar_url} size="md" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-64 p-0">
        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
        </div>
        <div className="p-1.5">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Sair da conta
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Rail de navegação fixo do desktop: recolhido (w-16, ícones + tooltip) ou
 * expandido (w-60, ícone + label), persistido em localStorage. Substitui a
 * sidebar de template. No mobile a navegação fica no MobileBottomNav.
 */
export const AppRail: React.FC = () => {
  const location = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => { try { return localStorage.getItem(RAIL_EXPANDED_KEY) !== "0"; } catch { return true; } });

  const toggleExpanded = () => {
    setExpanded((prev) => {
      try { localStorage.setItem(RAIL_EXPANDED_KEY, prev ? "0" : "1"); } catch { /* optional preference */ }
      return !prev;
    });
  };

  const isActive = (item: NavItem) =>
    item.exact ? location.pathname === item.url : location.pathname.startsWith(item.url);

  const renderItem = (item: NavItem) => {
    const active = isActive(item);
    const link = (
      <Link
        to={item.url}
        aria-label={item.title}
        aria-current={active ? "page" : undefined}
        className={cn(
          "eia-nav-item flex h-10 items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          expanded ? "w-full gap-3 px-3" : "w-10 justify-center",
          active
            ? "bg-primary text-primary-foreground shadow-soft"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        )}
      >
        <item.icon className="h-5 w-5 shrink-0" />
        {expanded && <span className="truncate text-sm font-medium">{item.title}</span>}
      </Link>
    );
    if (expanded) return <React.Fragment key={item.url}>{link}</React.Fragment>;
    return (
      <Tooltip key={item.url}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.title}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={80}>
      <aside
        className={cn(
          "eia-rail hidden h-full shrink-0 flex-col py-5 transition-[width] duration-200 md:flex",
          expanded ? "w-64 px-3" : "w-16 items-center"
        )}
      >
        <div className={cn("flex items-center", expanded ? "gap-2.5 px-1" : "flex-col gap-2")}>
          <Link
            to="/dashboard"
            aria-label="Início"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {expanded ? <Wordmark variant="compact" /> : <BrandGlyph className="h-9 w-9" />}
          </Link>
          {expanded && <span className="flex-1" />}
          <button
            type="button"
            onClick={toggleExpanded}
            aria-label={expanded ? "Recolher menu" : "Expandir menu"}
            title={expanded ? "Recolher menu" : "Expandir menu"}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
              !expanded && "mt-1"
            )}
          >
            {expanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
        </div>

        <nav
          className={cn(
            "mt-5 flex flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden",
            !expanded && "items-center"
          )}
        >
          {NAV_GROUPS.map((group, gi) => (
            <React.Fragment key={group.label}>
              {gi > 0 &&
                (expanded ? (
                  <p className="mt-3 px-3 pb-1 text-xs font-semibold text-muted-foreground">{group.label}</p>
                ) : (
                  <div aria-hidden className="my-2 h-px w-8 shrink-0 bg-sidebar-border" />
                ))}
              {group.items.map(renderItem)}
            </React.Fragment>
          ))}
        </nav>

        <div className={cn("mt-4 flex gap-2", expanded ? "items-center justify-between px-1" : "flex-col items-center")}>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="Ajuda"
            title="Ajuda"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <ThemeToggle className="h-9 w-9 rounded-xl border-0 bg-transparent hover:bg-sidebar-accent" />
          <UserPopover />
        </div>

      </aside>

      <HelpCenter open={helpOpen} onOpenChange={setHelpOpen} />
    </TooltipProvider>
  );
};

export default AppRail;
