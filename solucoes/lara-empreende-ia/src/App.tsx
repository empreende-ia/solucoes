import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ChatInterface from './components/ChatInterface';
import Contacts from './components/Contacts';
import Settings from './components/Settings';
import Team from './components/Team';
import Scheduling from './components/Scheduling';
import Kanban from './components/Kanban';
import Help from './components/Help';
import Auth from './pages/Auth';
import ProtectedRoute from './components/ProtectedRoute';

import { CompanySettingsProvider, useCompanySettings } from './hooks/useCompanySettings';
import { DemoModeProvider } from './hooks/useDemoMode';

import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import { Toaster } from 'sonner';
import { OnboardingWizard } from './components/OnboardingWizard';
import { useOnboardingStatus } from './hooks/useOnboardingStatus';
import './App.css';
import './components/OperationalPages.css';

// Componente de Layout que envolve a aplicação principal
const AppLayout: React.FC = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { isComplete, isDismissed, loading, loadFailed } = useOnboardingStatus();
  const { isAdmin } = useCompanySettings();

  // Abre o wizard automaticamente para admins enquanto o onboarding
  // não foi concluído nem dispensado (estado vem do banco).
  // Se a consulta falhou, estado é desconhecido — não abre nada.
  useEffect(() => {
    if (!loading && !loadFailed && !isComplete && !isDismissed && isAdmin) {
      setShowOnboarding(true);
    }
  }, [loading, loadFailed, isComplete, isDismissed, isAdmin]);

  return (
    <div className="app-shell">
      <a href="#app-content" className="app-skip-link">
        Pular para o conteúdo
      </a>
      <Sidebar />

      <main id="app-content" className="app-main">
        <div className="app-route">
          <Outlet context={{ showOnboarding, setShowOnboarding }} />
        </div>
      </main>

      <OnboardingWizard 
        isOpen={showOnboarding} 
        onClose={() => setShowOnboarding(false)} 
      />
    </div>
  );
};

/** Toast segue o tema resolvido — 'system' precisa virar light/dark concreto */
const ThemedToaster: React.FC = () => {
  const { resolved } = useTheme();
  return <Toaster position="top-right" richColors theme={resolved} />;
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
    <AuthProvider>
      <CompanySettingsProvider>
        <DemoModeProvider>
        <BrowserRouter>

          <Routes>
            {/* Public Routes */}
            <Route path="/auth" element={<Auth />} />
            
            {/* Protected Routes (With Sidebar) */}
            <Route element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/pipeline" element={<Kanban />} />
              <Route path="/chat" element={<ChatInterface />} />
              <Route path="/training" element={<Navigate to="/settings?section=knowledge" replace />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/scheduling" element={<Scheduling />} />
              <Route path="/team" element={<Team />} />
              <Route path="/help" element={<Help />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            
            {/* Catch all - redirect to dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
        <ThemedToaster />
        </DemoModeProvider>
      </CompanySettingsProvider>

    </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
