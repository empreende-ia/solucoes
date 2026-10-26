import { useState } from "react";
import { HelpCenter } from "@/components/help/HelpCenter";
import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, Users, Calendar, Activity, MoreHorizontal, SunMoon, LogOut, HelpCircle } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ds/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

const mainItems = [
  { title: "Hoje",  url: "/dashboard",  icon: LayoutDashboard },
  { title: "Contatos",  url: "/contacts",   icon: Users },
  { title: "Agenda",     url: "/agenda",     icon: Calendar },
  { title: "Atividades", url: "/activities", icon: Activity },
];

const moreItems = [
  { title: "Empresas", url: "/companies" },
  { title: "Pipeline", url: "/pipeline" },
  { title: "Integrações", url: "/settings/integrations" },
  { title: "Segurança", url: "/settings/security" },
  { title: "Financeiro",    url: "/financeiro" },
  { title: "Automações",    url: "/automations" },
  { title: "Tarefas",       url: "/tasks" },
  { title: "Templates",     url: "/templates" },
  { title: "Relatórios",    url: "/reports" },
  { title: "Equipe",        url: "/team" },
  { title: "Configurações", url: "/settings" },
];

export function MobileBottomNav() {
  const location = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { setTheme } = useTheme();

  const toggleTheme = () =>
    setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <>
    <nav className="eia-bottom-nav fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-border bg-background/95 backdrop-blur-sm md:hidden" role="navigation" aria-label="Navegação principal mobile">
      {mainItems.map((item) => (
        <NavLink
          key={item.url}
          to={item.url}
          end={item.url === "/dashboard"}
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-muted-foreground transition-colors ${
            isActive(item.url) ? "text-primary" : ""
          }`}
          activeClassName="text-primary"
          aria-label={item.title}
        >
          <item.icon className="h-5 w-5" />
          <span className="text-xs font-medium">{item.title}</span>
        </NavLink>
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-muted-foreground" aria-label="Mais opções">
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-xs font-medium">Mais</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="mb-2 max-h-[70dvh] overflow-y-auto">
          {moreItems.map((item) => (
            <DropdownMenuItem key={item.url} onClick={() => navigate(item.url)}>
              {item.title}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setHelpOpen(true)}>
            <HelpCircle className="mr-2 h-4 w-4" />Central de ajuda
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleTheme}>
            <SunMoon className="mr-2 h-4 w-4" />
            Alternar tema
          </DropdownMenuItem>
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair da conta
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
    <HelpCenter open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
