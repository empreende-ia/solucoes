import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ds/button";
import Wordmark from "@/components/brand/Wordmark";
import { SectionLabel } from "@/components/foundation/Panel";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <Wordmark variant="full" />

        <SectionLabel className="mt-12">Erro 404</SectionLabel>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          Página não encontrada
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A página{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{location.pathname}</code> não
          existe ou foi movida.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button onClick={() => navigate(-1)} variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <Button onClick={() => navigate("/")}>
            <Home className="h-4 w-4" />
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
