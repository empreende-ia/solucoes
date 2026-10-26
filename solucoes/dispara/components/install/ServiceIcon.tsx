'use client';

import { motion } from 'framer-motion';
import {
  User,
  Triangle,
  Database,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ServiceType =
  | 'identity'
  | 'vercel'
  | 'supabase';

interface ServiceIconProps {
  service: ServiceType;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  className?: string;
}

interface ServiceConfig {
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
}

const serviceConfig: Record<ServiceType, ServiceConfig> = {
  identity: {
    icon: User,
    color: 'text-slate-300',
    bgColor: 'bg-slate-800/80',
    borderColor: 'border-slate-700/50',
  },
  vercel: {
    icon: Triangle,
    color: 'text-white',
    bgColor: 'bg-slate-800/80',
    borderColor: 'border-slate-700/50',
  },
  supabase: {
    icon: Database,
    color: 'text-primary-400',
    bgColor: 'bg-primary-500/10',
    borderColor: 'border-primary-500/20',
  },
};

const sizes = {
  sm: {
    container: 'w-10 h-10 rounded-xl',
    icon: 'w-5 h-5',
  },
  md: {
    container: 'w-14 h-14 rounded-xl',
    icon: 'w-7 h-7',
  },
  lg: {
    container: 'w-18 h-18 rounded-2xl',
    icon: 'w-9 h-9',
  },
  xl: {
    container: 'w-20 h-20 rounded-2xl',
    icon: 'w-10 h-10',
  },
};

/**
 * Ícone de serviço com cores e animações específicas.
 *
 * Serviços:
 * - identity: User icon (slate)
 * - vercel: Triangle icon (white)
 * - supabase: Database icon (purple)
 */
export function ServiceIcon({
  service,
  size = 'md',
  animated = true,
  className,
}: ServiceIconProps) {
  const config = serviceConfig[service];
  const Icon = config.icon;
  const sizeConfig = sizes[size];

  return (
    <motion.div
      initial={animated ? { opacity: 0, scale: 0.8 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 20,
      }}
      className={cn(
        'flex items-center justify-center',
        sizeConfig.container,
        config.bgColor,
        'border',
        config.borderColor,
        className
      )}
    >
      <Icon className={cn(sizeConfig.icon, config.color)} />
    </motion.div>
  );
}

/**
 * Retorna a cor de glow correspondente ao serviço.
 * Útil para StepCard.
 */
export function getServiceGlowColor(
  service: ServiceType
): 'purple' | 'blue' | 'orange' | 'red' | 'slate' {
  switch (service) {
    case 'supabase':
      return 'purple';
    default:
      return 'slate';
  }
}
