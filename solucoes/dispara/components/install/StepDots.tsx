'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StepDotsProps {
  current: number;
  total: number;
  completedSteps?: number[];
  className?: string;
}

/**
 * Indicador de progresso estilo Blade Runner.
 * Dots com glow neon cyan.
 */
export function StepDots({
  current,
  total,
  completedSteps = [],
  className,
}: StepDotsProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {Array.from({ length: total }).map((_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isCompleted = completedSteps.includes(stepNum) || stepNum < current;

        return (
          <motion.div
            key={i}
            className="relative"
            animate={{ scale: isActive ? 1.3 : 1 }}
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 30,
            }}
          >
            {/* Pulse ring para step ativo */}
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-full bg-[var(--br-neon-cyan)]"
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{
                  scale: [1, 2.5, 1],
                  opacity: [0.5, 0, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            )}

            {/* Dot */}
            <motion.div
              className={cn(
                'w-2.5 h-2.5 rounded-full transition-colors duration-300 relative z-10',
                isActive && 'bg-[var(--br-neon-cyan)] shadow-[0_0_8px_var(--br-neon-cyan)]',
                isCompleted && !isActive && 'bg-[var(--br-neon-cyan)]/50',
                !isActive && !isCompleted && 'bg-[var(--br-dust-gray)]'
              )}
              initial={false}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
