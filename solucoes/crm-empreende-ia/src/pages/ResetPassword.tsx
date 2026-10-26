import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Label } from "@/components/ui/label";
import Wordmark from "@/components/brand/Wordmark";
import { AuthBrandPanel } from "@/components/brand/AuthBrandPanel";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [access, setAccess] = useState<"checking" | "ready" | "invalid" | "error">("checking");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    let signedOut = false;
    setAccess("checking");
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        signedOut = true;
        if (mounted) setAccess("invalid");
      }
    });
    const validateAccess = async () => {
      try {
        // The SDK removes recovery tokens from the URL. Validate its result and
        // the user so a reload works, while an invalid link cannot reuse another session.
        const initialized = await supabase.auth.initialize();
        if (initialized.error) throw initialized.error;
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (mounted && !signedOut) setAccess(data.user ? "ready" : "invalid");
      } catch (error) {
        if (!mounted || signedOut) return;
        const retryable = error instanceof Error && (error.name === "AuthRetryableFetchError" || error.name === "TypeError");
        setAccess(retryable ? "error" : "invalid");
      }
    };
    void validateAccess();
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (access !== "ready" || loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Senha atualizada!" });
      navigate("/");
    } catch (error) {
      toast({ title: "Não foi possível salvar a senha", description: error instanceof Error ? error.message : "Verifique sua conexão e tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="eia-auth flex min-h-screen">
      <AuthBrandPanel recovery />

      {/* Coluna do formulário */}
      <div className="eia-auth-form relative flex flex-1 items-center justify-center px-6 py-12">
        <ThemeToggle className="absolute right-6 top-6" />
        <div className="eia-auth-form-panel w-full max-w-md">
          <div className="mb-10 lg:hidden"><Wordmark variant="wordmark" /></div>

          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Redefinir senha</h2>
          <p className="mt-1 text-sm text-muted-foreground">Digite sua nova senha para continuar</p>

          {access === "checking" && <p role="status" className="mt-8 text-sm text-muted-foreground">Validando seu acesso...</p>}
          {(access === "invalid" || access === "error") && <div className="mt-8 space-y-4">
            <p role="alert" className="text-sm text-muted-foreground">{access === "invalid" ? "Este link é inválido ou expirou. Volte ao login e solicite um novo link de recuperação." : "Não foi possível validar seu acesso. Verifique a conexão e tente novamente."}</p>
            {access === "error" && <Button onClick={() => window.location.reload()} className="w-full">Tentar novamente</Button>}
            <Button variant="secondary" onClick={() => navigate("/")} className="w-full">Voltar ao login</Button>
          </div>}
          {access === "ready" && <form onSubmit={handleReset} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>}
        </div>
      </div>
    </div>
  );
}
