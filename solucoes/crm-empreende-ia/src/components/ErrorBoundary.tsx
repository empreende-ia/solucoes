import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Bug } from "lucide-react";
import { Button } from "@/components/ds/button";
import { SUPPORT_EMAIL } from "@/lib/support";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string;
  lastResetKey?: string | number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: "", lastResetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): State {
    const errorId = `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    return { hasError: true, error, errorId };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.lastResetKey) {
      return { hasError: false, error: null, errorId: "", lastResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", this.state.errorId, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center" role="alert">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">Algo deu errado</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Um erro inesperado ocorreu neste componente. Tente recarregar a página.
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            ID do erro: {this.state.errorId}
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" />Recarregar
            </Button>
            {SUPPORT_EMAIL && <Button variant="outline" size="sm" onClick={() => {
              const subject = encodeURIComponent(`Bug Report: ${this.state.errorId}`);
              const body = encodeURIComponent(`Erro: ${this.state.error?.message}\n\nID: ${this.state.errorId}\nURL: ${window.location.href}`);
              window.open(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
            }}>
              <Bug className="mr-2 h-4 w-4" />Reportar
            </Button>}
          </div>
          {!SUPPORT_EMAIL && <p className="mt-4 text-sm text-muted-foreground">Se o erro continuar, informe este código ao administrador da sua equipe.</p>}
        </div>
      );
    }

    return this.props.children;
  }
}
