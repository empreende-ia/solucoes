'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import { ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

type GlowColor = 'cyan' | 'magenta' | 'orange' | 'red' | 'purple' | 'slate' | 'blue';

interface StepCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  glowColor?: GlowColor;
}

// Map de cores antigas para novas (Blade Runner theme)
const colorMap: Record<GlowColor, 'cyan' | 'magenta' | 'orange' | 'red'> = {
  cyan: 'cyan',
  magenta: 'magenta',
  orange: 'orange',
  red: 'red',
  purple: 'cyan',   // purple → cyan (success color)
  slate: 'cyan',      // slate → cyan (neutral color)
  blue: 'cyan',      // blue → cyan
};

/**
 * Card principal de cada step - Tema Blade Runner.
 *
 * Características:
 * - Borda com gradiente neon (cyan → magenta)
 * - Background escuro translúcido
 * - Glow neon configurável
 */
export const StepCard = forwardRef<HTMLDivElement, StepCardProps>(
  function StepCard({ children, className, glowColor = 'cyan', ...props }, ref) {
    // Resolve cor para o tema Blade Runner
    const resolvedColor = colorMap[glowColor];

    const glowStyles: Record<'cyan' | 'magenta' | 'orange' | 'red', string> = {
      cyan: 'shadow-[0_0_30px_-10px_var(--br-neon-cyan)]',
      magenta: 'shadow-[0_0_30px_-10px_var(--br-neon-magenta)]',
      orange: 'shadow-[0_0_30px_-10px_var(--br-neon-orange)]',
      red: 'shadow-[0_0_30px_-10px_var(--br-neon-pink)]',
    };

    const borderColors: Record<'cyan' | 'magenta' | 'orange' | 'red', string> = {
      cyan: 'border-[var(--br-neon-cyan)]/30',
      magenta: 'border-[var(--br-neon-magenta)]/30',
      orange: 'border-[var(--br-neon-orange)]/30',
      red: 'border-[var(--br-neon-pink)]/30',
    };

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
        }}
        className={cn(
          // Base
          'relative p-6 sm:p-8 rounded-2xl',
          // Background
          'bg-[var(--br-deep-navy)]/80 backdrop-blur-xl',
          // Border
          'border',
          borderColors[resolvedColor],
          // Glow
          glowStyles[resolvedColor],
          // Transition
          'transition-all duration-300',
          // Custom
          className
        )}
        {...props}
      >
        {/* Gradient border effect (top line) */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--br-neon-cyan)] to-transparent rounded-t-2xl opacity-50" />

        {/* Corner accents */}
        <div className="absolute top-2 left-2 w-3 h-3 border-l border-t border-[var(--br-neon-cyan)]/50" />
        <div className="absolute top-2 right-2 w-3 h-3 border-r border-t border-[var(--br-neon-cyan)]/50" />
        <div className="absolute bottom-2 left-2 w-3 h-3 border-l border-b border-[var(--br-neon-magenta)]/50" />
        <div className="absolute bottom-2 right-2 w-3 h-3 border-r border-b border-[var(--br-neon-magenta)]/50" />

        {children}
      </motion.div>
    );
  }
);
