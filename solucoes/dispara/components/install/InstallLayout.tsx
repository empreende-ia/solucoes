'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { StepDots } from './StepDots';
import { CorporateBackground } from '@/components/brand/CorporateBackground';
import { cn } from '@/lib/utils';

interface InstallLayoutProps {
  children: ReactNode;
  currentStep?: number;
  totalSteps?: number;
  showLogo?: boolean;
  showDots?: boolean;
  className?: string;
}

/**
 * Layout principal do wizard de instalação.
 * Visual corporativo, dark, on-brand (emerald): grade sutil + auroras + vinheta.
 */
export function InstallLayout({
  children,
  currentStep = 1,
  totalSteps = 3,
  showLogo = true,
  showDots = true,
  className,
}: InstallLayoutProps) {
  return (
    <div
      className={cn(
        'dark',
        'min-h-screen flex flex-col items-center justify-center p-4',
        'bg-[var(--br-void-black)]',
        'relative overflow-hidden',
        className
      )}
    >
      {/* Fundo corporativo (grade + auroras emerald + vinheta) */}
      <CorporateBackground />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        {/* Logo */}
        {showLogo && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-8 text-center"
          >
            <h1 className="text-2xl font-extrabold tracking-tight lowercase text-[var(--br-hologram-white)]">
              dispara<span className="text-primary-500">.</span>
            </h1>
            <p className="text-xs tracking-[0.3em] text-[var(--br-muted-cyan)] mt-2 uppercase">
              Protocolo de Inicialização
            </p>
          </motion.div>
        )}

        {/* Step Dots */}
        {showDots && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="mb-8"
          >
            <StepDots current={currentStep} total={totalSteps} />
          </motion.div>
        )}

        {/* Main Content */}
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}
