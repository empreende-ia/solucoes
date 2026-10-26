'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, Eye, EyeOff, Sparkles } from 'lucide-react';
import { StepCard } from '../StepCard';
import { ServiceIcon } from '../ServiceIcon';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface IdentityStepProps {
  onComplete: (data: { name: string; email: string; password: string; passwordHash: string }) => void;
  initialName?: string;
  initialEmail?: string;
}

// Charset sem caracteres ambíguos (I, l, 1, O, 0)
const PASSWORD_CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';

/**
 * Gera uma senha forte de tamanho especificado.
 */
function generateStrongPassword(length = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => PASSWORD_CHARSET[b % PASSWORD_CHARSET.length]).join(
    ''
  );
}

/**
 * Hash SHA-256 com salt fixo.
 */
async function hashPassword(password: string): Promise<string> {
  const SALT = '_dispara_salt_2026';
  const encoder = new TextEncoder();
  const data = encoder.encode(password + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Valida senha: mínimo 8 chars, pelo menos 1 letra e 1 número.
 */
function validatePassword(password: string): {
  valid: boolean;
  checks: { minLen: boolean; hasLetter: boolean; hasNumber: boolean };
} {
  const checks = {
    minLen: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasNumber: /\d/.test(password),
  };
  return {
    valid: Object.values(checks).every(Boolean),
    checks,
  };
}

/**
 * Step 1: Coleta de nome, email e senha do administrador.
 */
export function IdentityStep({ onComplete, initialName = '', initialEmail = '' }: IdentityStepProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validation = validatePassword(password);

  const handleSuggestPassword = useCallback(() => {
    const suggested = generateStrongPassword(16);
    setPassword(suggested);
    setConfirmPassword(suggested);
    setShowPassword(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validações
    if (!name.trim() || name.trim().length < 2) {
      setError('Nome deve ter no mínimo 2 caracteres');
      return;
    }

    if (!email.includes('@')) {
      setError('Email inválido');
      return;
    }

    if (!validation.valid) {
      setError('Senha deve ter no mínimo 8 caracteres, 1 letra e 1 número');
      return;
    }

    if (password !== confirmPassword) {
      setError('Senhas não conferem');
      return;
    }

    setIsSubmitting(true);

    try {
      const passwordHash = await hashPassword(password);
      onComplete({ name: name.trim(), email, password, passwordHash });
    } catch {
      setError('Erro ao processar. Tente novamente.');
      setIsSubmitting(false);
    }
  };

  return (
    <StepCard glowColor="slate">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <ServiceIcon service="identity" size="lg" />
          <h2 className="mt-4 text-xl font-semibold text-slate-100">
            Crie sua conta
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Dados para acessar o painel
          </p>
        </div>

        {/* Nome */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Seu nome
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como devemos te chamar?"
              autoFocus
              className={cn(
                'w-full pl-10 pr-4 py-3 rounded-xl',
                'bg-slate-800/50 border border-slate-700',
                'text-slate-100 placeholder:text-slate-500',
                'focus:border-primary-500 focus:outline-none',
                'focus:shadow-[var(--ds-glow-brand-ring)]',
                'transition-all duration-200'
              )}
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className={cn(
                'w-full pl-10 pr-4 py-3 rounded-xl',
                'bg-slate-800/50 border border-slate-700',
                'text-slate-100 placeholder:text-slate-500',
                'focus:border-primary-500 focus:outline-none',
                'focus:shadow-[var(--ds-glow-brand-ring)]',
                'transition-all duration-200'
              )}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-300">
              Senha
            </label>
            <button
              type="button"
              onClick={handleSuggestPassword}
              className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              Sugerir senha forte
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className={cn(
                'w-full pl-10 pr-10 py-3 rounded-xl',
                'bg-slate-800/50 border border-slate-700',
                'text-slate-100 placeholder:text-slate-500',
                'focus:border-primary-500 focus:outline-none',
                'focus:shadow-[var(--ds-glow-brand-ring)]',
                'transition-all duration-200',
                showPassword && 'font-mono text-sm'
              )}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Password strength indicators */}
          {password.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2 flex gap-3 text-xs"
            >
              <span
                className={cn(
                  validation.checks.minLen ? 'text-primary-400' : 'text-slate-500'
                )}
              >
                {validation.checks.minLen ? '✓' : '○'} 8+ chars
              </span>
              <span
                className={cn(
                  validation.checks.hasLetter ? 'text-primary-400' : 'text-slate-500'
                )}
              >
                {validation.checks.hasLetter ? '✓' : '○'} Letra
              </span>
              <span
                className={cn(
                  validation.checks.hasNumber ? 'text-primary-400' : 'text-slate-500'
                )}
              >
                {validation.checks.hasNumber ? '✓' : '○'} Número
              </span>
            </motion.div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Confirmar senha
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
              className={cn(
                'w-full pl-10 pr-10 py-3 rounded-xl',
                'bg-slate-800/50 border border-slate-700',
                'text-slate-100 placeholder:text-slate-500',
                'focus:border-primary-500 focus:outline-none',
                'focus:shadow-[var(--ds-glow-brand-ring)]',
                'transition-all duration-200',
                showConfirm && 'font-mono text-sm'
              )}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showConfirm ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Match indicator */}
          {confirmPassword.length > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                'mt-2 text-xs',
                password === confirmPassword ? 'text-primary-400' : 'text-red-400'
              )}
            >
              {password === confirmPassword ? '✓ Senhas conferem' : '✗ Senhas não conferem'}
            </motion.p>
          )}
        </div>

        {/* Error */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-red-400 text-center"
          >
            {error}
          </motion.p>
        )}

        {/* Submit */}
        <Button
          type="submit"
          variant="brand"
          size="lg"
          className="w-full"
          disabled={isSubmitting || !name.trim() || !email || !validation.valid || password !== confirmPassword}
        >
          {isSubmitting ? 'Processando...' : 'Continuar'}
        </Button>
      </form>
    </StepCard>
  );
}
