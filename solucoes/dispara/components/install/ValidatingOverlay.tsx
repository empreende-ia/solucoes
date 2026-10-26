'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ValidatingOverlayProps {
  isVisible: boolean;
  message: string;
  subMessage?: string;
  className?: string;
}

/**
 * Overlay que aparece durante validação de tokens.
 * Tema Blade Runner - "Voight-Kampff em progresso"
 */
export function ValidatingOverlay({
  isVisible,
  message,
  subMessage,
  className,
}: ValidatingOverlayProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'absolute inset-0 z-20',
            'flex flex-col items-center justify-center',
            'bg-[var(--br-void-black)]/95 backdrop-blur-sm',
            'rounded-2xl',
            className
          )}
        >
          {/* Spinner cyberpunk - círculos concêntricos */}
          <div className="relative w-16 h-16 mb-4">
            {/* Outer ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-2 border-[var(--br-neon-cyan)]/30 border-t-[var(--br-neon-cyan)]"
            />
            {/* Middle ring */}
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-2 rounded-full border-2 border-[var(--br-neon-magenta)]/30 border-b-[var(--br-neon-magenta)]"
            />
            {/* Inner ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-4 rounded-full border-2 border-[var(--br-neon-cyan)]/30 border-t-[var(--br-neon-cyan)]"
            />
            {/* Center dot */}
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-[var(--br-neon-cyan)]"
            />
          </div>

          {/* Main message */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-[var(--br-hologram-white)] font-mono font-medium text-center uppercase tracking-wide"
          >
            {message}
          </motion.p>

          {/* Sub message */}
          {subMessage && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-sm text-[var(--br-muted-cyan)] font-mono mt-1 text-center"
            >
              {subMessage}
            </motion.p>
          )}

          {/* Scanning line effect */}
          <div className="w-32 h-1 mt-5 rounded-full overflow-hidden bg-[var(--br-dust-gray)]/30">
            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="w-1/3 h-full bg-gradient-to-r from-transparent via-[var(--br-neon-cyan)] to-transparent"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
