'use client';

import {
  useState,
  useRef,
  useEffect,
  ClipboardEvent,
  InputHTMLAttributes,
  forwardRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  EyeOff,
  Loader2,
  Check,
  X,
  ClipboardPaste,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TokenInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  validating?: boolean;
  success?: boolean;
  error?: string;
  minLength?: number;
  autoSubmitLength?: number;
  onAutoSubmit?: () => void;
  showCharCount?: boolean;
  accentColor?: 'cyan' | 'magenta' | 'orange' | 'red' | 'purple';
  /** Se false, mostra texto claro (para URLs). Default: true */
  masked?: boolean;
}

// Cores base do tema Blade Runner
const accentColorStyles = {
  cyan: {
    focus: 'focus-within:border-[var(--br-neon-cyan)] focus-within:shadow-[0_0_15px_var(--br-neon-cyan)/0.3]',
    validating: 'border-[var(--br-neon-cyan)]/50',
    success: 'border-[var(--br-neon-cyan)] bg-[var(--br-neon-cyan)]/10',
    icon: 'text-[var(--br-neon-cyan)]',
  },
  magenta: {
    focus: 'focus-within:border-[var(--br-neon-magenta)] focus-within:shadow-[0_0_15px_var(--br-neon-magenta)/0.3]',
    validating: 'border-[var(--br-neon-magenta)]/50',
    success: 'border-[var(--br-neon-magenta)] bg-[var(--br-neon-magenta)]/10',
    icon: 'text-[var(--br-neon-magenta)]',
  },
  orange: {
    focus: 'focus-within:border-[var(--br-neon-orange)] focus-within:shadow-[0_0_15px_var(--br-neon-orange)/0.3]',
    validating: 'border-[var(--br-neon-orange)]/50',
    success: 'border-[var(--br-neon-orange)] bg-[var(--br-neon-orange)]/10',
    icon: 'text-[var(--br-neon-orange)]',
  },
  red: {
    focus: 'focus-within:border-[var(--br-neon-pink)] focus-within:shadow-[0_0_15px_var(--br-neon-pink)/0.3]',
    validating: 'border-[var(--br-neon-pink)]/50',
    success: 'border-[var(--br-neon-pink)] bg-[var(--br-neon-pink)]/10',
    icon: 'text-[var(--br-neon-pink)]',
  },
};

// Mapeamento de cores antigas para o tema Blade Runner
const colorMap: Record<string, keyof typeof accentColorStyles> = {
  cyan: 'cyan',
  magenta: 'magenta',
  orange: 'orange',
  red: 'red',
  purple: 'cyan', // purple → cyan (compatibility)
};

// Função para obter cores resolvidas
const getAccentColors = (color: string) => accentColorStyles[colorMap[color] || 'cyan'];

/**
 * Input especializado para tokens - Tema Blade Runner.
 * Terminal-style com glow neon.
 */
