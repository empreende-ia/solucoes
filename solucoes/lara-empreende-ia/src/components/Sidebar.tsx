import React, { useEffect, useState } from 'react';
import { LayoutDashboard, MessageSquare, Users, Settings as SettingsIcon, LogOut, ShieldCheck, Calendar, Kanban, LifeBuoy, Building2, Layers, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useAuth } from '@/hooks/useAuth';

import { Sidebar, SidebarBody, SidebarLink, useSidebar } from '@/components/ui/sidebar';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
// Sidebar é grafite nos dois temas → lockup branco; monograma branco na colapsada.
import eiaMonogram from '@/assets/eia-monogram-light.svg';
import eiaWordmarkWhite from '@/assets/eia-wordmark-white.svg';
import ThemeToggle from '@/components/ThemeToggle';
import './Sidebar.css';

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pipeline', label: 'Pipeline', icon: Kanban },
  { id: 'chat', label: 'Chat ao vivo', icon: MessageSquare },
  { id: 'contacts', label: 'Contatos', icon: Users },
  { id: 'scheduling', label: 'Agendamentos', icon: Calendar },
  { id: 'team', label: 'Equipe', icon: ShieldCheck },
  { id: 'help', label: 'Ajuda', icon: LifeBuoy },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon },
];

const DEMO_NOTICE_DISMISS_KEY = 'eia:demo-notice-dismissed';

/**
 * Aviso de que a instância está exibindo dados fictícios.
 * O usuário pode fechar; a escolha vale enquanto a aba estiver aberta.
 */
const DemoModeNotice: React.FC<{ expanded: boolean }> = ({ expanded }) => {
  const { isDemoMode } = useDemoMode();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(DEMO_NOTICE_DISMISS_KEY) === '1'
  );

  if (!isDemoMode || dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem(DEMO_NOTICE_DISMISS_KEY, '1');
    setDismissed(true);
  };

  // Alerta funcional: amber SÓ via token (--eia-accent-alert). A sidebar é
  // grafite nos dois temas, então o degrau escuro do token é o que rende
  // contraste — fixado aqui de propósito, não segue o tema da página.
  const alert = 'var(--eia-accent-alert)';

  if (!expanded) {
    return (
      <div className="flex justify-center py-2" title="Dados de demonstração ativos">
        <Layers className="w-4 h-4" style={{ color: alert }} />
      </div>
    );
  }

  return (
    <div
      className="mx-1 mb-3 rounded-lg p-3"
      style={{
        border: `1px solid color-mix(in srgb, ${alert} 40%, transparent)`,
        background: `color-mix(in srgb, ${alert} 10%, transparent)`,
      }}
    >
      <div className="flex items-start gap-2">
        <Layers className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: alert }} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold" style={{ color: alert }}>Dados de demonstração ativos</p>
          <p className="mt-1 text-[11px] leading-snug text-sidebar-foreground">
            O conteúdo exibido é fictício. Desative em Configurações → Demonstração.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="rounded p-0.5 text-sidebar-foreground transition-colors hover:text-sidebar-accent-foreground"
          aria-label="Fechar aviso"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

const Logo = ({ companyName }: { companyName: string }) => {

  return (
    <Link to="/dashboard" className="app-sidebar-brand" aria-label="Ir para o dashboard">
      <img src={eiaWordmarkWhite} alt="Empreende.IA" className="app-sidebar-brand-lockup" />
      <div className="app-sidebar-workspace">
        <span className="app-sidebar-workspace-icon" aria-hidden="true">
          <Building2 />
        </span>
        <div className="min-w-0">
          <span className="app-sidebar-workspace-label">Workspace</span>
          <span className="app-sidebar-workspace-name">{companyName || 'Minha Empresa'}</span>
        </div>
      </div>
    </Link>
  );
};

const LogoIcon = () => {
  return (
    <Link to="/dashboard" className="flex items-center py-1">
      <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
        <div className="relative w-10 h-10 rounded-lg bg-sidebar-accent flex items-center justify-center p-1.5">
          <img src={eiaMonogram} alt="Empreende.IA" className="w-full h-full object-contain" />
        </div>
      </div>
    </Link>
  );
};

const SidebarContent = () => {
  const { companyName } = useCompanySettings();
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname.substring(1) || 'dashboard';
  const { open, setOpen } = useSidebar();

  const links = menuItems.map(item => ({
    label: item.label,
    href: `/${item.id}`,
    icon: <item.icon className="h-5 w-5" />,
  }));

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success('Logout realizado com sucesso');
      navigate('/auth', { replace: true });
    } catch (error) {
      toast.error('Erro ao fazer logout');
    }
  };

  // Get user initials
  const getUserInitials = () => {
    if (!user?.email) return 'US';
    const email = user.email;
    return email.substring(0, 2).toUpperCase();
  };

  // Get display name
  const getDisplayName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    return 'Usuário';
  };

  return (
    <>
      <div className="app-sidebar-scroll flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mb-6">
          {open ? <Logo companyName={companyName} /> : <LogoIcon />}
        </div>
        
        <nav className="flex flex-col gap-1.5">
          {links.map((link, idx) => (
            <SidebarLink
              key={idx}
              link={link}
              isActive={currentPath.startsWith(link.href.slice(1))}
            />
          ))}
        </nav>
      </div>

      <DemoModeNotice expanded={open} />

      {/* A marca vive no topo; o rodapé concentra apenas a preferência de tema. */}

      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="py-4 flex flex-col items-center gap-3"
        >
          <ThemeToggle />
        </motion.div>
      )}
      {!open && (
        <div className="py-4 flex justify-center">
          <ThemeToggle compact />
        </div>
      )}

      {/* User Footer */}
      <div className="border-t border-sidebar-border pt-4">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors cursor-pointer group">
          <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium text-sidebar-accent-foreground border border-sidebar-border flex-shrink-0">
            {getUserInitials()}
          </div>
          <motion.div
            animate={{
              display: open ? "block" : "none",
              opacity: open ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden"
          >
            <p className="text-sm font-medium text-sidebar-accent-foreground whitespace-nowrap">{getDisplayName()}</p>
            <p className="text-xs text-sidebar-foreground truncate">{user?.email || 'email@example.com'}</p>
          </motion.div>
          <motion.div
            animate={{
              display: open ? "block" : "none",
              opacity: open ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
          >
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md hover:bg-destructive/20 transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4 text-sidebar-foreground hover:text-destructive transition-colors" />
            </button>
          </motion.div>
        </div>
      </div>
    </>
  );
};

const AppSidebar: React.FC = () => {
  const [open, setOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 768px)').matches
  );

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const syncWithViewport = (event: MediaQueryListEvent) => setOpen(event.matches);
    desktop.addEventListener('change', syncWithViewport);
    return () => desktop.removeEventListener('change', syncWithViewport);
  }, []);

  return (
    <Sidebar open={open} setOpen={setOpen}>
      {/* Grafite sólido nos dois temas: mantém o wordmark branco legível. */}
      <SidebarBody className="justify-between gap-10 bg-sidebar border-r border-sidebar-border">
        <SidebarContent />
      </SidebarBody>
    </Sidebar>
  );
};

export default AppSidebar;
