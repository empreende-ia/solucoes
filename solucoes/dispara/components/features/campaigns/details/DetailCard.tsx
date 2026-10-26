'use client';

import React from 'react';
import { Container } from '@/components/ui/container';
import { DetailCardProps } from './types';

export const DetailCard: React.FC<DetailCardProps> = ({
  title,
  value,
  subvalue,
  icon: Icon,
  color,
  onClick,
  isActive,
}) => (
  <Container
    variant="glass"
    padding="lg"
    hover={!!onClick}
    onClick={onClick}
    className={`border-l-4 ${onClick ? 'cursor-pointer' : 'cursor-default'} ${isActive ? 'ring-2 ring-[var(--ds-border-strong)] bg-[var(--ds-bg-hover)]' : ''}`}
    style={{ borderLeftColor: color }}
  >
    <div className="flex justify-between items-start mb-2">
      <div>
        <p className="text-sm text-[var(--ds-text-secondary)] font-medium">{title}</p>
        <h3 className="text-3xl font-bold text-[var(--ds-text-primary)] mt-1">{value}</h3>
      </div>
      <div className="p-2 rounded-lg bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)]">
        <Icon size={20} color={color} />
      </div>
    </div>
    <p className="text-xs text-[var(--ds-text-muted)]">{subvalue}</p>
  </Container>
);
