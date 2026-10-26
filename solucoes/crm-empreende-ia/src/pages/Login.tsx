import { useState, useEffect } from "react";
import { useNavigate,useSearchParams } from "react-router-dom";
import { supabase, backendConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ds/tabs";
import { Mail } from "lucide-react";
import Wordmark from "@/components/brand/Wordmark";
import { AuthBrandPanel } from "@/components/brand/AuthBrandPanel";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invite = params.get("invite");
  const destination = invite ? `/invite?invite=${encodeURIComponent(invite)}` : "/dashboard";
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate(destination);
  }, [user, navigate, destination]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
    } else {
      navigate(destination);
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`,
        },
      });
      if (error) {
        toast({ title: "Erro ao criar conta", description: error.message, variant: "destructive" });
      } else if (data.session) {
        toast({ title: "Conta criada com sucesso!" });
        navigate(destination);
      } else {
        toast({ title: "Conta criada!", description: "Verifique seu email para confirmar." });
      }
    } catch (err: unknown) {
      toast({ title: "Erro ao criar conta", description: err instanceof Error ? err.message : "Tente novamente", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/${invite ? `?invite=${encodeURIComponent(invite)}` : ""}` },
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setMagicLinkSent(true);
      toast({ title: "Link enviado!", description: "Verifique seu email." });
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Digite seu email", variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email enviado!", description: "Verifique seu email para redefinir a senha." });
    }
  };

  return (
    <div className="eia-auth flex min-h-screen">
      <AuthBrandPanel />

      {/* Coluna do formulário */}
      <div className="eia-auth-form relative flex flex-1 items-center justify-center px-6 py-12">
        <ThemeToggle className="absolute right-6 top-6" />
        <div className="eia-auth-form-panel w-full max-w-md">
          <div className="mb-10 lg:hidden"><Wordmark variant="wordmark" /></div>

          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Acesse seu CRM</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Entre na sua conta para continuar.
          </p>

          {!backendConfigured && <p role="status" className="mt-5 rounded-xl border border-border bg-muted p-4 text-sm">O ambiente exclusivo do CRM está em configuração. O acesso será liberado assim que a conexão estiver pronta.</p>}
          <Tabs defaultValue="login" className="mt-6">
            <TabsList className="w-full">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              <TabsTrigger value="magic">Link por e-mail</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={loading || !backendConfigured}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nome</Label>
                  <Input
                    id="signup-name"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={loading || !backendConfigured}>
                  {loading ? "Criando conta..." : "Criar conta"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="magic">
              {magicLinkSent ? (
                <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Mail className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-foreground">Verifique seu email</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enviamos um link de acesso para <strong className="font-medium text-foreground">{email}</strong>
                  </p>
                </div>
              ) : (
                <form onSubmit={handleMagicLink} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="magic-email">Email</Label>
                    <Input
                      id="magic-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={loading || !backendConfigured}>
                    {loading ? "Enviando..." : "Enviar link de acesso"}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Empreende.IA · CRM
          </p>
        </div>
      </div>
    </div>
  );
}
