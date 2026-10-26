'use client';

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import {
    Megaphone,
    Wrench,
    VenetianMask, // Ninja/Mask for Bypass
    CheckCircle2,
    Star,
    AlertTriangle
} from 'lucide-react';

export type AIStrategy = 'marketing' | 'utility' | 'bypass';

interface StrategySelectorModalProps {
    isOpen: boolean;
    onSelect: (strategy: AIStrategy) => void;
    onClose?: () => void;
}

export function StrategySelectorModal({ isOpen, onSelect, onClose }: StrategySelectorModalProps) {
    const strategies = [
        {
            id: 'marketing' as const,
            title: 'Marketing',
            subtitle: 'Vendas Diretas',
            icon: Megaphone,
            // Dourado vibrante
            cardStyle: 'bg-gradient-to-b from-amber-900/40 to-amber-950/60 border-amber-500/40 hover:border-amber-400/60',
            iconStyle: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
            checkStyle: 'text-amber-400',
            description: 'Foco total em conversão. Usa gatilhos mentais, urgência e copy persuasiva.',
            features: ['Categoria: MARKETING', 'Alta Conversão', 'Permite Promoções'],
            warning: 'Custo mais alto por mensagem.',
            warningStyle: 'text-amber-300',
            badge: null
        },
        {
            id: 'utility' as const,
            title: 'Utilidade',
            subtitle: 'Recomendado',
            icon: Wrench,
            // Verde esmeralda forte
            cardStyle: 'bg-gradient-to-b from-primary-900/40 to-primary-950/60 border-primary-500/40 hover:border-primary-400/60',
            iconStyle: 'bg-primary-500/20 text-primary-400 border-primary-500/30',
            checkStyle: 'text-primary-400',
            description: 'Foco em avisos e notificações. Linguagem formal, seca e direta.',
            features: ['Categoria: UTILITY', 'Avisos Transacionais', 'Sem bloqueios'],
            warning: 'Proibido termos de venda.',
            warningStyle: 'text-primary-300',
            badge: { icon: Star, text: 'Padrão', style: 'bg-primary-500/20 text-primary-400 border-primary-500/40' }
        },
        {
            id: 'bypass' as const,
            title: 'Camuflado',
            subtitle: 'Marketing Disfarçado',
            icon: VenetianMask,
            // Roxo/cinza misterioso
            cardStyle: 'bg-gradient-to-b from-violet-900/30 to-slate-900/60 border-violet-500/30 hover:border-violet-400/50',
            iconStyle: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
            checkStyle: 'text-violet-400',
            description: 'Tenta passar copy de vendas como Utilidade usando substituição de variáveis.',
            features: ['Categoria: UTILITY (Tentativa)', 'Custo Baixo', 'Anti-Spam AI'],
            warning: 'Pode ser rejeitado se abusar.',
            warningStyle: 'text-orange-300',
            badge: { icon: AlertTriangle, text: 'Avançado', style: 'bg-orange-500/20 text-orange-400 border-orange-500/40' }
        }
    ];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] text-[var(--ds-text-primary)] rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
                <DialogHeader>
                    <DialogTitle className="text-2xl text-center">Como você deseja criar seus templates?</DialogTitle>
                    <DialogDescription className="text-center text-[var(--ds-text-secondary)]">
                        Escolha a "personalidade" da IA para este projeto.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    {strategies.map((strategy) => (
                        <div
                            key={strategy.id}
                            onClick={() => {
                                onSelect(strategy.id);
                            }}
                            className={`
                                relative p-6 rounded-2xl border cursor-pointer transition-all hover:shadow-[0_12px_30px_rgba(0,0,0,0.35)] hover:scale-[1.02]
                                ${strategy.cardStyle}
                            `}
                        >
                            {/* Badge no canto superior direito */}
                            {strategy.badge && (
                                <div className={`absolute -top-2 -right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${strategy.badge.style}`}>
                                    <strategy.badge.icon className="w-3 h-3" />
                                    {strategy.badge.text}
                                </div>
                            )}

                            <div className="flex flex-col items-center text-center gap-4">
                                <div className={`p-4 rounded-full border ${strategy.iconStyle}`}>
                                    <strategy.icon className="w-8 h-8" />
                                </div>

                                <div>
                                    <h3 className="font-bold text-lg text-[var(--ds-text-primary)]">{strategy.title}</h3>
                                    <p className="text-xs text-[var(--ds-text-secondary)] font-medium">{strategy.subtitle}</p>
                                    <p className="text-sm text-[var(--ds-text-secondary)] mt-2">{strategy.description}</p>
                                </div>

                                <ul className="text-sm text-left w-full space-y-2 mt-2 bg-[var(--ds-bg-surface)]/30 p-3 rounded-lg border border-[var(--ds-border-subtle)]">
                                    {strategy.features.map((feat, i) => (
                                        <li key={i} className="flex items-center gap-2 text-[var(--ds-text-secondary)]">
                                            <CheckCircle2 className={`w-4 h-4 shrink-0 ${strategy.checkStyle}`} />
                                            {feat}
                                        </li>
                                    ))}
                                </ul>

                                {strategy.warning && (
                                    <p className={`text-xs font-semibold mt-2 ${strategy.warningStyle}`}>
                                        {strategy.warning}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
