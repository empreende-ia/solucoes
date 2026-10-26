"use client";

import { cn } from "@/lib/utils";
import { Link, LinkProps } from "react-router-dom";
import React, { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, ChevronLeft } from "lucide-react";
import eiaWordmarkWhite from "@/assets/eia-wordmark-white.svg";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return (
    <>
      <DesktopSidebar className={className}>{children}</DesktopSidebar>
      <MobileSidebar className={className}>{children}</MobileSidebar>
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <div className="relative h-full flex-shrink-0 hidden md:block">
      <motion.div
        className={cn(
          "app-sidebar-panel h-full px-4 py-4 hidden md:flex md:flex-col w-[260px]",
          className
        )}
        animate={{
          width: animate ? (open ? "260px" : "76px") : "260px",
        }}
        transition={{
          duration: 0.3,
          ease: "easeInOut",
        }}
        {...props}
      >
        {children}
      </motion.div>
      
      {/* Toggle Button - outside motion.div to avoid type issues */}
      <button
        onClick={() => setOpen(!open)}
        className="app-sidebar-toggle absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6
                   bg-sidebar border border-sidebar-border rounded-full
                   hidden md:flex items-center justify-center
                   hover:bg-sidebar-accent hover:border-sidebar-ring/50
                   transition-all shadow-md z-50 group"
        aria-label={open ? 'Recolher menu' : 'Expandir menu'}
      >
        <ChevronLeft
          className={cn(
            "w-4 h-4 text-sidebar-foreground group-hover:text-sidebar-accent-foreground transition-all duration-300",
            !open && "rotate-180"
          )}
        />
      </button>
    </div>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();
  return (
    <>
      <div
        className={cn(
          "app-sidebar-mobilebar h-14 px-4 py-4 flex flex-row md:hidden items-center justify-between bg-sidebar w-full border-b border-sidebar-border"
        )}
        {...props}
      >
        <Link to="/dashboard" className="app-sidebar-mobilebrand" aria-label="Ir para o dashboard">
          <img src={eiaWordmarkWhite} alt="Empreende.IA" />
        </Link>
        <button
          type="button"
          className="app-sidebar-menu-button"
          onClick={() => setOpen(!open)}
          aria-label="Abrir menu"
        >
          <Menu aria-hidden="true" />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className={cn(
                "app-sidebar-drawer fixed h-full w-full inset-0 bg-sidebar text-sidebar-foreground p-10 z-[100] flex flex-col justify-between",
                className
              )}
            >
              <button
                type="button"
                className="app-sidebar-close absolute right-10 top-10 z-50 text-sidebar-foreground cursor-pointer hover:text-sidebar-accent-foreground transition-colors"
                onClick={() => setOpen(!open)}
                aria-label="Fechar menu"
              >
                <X aria-hidden="true" />
              </button>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export const SidebarLink = ({
  link,
  className,
  isActive,
  onClick,
  ...props
}: {
  link: Links;
  className?: string;
  isActive?: boolean;
  onClick?: () => void;
  props?: Omit<LinkProps, 'to'>;
}) => {
  const { open, setOpen, animate } = useSidebar();

  // No celular a sidebar é um drawer que cobre a tela inteira: navegar sem
  // fechá-lo deixa a pessoa olhando o menu, achando que o toque não funcionou.
  // No desktop o mesmo estado controla a expansão, e fechar seria indesejado.
  const handleClick = () => {
    onClick?.();
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      setOpen(false);
    }
  };

  return (
    <Link
      to={link.href}
      onClick={handleClick}
      className={cn(
        // Regra do DS: borda fina uniforme nos 4 lados marca o item ativo.
        // Nada de barra lateral colorida — a superfície + o anel já ancoram.
        "app-sidebar-link flex items-center justify-start gap-3 group/sidebar py-3 px-3 rounded-lg transition-all duration-200 relative border",
        isActive
          ? "app-sidebar-link--active bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-border"
          : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
        className
      )}
      {...props}
    >
      <span className={cn(
        "flex-shrink-0 transition-colors",
        isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground group-hover/sidebar:text-sidebar-accent-foreground"
      )}>
        {link.icon}
      </span>
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        transition={{
          duration: 0.2,
          ease: "easeInOut",
        }}
        className={cn(
          "text-sm group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre",
          isActive ? "font-medium" : "font-normal"
        )}
      >
        {link.label}
      </motion.span>
    </Link>
  );
};
