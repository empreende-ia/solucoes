import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  ShieldCheck,
  User,
} from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';

import { Button } from '@/components/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
// Lockup completo sempre (regra da marca): tinta no claro, branco no escuro.
import eiaWordmarkInk from '@/assets/eia-wordmark-dark.svg';
import eiaWordmarkWhite from '@/assets/eia-wordmark-white.svg';

import './Auth.css';

const emailSchema = z.string().email('Email inválido');
const passwordSchema = z.string().min(6, 'Senha deve ter pelo menos 6 caracteres');
const nameSchema = z.string().min(2, 'Nome deve ter pelo menos 2 caracteres');

type AuthMode = 'login' | 'signup' | 'reset' | 'recovery';

// O link de recuperação chega de duas formas: com o token no fragmento
// (#access_token=…&type=recovery) ou, no fluxo PKCE, com ?code=. O fragmento é
// consumido e apagado pelo próprio cliente do Supabase assim que ele inicializa,
// então a URL é capturada na carga do módulo — antes de qualquer render. O
// marcador ?recovery=1 que a gente mesmo coloca no redirectTo sobrevive à
// limpeza e é a pista mais confiável.
const CAPTURED_URL =
  typeof window === 'undefined'
    ? { search: '', hash: '' }
    : { search: window.location.search, hash: window.location.hash };

