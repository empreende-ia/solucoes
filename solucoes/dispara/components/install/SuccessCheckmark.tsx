'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

interface SuccessCheckmarkProps {
  onComplete?: () => void;
  delay?: number;
  message?: string;
  className?: string;
}

/**
 * Animação de checkmark após validação bem-sucedida.
 * Tema Blade Runner - "Autenticidade confirmada"
 */
export function SuccessCheckmark({
  onComplete,
  delay = 2500,
  message = 'Validado com sucesso!',
  className,
}: SuccessCheckmarkProps) {
  useEffect(() => {
    if (onComplete) {
      const timer = setTimeout(() => {
        onComplete();
      }, delay);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [onComplete, delay]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        'flex flex-col items-center justify-center py-8',
        className
      )}
    >
      {/* Circle with checkmark */}
      <div className="relative">
        {/* Glow ring expanding - cyan */}
        <motion.div
          className="absolute inset-0 rounded-full bg-[var(--br-neon-cyan)]/30"
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{
            scale: [1, 1.8, 1.8],
            opacity: [0.5, 0, 0],
          }}
          transition={{
            duration: 1.5,
            times: [0, 0.5, 1],
            repeat: 2,
            repeatDelay: 0.4,
          }}
        />

        {/* Circle background */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 20,
          }}
          className={cn(
            'w-20 h-20 rounded-full',
            'bg-[var(--br-neon-cyan)]/20',
            'border-2 border-[var(--br-neon-cyan)]',
            'flex items-center justify-center',
            'shadow-[0_0_30px_var(--br-neon-cyan)/0.4]'
          )}
        >
          {/* Checkmark icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <Check
              className="w-10 h-10 text-[var(--br-neon-cyan)]"
              strokeWidth={3}
            />
          </motion.div>
        </motion.div>
      </div>

      {/* Success message */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="mt-4 text-lg font-mono font-medium text-[var(--br-hologram-white)]"
      >
        {message}
      </motion.p>

      {/* Progress bar with glow */}
      <motion.div
        className="mt-4 h-1 bg-[var(--br-dust-gray)]/30 rounded-full overflow-hidden w-32"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        <motion.div
          className="h-full bg-gradient-to-r from-[var(--br-neon-cyan)] to-[var(--br-neon-magenta)]"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: delay / 1000, ease: 'linear' }}
        />
      </motion.div>
    </motion.div>
  );
}
