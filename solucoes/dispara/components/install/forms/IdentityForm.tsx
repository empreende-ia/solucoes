'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, Eye, EyeOff, Sparkles, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LogoUploader } from '@/components/brand/LogoUploader';
import { isValidEmail, VALIDATION } from '@/lib/installer/types';
import type { FormProps } from './types';

// Charset sem caracteres ambíguos (I, l, 1, O, 0)
const PASSWORD_CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';

function generateStrongPassword(length = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => PASSWORD_CHARSET[b % PASSWORD_CHARSET.length]).join('');
}

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
 * Form de identidade - Tema Blade Runner.
 * "Registro de Identidade" estilo Voight-Kampff.
 */
export function IdentityForm({ data, onComplete }: FormProps) {
  const [name, setName] = useState(data.name);
  const [email, setEmail] = useState(data.email);
  const [password, setPassword] = useState(data.password);
  const [confirmPassword, setConfirmPassword] = useState(data.password);
  // Whitelabel (opcional)
  const [brandLogoUrl, setBrandLogoUrl] = useState(data.brandLogoUrl || '');
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(data.brandPrimaryColor || '#10b981');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = validatePassword(password);

  const handleSuggestPassword = useCallback(() => {
    const suggested = generateStrongPassword(16);
    setPassword(suggested);
    setConfirmPassword(suggested);
    setShowPassword(true);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || name.trim().length < VALIDATION.NAME_MIN_LENGTH) {
      setError(`Designação requer mínimo ${VALIDATION.NAME_MIN_LENGTH} caracteres`);
      return;
    }

    if (!isValidEmail(email)) {
      setError('Código de comunicação inválido');
      return;
    }

    if (!validation.valid) {
      setError(`Código de acesso: mínimo ${VALIDATION.PASSWORD_MIN_LENGTH} chars, 1 letra, 1 número`);
      return;
    }

    if (password !== confirmPassword) {
      setError('Códigos não correspondem');
      return;
    }

    const normalizedColor = /^#[0-9a-fA-F]{6}$/.test(brandPrimaryColor)
      ? brandPrimaryColor.toLowerCase()
      : '#10b981';

    onComplete({
      name: name.trim(),
      email: email.trim(),
      password,
      brandLogoUrl: brandLogoUrl.trim(),
      brandPrimaryColor: normalizedColor,
    });
  };

  const inputClass = cn(
    'w-full pl-10 pr-4 py-3 rounded-lg',
    'bg-[var(--br-void-black)]/80 border border-[var(--br-dust-gray)]/50',
    'text-[var(--br-hologram-white)] placeholder:text-[var(--br-dust-gray)]',
    'font-mono text-sm',
    'focus:border-[var(--br-neon-cyan)] focus:outline-none',
    'focus:shadow-[0_0_15px_var(--br-neon-cyan)/0.3]',
    'transition-all duration-200'
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Header */}
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-[var(--br-deep-navy)] border border-[var(--br-neon-cyan)]/30 flex items-center justify-center">
          <User className="w-7 h-7 text-[var(--br-neon-cyan)]" />
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-wide text-[var(--br-hologram-white)] uppercase">
          Registro de Identidade
        </h2>
        <p className="mt-1 text-sm text-[var(--br-muted-cyan)] font-mono">
          Autenticação requerida
        </p>
      </div>

      {/* Nome */}
      <div>
        <label className="block text-xs font-mono text-[var(--br-muted-cyan)] mb-2 uppercase tracking-wider">
          {'>'} Designação
        </label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--br-dust-gray)]" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como devemos chamá-lo?"
            autoFocus
            className={inputClass}
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <label className="block text-xs font-mono text-[var(--br-muted-cyan)] mb-2 uppercase tracking-wider">
          {'>'} Código de Comunicação
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--br-dust-gray)]" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className={inputClass}
          />
        </div>
      </div>

      {/* Password */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-mono text-[var(--br-muted-cyan)] uppercase tracking-wider">
            {'>'} Código de Acesso
          </label>
          <button
            type="button"
            onClick={handleSuggestPassword}
            className="flex items-center gap-1 text-xs font-mono text-[var(--br-neon-magenta)] hover:text-[var(--br-neon-cyan)] transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            gerar código forte
          </button>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--br-dust-gray)]" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            className={cn(inputClass, 'pr-10')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--br-dust-gray)] hover:text-[var(--br-muted-cyan)]"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {password.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-2 flex gap-3 text-xs font-mono"
          >
            <span className={validation.checks.minLen ? 'text-[var(--br-neon-cyan)]' : 'text-[var(--br-dust-gray)]'}>
              {validation.checks.minLen ? '[OK]' : '[--]'} 8+ chars
            </span>
            <span className={validation.checks.hasLetter ? 'text-[var(--br-neon-cyan)]' : 'text-[var(--br-dust-gray)]'}>
              {validation.checks.hasLetter ? '[OK]' : '[--]'} letra
            </span>
            <span className={validation.checks.hasNumber ? 'text-[var(--br-neon-cyan)]' : 'text-[var(--br-dust-gray)]'}>
              {validation.checks.hasNumber ? '[OK]' : '[--]'} número
            </span>
          </motion.div>
        )}
      </div>

      {/* Confirm Password */}
      <div>
        <label className="block text-xs font-mono text-[var(--br-muted-cyan)] mb-2 uppercase tracking-wider">
          {'>'} Confirmar Código
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--br-dust-gray)]" />
          <input
            type={showConfirm ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repita o código"
            className={cn(inputClass, 'pr-10')}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--br-dust-gray)] hover:text-[var(--br-muted-cyan)]"
          >
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {confirmPassword.length > 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn('mt-2 text-xs font-mono', password === confirmPassword ? 'text-[var(--br-neon-cyan)]' : 'text-[var(--br-neon-pink)]')}
          >
            {password === confirmPassword ? '[OK] códigos correspondem' : '[!] códigos não correspondem'}
          </motion.p>
        )}
      </div>

      {/* Whitelabel: Logo (opcional) — upload de imagem ou URL */}
      <LogoUploader
        value={brandLogoUrl}
        onChange={setBrandLogoUrl}
        variant="installer"
        label="Logo (opcional)"
      />

      {/* Whitelabel: Cor primária (opcional) */}
      <div>
        <label className="block text-xs font-mono text-[var(--br-muted-cyan)] mb-2 uppercase tracking-wider">
          {'>'} Cor primária
        </label>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(brandPrimaryColor) ? brandPrimaryColor : '#10b981'}
              onChange={(e) => setBrandPrimaryColor(e.target.value)}
              aria-label="Cor primária da marca"
              className="h-11 w-14 cursor-pointer rounded-lg border border-[var(--br-dust-gray)]/50 bg-[var(--br-void-black)]/80 p-1"
            />
          </div>
          <div className="relative flex-1">
            <Palette className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--br-dust-gray)]" />
            <input
              type="text"
              value={brandPrimaryColor}
              onChange={(e) => setBrandPrimaryColor(e.target.value)}
              placeholder="#10b981"
              className={inputClass}
            />
          </div>
          {/* Preview */}
          <div
            className="h-11 w-11 shrink-0 rounded-lg border border-[var(--br-dust-gray)]/50"
            style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(brandPrimaryColor) ? brandPrimaryColor : '#10b981' }}
            aria-hidden="true"
            title="Preview da cor"
          />
        </div>
        <p className="mt-1 text-[10px] font-mono text-[var(--br-dust-gray)]">
          Default: #10b981 (emerald)
        </p>
      </div>

      {/* Error */}
      {error && (
        <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-mono text-[var(--br-neon-pink)] text-center">
          {'! '}{error}
        </motion.p>
      )}

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        className={cn(
          'w-full font-mono uppercase tracking-wider',
          'bg-[var(--br-neon-cyan)] hover:bg-[var(--br-neon-cyan)]/80',
          'text-[var(--br-void-black)] font-bold',
          'shadow-[0_0_20px_var(--br-neon-cyan)/0.4]',
          'hover:shadow-[0_0_30px_var(--br-neon-cyan)/0.6]',
          'transition-all duration-200'
        )}
        disabled={!name.trim() || !isValidEmail(email) || !validation.valid || password !== confirmPassword}
      >
        Registrar Baseline
      </Button>
    </form>
  );
}