function readRecoveryIntent(): { recovery: boolean; linkError: string | null } {
  const sources = [CAPTURED_URL];
  if (typeof window !== 'undefined') {
    sources.push({ search: window.location.search, hash: window.location.hash });
  }

  let recovery = false;
  let linkError: string | null = null;

  for (const source of sources) {
    const search = new URLSearchParams(source.search);
    const hash = new URLSearchParams(source.hash.replace(/^#/, ''));
    const type = hash.get('type') ?? search.get('type');
    if (search.get('recovery') === '1' || type === 'recovery' || type === 'invite') {
      recovery = true;
    }
    const description = hash.get('error_description') ?? search.get('error_description');
    if (description && !linkError) linkError = description;
  }

  return { recovery, linkError };
}

function clearRecoveryFromUrl(): void {
  if (typeof window === 'undefined') return;
  window.history.replaceState(null, '', '/auth');
}

const Auth: React.FC = () => {
  const [initialIntent] = useState(readRecoveryIntent);
  const [mode, setMode] = useState<AuthMode>(initialIntent.recovery ? 'recovery' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(initialIntent.linkError);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    fullName?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  const { signIn, signUp, user, loading } = useAuth();
  const navigate = useNavigate();

  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';
  const isRecovery = mode === 'recovery';
  // Sessão de recuperação não estabelecida: o link expirou, já foi usado ou veio truncado.
  const recoveryLinkBroken = isRecovery && !loading && !user;

  useEffect(() => {
    if (!loading && user && !isRecovery) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate, isRecovery]);

  // O cliente do Supabase avisa quando o token da URL é de recuperação. Serve de
  // rede para o caso de a tela montar depois do processamento do fragmento.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (isRecovery) {
      const result = passwordSchema.safeParse(newPassword);
      if (!result.success) {
        newErrors.newPassword = result.error.errors[0].message;
      }
      if (confirmPassword !== newPassword) {
        newErrors.confirmPassword = 'As senhas não são iguais';
      }
      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }

    if (!isReset) {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) {
        newErrors.password = passwordResult.error.errors[0].message;
      }
    }

    if (isSignup) {
      const nameResult = nameSchema.safeParse(fullName);
      if (!nameResult.success) {
        newErrors.fullName = nameResult.error.errors[0].message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    const { error } = await signIn(email, password);
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        toast.error('Email ou senha incorretos.');
      } else if (error.message.includes('Email not confirmed')) {
        toast.error('Confirme seu email antes de fazer login.');
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success('Login realizado.');
    navigate('/dashboard', { replace: true });
  };

  const handleSignup = async () => {
    const { error } = await signUp(email, password, fullName);
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('already registered')) {
        toast.error('Este email já está cadastrado. Tente fazer login.');
      } else if (message.includes('signup') || message.includes('not allowed')) {
        toast.error('O cadastro público está fechado. Peça um convite a um administrador.');
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success('Conta criada. Seu workspace está pronto.');
    navigate('/dashboard', { replace: true });
  };

  const handleReset = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?recovery=1`,
    });
    if (error) {
      if (error.message.toLowerCase().includes('rate limit')) {
        toast.error('Muitas tentativas seguidas. Espere alguns minutos.');
      } else {
        toast.error(error.message);
      }
      return;
    }
    setResetSentTo(email);
    toast.success('Link de recuperação enviado.');
  };

  const handleRecovery = async () => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('session') || message.includes('expired')) {
        setLinkError('O link de recuperação expirou ou já foi usado.');
        toast.error('O link expirou. Peça um novo link.');
      } else if (message.includes('different from the old')) {
        toast.error('Escolha uma senha diferente da anterior.');
      } else {
        toast.error(error.message);
      }
      return;
    }
    clearRecoveryFromUrl();
    toast.success('Senha atualizada.');
    navigate('/dashboard', { replace: true });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      if (isLogin) await handleLogin();
      else if (isSignup) await handleSignup();
      else if (isReset) await handleReset();
      else await handleRecovery();
    } finally {
      setIsSubmitting(false);
    }
  };

  const goTo = (next: AuthMode) => {
    setMode(next);
    setErrors({});
    setShowPassword(false);
    setResetSentTo(null);
    if (next !== 'recovery') {
      setLinkError(null);
      clearRecoveryFromUrl();
    }
  };

  if (loading) {
    return (
      <div className="auth-loading" role="status" aria-label="Carregando acesso">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        <span>Carregando acesso</span>
      </div>
    );
  }

  const headerCopy: Record<AuthMode, { eyebrow: string; title: string; lede: string }> = {
    login: {
      eyebrow: 'Acesso ao workspace',
      title: 'Bem-vindo de volta.',
      lede: 'Entre para acompanhar conversas, oportunidades e reuniões.',
    },
    signup: {
      eyebrow: 'Primeiro acesso',
      title: 'Crie seu workspace.',
      lede: 'O acesso é por convite. Use o email que recebeu o convite.',
    },
    reset: {
      eyebrow: 'Recuperar acesso',
      title: 'Esqueceu a senha.',
      lede: 'Informe seu email e enviamos um link para você definir uma nova.',
    },
    recovery: {
      eyebrow: 'Recuperar acesso',
      title: 'Defina sua nova senha.',
      lede: 'Escolha uma senha de pelo menos 6 caracteres para voltar ao workspace.',
    },
  };

  const submitLabel = isLogin
    ? 'Entrar no workspace'
    : isSignup
      ? 'Criar workspace'
      : isReset
        ? 'Enviar link'
        : 'Salvar nova senha';

  return (
    <main className="auth-page">
      <section className="auth-story eia-mesh-ink eia-noise" data-on-dark aria-label="Sobre a Lara">

        <img src={eiaWordmarkWhite} alt="Empreende.IA" className="auth-story-logo" />

        <div className="auth-story-copy">
          <p className="eia-eyebrow auth-story-eyebrow">Lara · SDR com IA</p>
          <h1>
            Conversa qualificada.
            <br />
            <em>Pipeline em movimento.</em>
          </h1>
          <p className="auth-story-lede">
            Qualifique leads, agende reuniões e acompanhe cada oportunidade em um só lugar.
          </p>

          <ul className="auth-proof" aria-label="Recursos principais">
            <li>
              <MessageCircle aria-hidden="true" />
              <span>WhatsApp integrado</span>
            </li>
            <li>
              <CalendarCheck2 aria-hidden="true" />
              <span>Agendamento integrado</span>
            </li>
            <li>
              <ShieldCheck aria-hidden="true" />
              <span>Respostas com base no seu negócio</span>
            </li>
          </ul>
        </div>

        <p className="auth-story-footer">Empreende.IA · engenharia aplicada a vendas.</p>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-panel-brand">
            <img src={eiaWordmarkInk} alt="Empreende.IA" className="dark:hidden" />
            <img src={eiaWordmarkWhite} alt="Empreende.IA" className="hidden dark:block" />
            <span className="eia-pill">Lara</span>
          </div>

          <div className="auth-card">
            <header className="auth-card-header">
              <p className="eia-eyebrow">{headerCopy[mode].eyebrow}</p>
              <h2>{headerCopy[mode].title}</h2>
              <p>{headerCopy[mode].lede}</p>
            </header>

            {linkError && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <p className="m-0 font-medium">Este link não vale mais.</p>
                <p className="mt-1 text-muted-foreground">
                  Peça um novo link de recuperação e refaça o processo.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => goTo('reset')}
                >
                  Pedir novo link
                </Button>
              </div>
            )}

            {resetSentTo && (
              <div
                role="status"
                className="mb-5 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
              >
                <p className="m-0 font-medium text-foreground">Link enviado para {resetSentTo}.</p>
                <p className="mt-1">
                  Abra o email e clique no link para definir a nova senha. Ele vale por uma hora.
                </p>
              </div>
            )}

            {recoveryLinkBroken && !linkError && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
              >
                <p className="m-0 font-medium text-foreground">Não reconhecemos este link.</p>
                <p className="mt-1">
                  O link de recuperação vale uma vez só e expira em uma hora. Peça um novo.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => goTo('reset')}
                >
                  Pedir novo link
                </Button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              {isSignup && (
                <div className="auth-field">
                  <Label htmlFor="fullName">Nome completo</Label>
                  <div className="auth-input-wrap">
                    <User aria-hidden="true" />
                    <Input
                      id="fullName"
                      type="text"
                      autoComplete="name"
                      placeholder="Seu nome"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      aria-invalid={Boolean(errors.fullName)}
                      aria-describedby={errors.fullName ? 'fullName-error' : undefined}
                    />
                  </div>
                  {errors.fullName && (
                    <p id="fullName-error" className="auth-error" role="alert">
                      {errors.fullName}
                    </p>
                  )}
                </div>
              )}

              {!isRecovery && (
                <div className="auth-field">
                  <Label htmlFor="email">Email</Label>
                  <div className="auth-input-wrap">
                    <Mail aria-hidden="true" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="voce@empresa.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? 'email-error' : undefined}
                    />
                  </div>
                  {errors.email && (
                    <p id="email-error" className="auth-error" role="alert">
                      {errors.email}
                    </p>
                  )}
                </div>
              )}

              {(isLogin || isSignup) && (
                <div className="auth-field">
                  <Label htmlFor="password">Senha</Label>
                  <div className="auth-input-wrap auth-input-password">
                    <Lock aria-hidden="true" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={isLogin ? 'current-password' : 'new-password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={errors.password ? 'password-error' : undefined}
                    />
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p id="password-error" className="auth-error" role="alert">
                      {errors.password}
                    </p>
                  )}
                </div>
              )}

              {isLogin && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => goTo('reset')}
                    className="rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              )}

              {isRecovery && (
                <>
                  <div className="auth-field">
                    <Label htmlFor="newPassword">Nova senha</Label>
                    <div className="auth-input-wrap auth-input-password">
                      <KeyRound aria-hidden="true" />
                      <Input
                        id="newPassword"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        aria-invalid={Boolean(errors.newPassword)}
                        aria-describedby={errors.newPassword ? 'newPassword-error' : undefined}
                      />
                      <button
                        type="button"
                        className="auth-password-toggle"
                        onClick={() => setShowPassword((current) => !current)}
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </button>
                    </div>
                    {errors.newPassword && (
                      <p id="newPassword-error" className="auth-error" role="alert">
                        {errors.newPassword}
                      </p>
                    )}
                  </div>

                  <div className="auth-field">
                    <Label htmlFor="confirmPassword">Repita a nova senha</Label>
                    <div className="auth-input-wrap">
                      <Lock aria-hidden="true" />
                      <Input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        aria-invalid={Boolean(errors.confirmPassword)}
                        aria-describedby={
                          errors.confirmPassword ? 'confirmPassword-error' : undefined
                        }
                      />
                    </div>
                    {errors.confirmPassword && (
                      <p id="confirmPassword-error" className="auth-error" role="alert">
                        {errors.confirmPassword}
                      </p>
                    )}
                  </div>
                </>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="auth-submit"
                disabled={isSubmitting || (isRecovery && recoveryLinkBroken)}
              >
                {isSubmitting ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <>
                    <span>{submitLabel}</span>
                    <ArrowRight aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>

            <div className="auth-switch">
              {isLogin && (
                <>
                  <span>Ainda não tem uma conta?</span>
                  <button type="button" onClick={() => goTo('signup')}>
                    Criar conta
                  </button>
                </>
              )}
              {isSignup && (
                <>
                  <span>Já tem uma conta?</span>
                  <button type="button" onClick={() => goTo('login')}>
                    Fazer login
                  </button>
                </>
              )}
              {(isReset || isRecovery) && (
                <>
                  <span>Lembrou a senha?</span>
                  <button type="button" onClick={() => goTo('login')}>
                    Voltar ao login
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="auth-legal">
            {isSignup
              ? 'O cadastro público está fechado. Contas novas são criadas por convite de um administrador.'
              : 'Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade.'}
          </p>
        </div>
      </section>
    </main>
  );
};

export default Auth;
