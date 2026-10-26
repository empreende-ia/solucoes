import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppRail } from "@/components/shell/AppRail";
import { ShellContext } from "@/components/shell/ShellContext";
import { MobileBottomNav } from "./MobileBottomNav";
import { RouteTransition } from "@/components/RouteTransition";
import { CommandPalette } from "@/components/CommandPalette";
import { AICopilot } from "@/components/crm/AICopilot";
import { CrmOnboardingProvider } from "@/components/onboarding/CrmOnboardingProvider";
import { WorkspaceSetup } from "@/components/workspace/WorkspaceSetup";
import { Button } from "@/components/ds/button";
import { LoadingState } from "@/components/foundation/LoadingState";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { user, loading, profile, profileError, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const shell = useMemo(() => ({ openSearch: () => setSearchOpen(true) }), []);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingState label="Carregando…" />
      </div>
    );
  }

  if (!user) return null;
  if (profileError) return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6"><p role="alert">{profileError}</p><Button onClick={() => void refreshProfile()}>Tentar novamente</Button><Button variant="ghost" onClick={() => void signOut()}>Sair</Button></main>;
  if (!profile?.org_id) return <WorkspaceSetup />;

  return (
    <ShellContext.Provider value={shell}>
      <CrmOnboardingProvider>
      <div className="eia-shell flex w-full overflow-hidden">
        <AppRail />
        <main className="eia-workspace min-h-0 min-w-0 flex-1 pb-14 md:pb-0">
          <RouteTransition />
        </main>
      </div>
      {isMobile && <MobileBottomNav />}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <AICopilot />
      </CrmOnboardingProvider>
    </ShellContext.Provider>
  );
}