export const TokenInput = forwardRef<HTMLInputElement, TokenInputProps>(
  function TokenInput(
    {
      value,
      onChange,
      label,
      placeholder = '> aguardando entrada...',
      validating = false,
      success = false,
      error,
      minLength = 20,
      autoSubmitLength,
      onAutoSubmit,
      showCharCount = true,
      accentColor = 'cyan',
      masked = true,
      disabled,
      className,
      ...props
    },
    ref
  ) {
    const [showValue, setShowValue] = useState(false);
    const [justPasted, setJustPasted] = useState(false);
    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (ref as React.RefObject<HTMLInputElement>) || internalRef;

    const colors = getAccentColors(accentColor);

    // Auto-submit quando atingir tamanho
    useEffect(() => {
      if (
        autoSubmitLength &&
        value.length >= autoSubmitLength &&
        !validating &&
        !error &&
        !success &&
        onAutoSubmit
      ) {
        const timer = setTimeout(onAutoSubmit, 800);
        return () => clearTimeout(timer);
      }
    }, [value, autoSubmitLength, validating, error, success, onAutoSubmit]);

    // Feedback visual de paste
    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
      setJustPasted(true);
      setTimeout(() => setJustPasted(false), 1500);
    };

    const isError = !!error;
    const isDisabled = disabled || validating || success;

    return (
      <div className={cn('relative', className)}>
        {/* Label */}
        {label && (
          <label className="block text-xs font-mono text-[var(--br-muted-cyan)] mb-2 uppercase tracking-wider">
            {'> '}{label}
          </label>
        )}

        {/* Input container */}
        <motion.div
          animate={
            isError
              ? {
                  x: [-4, 4, -4, 4, -2, 2, 0],
                  transition: { duration: 0.4 },
                }
              : value.length === 0 && !validating && !success
                ? {
                    borderColor: [
                      'rgba(16, 185, 129, 0.2)',
                      'rgba(16, 185, 129, 0.5)',
                      'rgba(16, 185, 129, 0.2)',
                    ],
                    transition: {
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                  }
                : {}
          }
          className={cn(
            'relative flex items-center gap-2',
            'px-4 py-3 rounded-lg',
            'bg-[var(--br-void-black)]/80 border',
            'transition-all duration-200',
            // Default state
            !isError &&
              !success &&
              !validating &&
              'border-[var(--br-dust-gray)]/50',
            !isError && !success && !validating && colors.focus,
            // Validating
            validating && colors.validating,
            validating && 'animate-pulse',
            // Success
            success && colors.success,
            // Error
            isError &&
              'border-[var(--br-neon-pink)] bg-[var(--br-neon-pink)]/10 shadow-[0_0_15px_var(--br-neon-pink)/0.3]'
          )}
        >
          {/* Terminal prompt */}
          <span className="text-[var(--br-neon-cyan)] font-mono text-sm">{'>'}</span>

          <input
            ref={inputRef}
            type={!masked || showValue ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={isDisabled}
            className={cn(
              'flex-1 bg-transparent outline-none',
              'text-[var(--br-hologram-white)] placeholder:text-[var(--br-dust-gray)]',
              'font-mono text-sm',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            {...props}
          />

          {/* Cursor blink when empty */}
          {value.length === 0 && !validating && !success && (
            <span className="br-cursor text-[var(--br-neon-cyan)] font-mono">_</span>
          )}

          {/* Status icons */}
          <AnimatePresence mode="wait">
            {validating && (
              <motion.div
                key="validating"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Loader2
                  className={cn('w-5 h-5 animate-spin', colors.icon)}
                />
              </motion.div>
            )}
            {success && !validating && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Check className={cn('w-5 h-5', colors.icon)} />
              </motion.div>
            )}
            {isError && !validating && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <X className="w-5 h-5 text-[var(--br-neon-pink)]" />
              </motion.div>
            )}
            {masked && !validating && !success && !isError && value.length > 0 && (
              <motion.button
                key="toggle"
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="text-[var(--br-dust-gray)] hover:text-[var(--br-muted-cyan)] transition-colors p-1"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                {showValue ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Bottom row: paste indicator / error / char count */}
        <div className="flex items-center justify-between mt-2 min-h-[20px]">
          {/* Paste indicator */}
          <AnimatePresence>
            {justPasted && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  'flex items-center gap-1 text-xs font-mono',
                  colors.icon
                )}
              >
                <ClipboardPaste className="w-3 h-3" />
                dados recebidos
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error message */}
          <AnimatePresence>
            {error && !justPasted && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="text-xs font-mono text-[var(--br-neon-pink)]"
              >
                {'! '}{error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Spacer */}
          {!justPasted && !error && <div />}

          {/* Character counter */}
          {showCharCount && value.length > 0 && !success && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                'text-xs font-mono',
                value.length >= minLength
                  ? 'text-[var(--br-neon-cyan)]'
                  : 'text-[var(--br-dust-gray)]'
              )}
            >
              [{value.length}/{minLength}+]
            </motion.span>
          )}
        </div>
      </div>
    );
  }
);
