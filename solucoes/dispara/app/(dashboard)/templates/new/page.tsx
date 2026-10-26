'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { VenetianMask, Megaphone, Wrench, Sparkles, ArrowLeft, ArrowRight, Wand2, Loader2, Check, Save, AlertCircle, CheckSquare, Square, Pencil, FileText, Brain, Zap, RotateCcw } from 'lucide-react';
import { useTemplateProjectMutations } from '@/hooks/useTemplateProjects';
import { toast } from 'sonner';
import { GeneratedTemplate } from '@/lib/ai/services/template-agent';
import { templateService } from '@/lib/whatsapp/template.service';
import { Page, PageHeader } from '@/components/ui/page';

// Tipos
type AIStrategy = 'marketing' | 'utility' | 'bypass';
type Step = 'paste' | 'extract' | 'strategy' | 'config' | 'generating' | 'review';

interface ExtractedContent {
    productName: string;
    productType: 'evento' | 'curso' | 'produto' | 'servico' | 'outro';
    author?: string;
    date?: string;
    time?: string;
    duration?: string;
    deadline?: string;
    price?: string;
    originalPrice?: string;
    discount?: string;
    paymentOptions?: string;
    mainBenefit: string;
    benefits: string[];
    bonuses?: string[];
    guarantee?: string;
    targetAudience?: string;
    mainCTA: string;
    url?: string;
    summary: string;
    confidence: number;
}

// Configuração das estratégias
const STRATEGY_CONFIG: Record<AIStrategy, {
    icon: React.ElementType;
    label: string;
    description: string;
    color: string;
    bgColor: string;
    borderColor: string;
    when: string;
}> = {
    marketing: {
        icon: Megaphone,
        label: 'Marketing',
        description: 'Texto promocional direto com emojis e urgência',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30 hover:border-amber-500/60',
        when: 'Quando você quer promoção direta e explícita'
    },
    utility: {
        icon: Wrench,
        label: 'Utilidade',
        description: 'Confirmações, lembretes e atualizações transacionais',
        color: 'text-primary-400',
        bgColor: 'bg-primary-500/10',
        borderColor: 'border-primary-500/30 hover:border-primary-500/60',
        when: 'Quando é uma mensagem transacional real (confirmação, status)'
    },
    bypass: {
        icon: VenetianMask,
        label: 'Camuflado',
        description: 'Texto neutro que parece notificação, marketing nas variáveis',
        color: 'text-violet-400',
        bgColor: 'bg-violet-500/10',
        borderColor: 'border-violet-500/30 hover:border-violet-500/60',
        when: 'Quando quer promover mas precisa parecer utilidade para a Meta'
    }
};

export default function NewTemplateProjectPage() {
    const router = useRouter();
    const { createProject, isCreating } = useTemplateProjectMutations();

    // Step control
    const [step, setStep] = useState<Step>('paste');

    // Step 1: Paste
    const [rawContent, setRawContent] = useState('');

    // Step 2: Extract
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractedContent, setExtractedContent] = useState<ExtractedContent | null>(null);
    const [suggestedPrompt, setSuggestedPrompt] = useState('');

    // Step 3: Strategy
    const [strategy, setStrategy] = useState<AIStrategy | null>(null);

    // Step 4: Config
    const [prompt, setPrompt] = useState('');
    const [quantity, setQuantity] = useState(5);
    const [language, setLanguage] = useState('pt_BR');
    const [universalUrl, setUniversalUrl] = useState('');

    // Step 5: Review
    const [generatedTemplates, setGeneratedTemplates] = useState<GeneratedTemplate[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [projectTitle, setProjectTitle] = useState('');
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    // Valores de exemplo para preview
    const DEFAULT_EXAMPLE_VALUES: Record<string, string> = {
        '1': 'João Silva', '2': 'Pedido #12345', '3': '25/01/2025',
        '4': 'R$ 199,90', '5': '10:00', '6': 'Produto XYZ',
    };

    const fillVariables = (text: string, templateVariables?: Record<string, string>): string => {
        return text.replace(/\{\{(\d+)\}\}/g, (_, num) => {
            return templateVariables?.[num] || DEFAULT_EXAMPLE_VALUES[num] || `[Variável ${num}]`;
        });
    };

    const getPreviewVariables = (template: GeneratedTemplate): Record<string, string> | undefined => {
        return template.marketing_variables || template.variables;
    };

    // ========================================================================
    // HANDLERS
    // ========================================================================

    // Step 1 -> 2: Extrair conteúdo
    const handleExtract = async () => {
        if (rawContent.length < 50) {
            toast.error('Cole mais conteúdo (mínimo 50 caracteres)');
            return;
        }

        setIsExtracting(true);
        try {
            const response = await fetch('/api/ai/extract-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: rawContent, language })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Falha na extração');
            }

            setExtractedContent(data.extracted);
            setSuggestedPrompt(data.suggestedPrompt);
            setPrompt(data.suggestedPrompt);

            // Pré-preencher URL se detectada
            if (data.extracted.url) {
                setUniversalUrl(data.extracted.url);
            }

            // Pré-preencher título do projeto
            setProjectTitle(data.extracted.productName || '');

            setStep('extract');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Erro ao extrair conteúdo');
        } finally {
            setIsExtracting(false);
        }
    };

    // Step 2 -> 3: Ir para estratégia
    const handleGoToStrategy = () => {
        setStep('strategy');
    };

    // Step 3 -> 4: Selecionar estratégia
    const handleSelectStrategy = (selected: AIStrategy) => {
        setStrategy(selected);
        setStep('config');
    };

    // Step 4 -> 5: Gerar templates
    const handleGenerate = async () => {
        if (!prompt) return toast.error('Digite um comando para a IA');
        if (!strategy) return toast.error('Selecione uma estratégia');

        setStep('generating');
        try {
            const response = await templateService.generateUtilityTemplates({
                prompt,
                quantity,
                language: language as 'pt_BR' | 'en_US' | 'es_ES',
                strategy
            });

            let templates = response.templates;

            // Apply universal URL if provided
            if (universalUrl && templates) {
                templates = templates.map(t => ({
                    ...t,
                    buttons: t.buttons?.map(b => ({
                        ...b,
                        url: b.type === 'URL' ? universalUrl : b.url
                    }))
                }));
            }

            setGeneratedTemplates(templates);
            const valid = templates.filter(t => !t.judgment || t.judgment.approved || t.wasFixed);
            setSelectedIds(new Set(valid.map(t => t.id)));

            if (!projectTitle.trim() && extractedContent?.productName) {
                setProjectTitle(extractedContent.productName);
            }

            setStep('review');
        } catch (error) {
            console.error(error);
            toast.error('Erro ao gerar templates');
            setStep('config');
        }
    };

    // Step 5: Salvar projeto
    const handleSaveProject = async () => {
        if (selectedIds.size === 0) return toast.error('Selecione pelo menos um template');
        if (!projectTitle.trim()) return toast.error('Digite um nome para o projeto');

        try {
            const selected = generatedTemplates.filter(t => selectedIds.has(t.id));

            await createProject({
                title: projectTitle.trim(),
                prompt: prompt,
                status: 'draft',
                strategy: strategy || 'utility',
                items: selected.map(t => ({
                    name: t.name,
                    content: t.content,
                    header: t.header,
                    footer: t.footer,
                    buttons: t.buttons,
                    language: t.language || language,
                    category: t.category,
                    sample_variables: t.sample_variables,
                    marketing_variables: t.marketing_variables,
                    meta_status: undefined
                }))
            });
        } catch {
            // Error handled by mutation
        }
    };

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === generatedTemplates.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(generatedTemplates.map(t => t.id)));
        }
    };

    // Reset para início
    const handleReset = () => {
        setStep('paste');
        setRawContent('');
        setExtractedContent(null);
        setSuggestedPrompt('');
        setStrategy(null);
        setPrompt('');
        setUniversalUrl('');
        setGeneratedTemplates([]);
        setSelectedIds(new Set());
        setProjectTitle('');
    };

    // ========================================================================
    // RENDER
    // ========================================================================

    // Progress indicator
    const steps = [
        { key: 'paste', label: 'Colar', icon: FileText },
        { key: 'extract', label: 'Extrair', icon: Brain },
        { key: 'strategy', label: 'Estratégia', icon: Zap },
        { key: 'config', label: 'Configurar', icon: Sparkles },
        { key: 'review', label: 'Revisar', icon: Check },
    ];

    const currentStepIndex = steps.findIndex(s => s.key === step || (step === 'generating' && s.key === 'config'));

    return (
        <Page>
            <PageHeader>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/templates?tab=projects')}
                        className="p-2 rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>

                    {step === 'review' ? (
                        <div className="flex items-center gap-2 group">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] hover:border-primary-500/50 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500/30 transition-all">
                                <input
                                    type="text"
                                    value={projectTitle}
                                    onChange={(e) => setProjectTitle(e.target.value)}
                                    placeholder="Nome do projeto..."
                                    className="text-xl font-semibold bg-transparent border-none outline-none text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] min-w-[250px] focus:ring-0"
                                />
                                <Pencil className="w-4 h-4 text-[var(--ds-text-muted)] opacity-50 group-hover:opacity-100 transition-opacity shrink-0" />
                            </div>
                        </div>
                    ) : (
                        <h1 className="text-xl font-semibold text-[var(--ds-text-primary)]">
                            Novo Projeto de Templates
                        </h1>
                    )}

                    {strategy && (
                        <Badge variant="outline" className="ml-2 gap-2 py-1 px-3 border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]">
                            {strategy === 'marketing' && <Megaphone className="w-3 h-3" />}
                            {strategy === 'utility' && <Wrench className="w-3 h-3" />}
                            {strategy === 'bypass' && <VenetianMask className="w-3 h-3" />}
                            {strategy.toUpperCase()}
                        </Badge>
                    )}
                </div>
            </PageHeader>

            {/* Progress Steps */}
            {step !== 'generating' && (
                <div className="flex items-center justify-center gap-2 mb-8">
                    {steps.map((s, i) => {
                        const Icon = s.icon;
                        const isActive = i === currentStepIndex;
                        const isCompleted = i < currentStepIndex;
                        const isClickable = isCompleted;

                        return (
                            <React.Fragment key={s.key}>
                                <button
                                    onClick={() => isClickable && setStep(s.key as Step)}
                                    disabled={!isClickable}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${isActive
                                            ? 'bg-primary-500/20 text-primary-400 border border-primary-500/40'
                                            : isCompleted
                                                ? 'bg-[var(--ds-bg-elevated)] text-primary-400 border border-[var(--ds-border-default)] cursor-pointer hover:border-primary-500/40'
                                                : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)] border border-[var(--ds-border-default)]'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    <span className="text-sm font-medium hidden sm:inline">{s.label}</span>
                                </button>
                                {i < steps.length - 1 && (
                                    <div className={`w-8 h-px ${i < currentStepIndex ? 'bg-primary-500/50' : 'bg-[var(--ds-border-default)]'}`} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            {/* ================================================================ */}
            {/* STEP 1: PASTE - Cole o conteúdo */}
            {/* ================================================================ */}
            {step === 'paste' && (
                <div className="max-w-3xl mx-auto space-y-6">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-[var(--ds-text-primary)] mb-2">
                            Cole qualquer informação sobre o que você quer divulgar
                        </h2>
                        <p className="text-[var(--ds-text-muted)]">
                            Página de vendas, descrição do evento, notas soltas... a IA vai extrair o que importa.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-lg">
                        <textarea
                            value={rawContent}
                            onChange={(e) => setRawContent(e.target.value)}
                            placeholder={`Cole aqui o conteúdo completo...

Exemplo:
- Página de vendas inteira
- Descrição do produto/evento
- Notas e informações soltas
- E-mail de lançamento
- Post de rede social

Quanto mais informação, melhor!`}
                            className="w-full h-80 p-4 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] focus:ring-2 focus:ring-primary-500/30 outline-none resize-none text-base text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
                        />

                        <div className="flex items-center justify-between mt-4">
                            <span className="text-sm text-[var(--ds-text-muted)]">
                                {rawContent.length} caracteres {rawContent.length < 50 && '(mínimo 50)'}
                            </span>
                            <button
                                onClick={handleExtract}
                                disabled={rawContent.length < 50 || isExtracting}
                                className="px-6 py-3 bg-primary-600 text-white dark:bg-white dark:text-black rounded-xl font-semibold flex items-center gap-2 transition-colors hover:bg-primary-700 dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isExtracting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Extraindo...
                                    </>
                                ) : (
                                    <>
                                        <Brain className="w-5 h-5" />
                                        Extrair Informações
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-4">
                        <p className="text-sm text-primary-400">
                            💡 <strong>Dica:</strong> Você pode colar uma página de vendas inteira, um e-mail de lançamento, ou qualquer texto com informações sobre o que quer promover. A IA vai identificar automaticamente: nome, data, preço, benefícios, garantia, links, etc.
                        </p>
                    </div>
                </div>
            )}

            {/* ================================================================ */}
            {/* STEP 2: EXTRACT - Revisar extração */}
            {/* ================================================================ */}
            {step === 'extract' && extractedContent && (
                <div className="max-w-4xl mx-auto space-y-6">
                    <div className="text-center mb-6">
                        <h2 className="text-2xl font-bold text-[var(--ds-text-primary)] mb-2">
                            Informações Extraídas
                        </h2>
                        <p className="text-[var(--ds-text-muted)]">
                            Confira se está tudo certo. Você pode editar o resumo antes de continuar.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Dados extraídos */}
                        <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-lg space-y-4">
                            <h3 className="font-semibold text-[var(--ds-text-primary)] flex items-center gap-2">
                                <Check className="w-5 h-5 text-primary-400" />
                                Dados Identificados
                            </h3>

                            <div className="grid grid-cols-[90px_1fr] gap-y-2 gap-x-4 text-sm">
                                <span className="text-[var(--ds-text-muted)]">📦 Produto:</span>
                                <span className="text-[var(--ds-text-primary)] font-medium">{extractedContent.productName}</span>

                                {extractedContent.author && (
                                    <>
                                        <span className="text-[var(--ds-text-muted)]">👤 Autor:</span>
                                        <span className="text-[var(--ds-text-primary)]">{extractedContent.author}</span>
                                    </>
                                )}
                                {extractedContent.date && (
                                    <>
                                        <span className="text-[var(--ds-text-muted)]">📅 Data:</span>
                                        <span className="text-[var(--ds-text-primary)]">{extractedContent.date} {extractedContent.time && `às ${extractedContent.time}`}</span>
                                    </>
                                )}
                                {extractedContent.price && (
                                    <>
                                        <span className="text-[var(--ds-text-muted)]">💰 Preço:</span>
                                        <span className="text-[var(--ds-text-primary)]">
                                            {extractedContent.discount && <span className="text-primary-400 mr-2">{extractedContent.discount}</span>}
                                            {extractedContent.price}
                                        </span>
                                    </>
                                )}
                                {extractedContent.guarantee && (
                                    <>
                                        <span className="text-[var(--ds-text-muted)]">🛡️ Garantia:</span>
                                        <span className="text-[var(--ds-text-primary)]">{extractedContent.guarantee}</span>
                                    </>
                                )}
                                {extractedContent.url && (
                                    <>
                                        <span className="text-[var(--ds-text-muted)]">🔗 Link:</span>
                                        <a href={extractedContent.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate">{extractedContent.url}</a>
                                    </>
                                )}
                            </div>

                            {extractedContent.benefits && extractedContent.benefits.length > 0 && (
                                <div className="pt-3 border-t border-[var(--ds-border-default)]">
                                    <span className="text-[var(--ds-text-muted)] text-sm">✨ Benefícios:</span>
                                    <ul className="mt-2 space-y-1">
                                        {extractedContent.benefits.slice(0, 4).map((b, i) => (
                                            <li key={i} className="text-sm text-[var(--ds-text-secondary)] flex items-start gap-2">
                                                <span className="text-primary-400">•</span>
                                                {b}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {extractedContent.bonuses && extractedContent.bonuses.length > 0 && (
                                <div className="pt-3 border-t border-[var(--ds-border-default)]">
                                    <span className="text-[var(--ds-text-muted)] text-sm">🎁 Bônus:</span>
                                    <ul className="mt-2 space-y-1">
                                        {extractedContent.bonuses.map((b, i) => (
                                            <li key={i} className="text-sm text-[var(--ds-text-secondary)] flex items-start gap-2">
                                                <span className="text-amber-400">+</span>
                                                {b}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        {/* Prompt editável */}
                        <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-lg space-y-4">
                            <h3 className="font-semibold text-[var(--ds-text-primary)] flex items-center gap-2">
                                <Pencil className="w-5 h-5 text-amber-400" />
                                Resumo para Geração
                            </h3>
                            <p className="text-sm text-[var(--ds-text-muted)]">
                                Este texto será usado como base para gerar os templates. Edite se quiser ajustar algo.
                            </p>

                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="w-full h-40 p-4 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] focus:ring-2 focus:ring-primary-500/30 outline-none resize-none text-sm text-[var(--ds-text-primary)]"
                            />

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPrompt(suggestedPrompt)}
                                    className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    Restaurar original
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between">
                        <button
                            onClick={() => setStep('paste')}
                            className="px-4 py-2 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Voltar
                        </button>
                        <button
                            onClick={handleGoToStrategy}
                            className="px-6 py-3 bg-primary-600 text-white dark:bg-white dark:text-black rounded-xl font-semibold flex items-center gap-2 transition-colors hover:bg-primary-700 dark:hover:bg-slate-200"
                        >
                            Escolher Estratégia
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ================================================================ */}
            {/* STEP 3: STRATEGY - Escolher estratégia */}
            {/* ================================================================ */}
            {step === 'strategy' && (
                <div className="max-w-4xl mx-auto space-y-6">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-[var(--ds-text-primary)] mb-2">
                            Como você quer comunicar isso?
                        </h2>
                        <p className="text-[var(--ds-text-muted)]">
                            Escolha a estratégia que melhor se encaixa no seu objetivo.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(Object.entries(STRATEGY_CONFIG) as [AIStrategy, typeof STRATEGY_CONFIG['marketing']][]).map(([key, config]) => {
                            const Icon = config.icon;
                            return (
                                <button
                                    key={key}
                                    onClick={() => handleSelectStrategy(key)}
                                    className={`p-6 rounded-2xl border-2 ${config.borderColor} ${config.bgColor} text-left transition-all hover:scale-[1.02] hover:shadow-lg`}
                                >
                                    <div className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center mb-4`}>
                                        <Icon className={`w-6 h-6 ${config.color}`} />
                                    </div>
                                    <h3 className={`text-lg font-bold ${config.color} mb-2`}>
                                        {config.label}
                                    </h3>
                                    <p className="text-sm text-[var(--ds-text-secondary)] mb-4">
                                        {config.description}
                                    </p>
                                    <p className="text-xs text-[var(--ds-text-muted)]">
                                        {config.when}
                                    </p>
                                </button>
                            );
                        })}
                    </div>

                    {/* Explicação BYPASS */}
                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 mt-6">
                        <p className="text-sm text-violet-300">
                            🎭 <strong>Sobre o Camuflado (BYPASS):</strong> O texto do template parece uma notificação comum (aprovado como UTILITY pela Meta), mas as variáveis contêm o conteúdo promocional. Meta vê "sua solicitação está disponível", cliente recebe "a MEGA PROMOÇÃO de 70% está disponível".
                        </p>
                    </div>

                    <div className="flex justify-start">
                        <button
                            onClick={() => setStep('extract')}
                            className="px-4 py-2 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Voltar
                        </button>
                    </div>
                </div>
            )}

            {/* ================================================================ */}
            {/* STEP 4: CONFIG - Configurações finais */}
            {/* ================================================================ */}
            {step === 'config' && strategy && (
                <div className="max-w-3xl mx-auto space-y-6">
                    <div className="text-center mb-6">
                        <h2 className="text-2xl font-bold text-[var(--ds-text-primary)] mb-2">
                            Configurações Finais
                        </h2>
                        <p className="text-[var(--ds-text-muted)]">
                            Ajuste os detalhes antes de gerar os templates.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-lg space-y-6">
                        {/* Prompt */}
                        <div>
                            <label className="block text-sm font-medium text-[var(--ds-text-secondary)] mb-2">
                                Prompt para a IA
                            </label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="w-full h-32 p-4 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] focus:ring-2 focus:ring-primary-500/30 outline-none resize-none text-base text-[var(--ds-text-primary)]"
                            />
                        </div>

                        {/* Grid de configs */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-[var(--ds-text-secondary)] mb-2">
                                    Quantidade
                                </label>
                                <select
                                    value={quantity}
                                    onChange={(e) => setQuantity(Number(e.target.value))}
                                    className="w-full h-11 rounded-xl bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] px-3 text-[var(--ds-text-primary)]"
                                >
                                    <option value={3}>3 Opções</option>
                                    <option value={5}>5 Opções</option>
                                    <option value={10}>10 Opções</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[var(--ds-text-secondary)] mb-2">
                                    Idioma
                                </label>
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    className="w-full h-11 rounded-xl bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] px-3 text-[var(--ds-text-primary)]"
                                >
                                    <option value="pt_BR">Português (Brasil)</option>
                                    <option value="en_US">Inglês (EUA)</option>
                                    <option value="es_ES">Espanhol</option>
                                </select>
                            </div>
                        </div>

                        {/* URL */}
                        <div>
                            <label className="block text-sm font-medium text-[var(--ds-text-secondary)] mb-2">
                                URL do Botão
                            </label>
                            <input
                                type="url"
                                value={universalUrl}
                                onChange={(e) => setUniversalUrl(e.target.value)}
                                placeholder="https://seu-site.com"
                                className="w-full h-11 rounded-xl bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] px-3 text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
                            />
                        </div>
                    </div>

                    <div className="flex justify-between">
                        <button
                            onClick={() => setStep('strategy')}
                            className="px-4 py-2 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Voltar
                        </button>
                        <button
                            onClick={handleGenerate}
                            disabled={!prompt}
                            className="px-6 py-3 bg-primary-600 text-white dark:bg-white dark:text-black rounded-xl font-semibold flex items-center gap-2 transition-colors hover:bg-primary-700 dark:hover:bg-slate-200 disabled:opacity-50"
                        >
                            <Wand2 className="w-5 h-5" />
                            Gerar Templates
                        </button>
                    </div>
                </div>
            )}

            {/* ================================================================ */}
            {/* GENERATING - Loading state */}
            {/* ================================================================ */}
            {step === 'generating' && (
                <div className="flex flex-col items-center justify-center min-h-[400px]">
                    <Loader2 className="w-12 h-12 text-primary-300 animate-spin mb-4" />
                    <h2 className="text-xl font-semibold text-[var(--ds-text-primary)] mb-2">
                        Criando seus templates...
                    </h2>
                    <p className="text-[var(--ds-text-muted)]">
                        {strategy === 'bypass'
                            ? 'Gerando texto neutro + variáveis de marketing...'
                            : strategy === 'utility'
                                ? 'Gerando templates transacionais e validando com AI Judge...'
                                : 'Gerando copy promocional com emojis e urgência...'
                        }
                    </p>
                </div>
            )}

            {/* ================================================================ */}
            {/* STEP 5: REVIEW - Revisar e salvar */}
            {/* ================================================================ */}
            {step === 'review' && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-[var(--ds-text-primary)]">
                            Revise os Templates Gerados
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-[var(--ds-text-muted)]">{selectedIds.size} selecionados</span>
                            <button
                                onClick={toggleSelectAll}
                                className="px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] text-[var(--ds-text-secondary)] rounded-lg hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-2 text-sm"
                            >
                                {selectedIds.size === generatedTemplates.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                {selectedIds.size === generatedTemplates.length ? 'Desmarcar Tudo' : 'Selecionar Tudo'}
                            </button>
                            <button
                                onClick={handleSaveProject}
                                disabled={isCreating || selectedIds.size === 0}
                                className="px-6 py-2 bg-primary-600 text-white dark:bg-white dark:text-black rounded-lg font-semibold flex items-center gap-2 hover:bg-primary-700 dark:hover:bg-slate-200 disabled:opacity-50"
                            >
                                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Salvar Projeto
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {generatedTemplates.map((t) => {
                            const isHovered = hoveredId === t.id;
                            return (
                                <div
                                    key={t.id}
                                    onClick={() => toggleSelect(t.id)}
                                    onMouseEnter={() => setHoveredId(t.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    className={`relative p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-lg ${selectedIds.has(t.id)
                                            ? 'border-primary-600 dark:border-primary-400/40 bg-primary-100 dark:bg-primary-500/10'
                                            : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)]'
                                        }`}
                                >
                                    {/* Selection indicator */}
                                    <div className="absolute top-2 right-2 flex items-center gap-1">
                                        {isHovered && strategy === 'bypass' && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-medium">
                                                Preview Marketing
                                            </span>
                                        )}
                                        {selectedIds.has(t.id) && (
                                            <div className="p-1 bg-primary-500 text-black rounded-full">
                                                <Check className="w-3 h-3" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Header */}
                                    <div className="mb-3">
                                        <span className="text-xs font-mono text-[var(--ds-text-muted)]">{t.name}</span>
                                        {t.header && (
                                            <div className="mt-1 font-semibold text-sm text-[var(--ds-text-primary)]">
                                                {t.header.text
                                                    ? (isHovered ? fillVariables(t.header.text, getPreviewVariables(t)) : t.header.text)
                                                    : `[Mídia: ${t.header.format}]`}
                                            </div>
                                        )}
                                    </div>

                                    {/* Body */}
                                    <div className={`text-sm whitespace-pre-wrap mb-4 transition-colors ${isHovered && strategy === 'bypass' ? 'text-violet-300' : 'text-[var(--ds-text-secondary)]'}`}>
                                        {isHovered ? fillVariables(t.content, getPreviewVariables(t)) : t.content}
                                    </div>

                                    {/* Footer */}
                                    {t.footer && (
                                        <div className="mb-3 text-xs text-[var(--ds-text-muted)]">
                                            {t.footer.text}
                                        </div>
                                    )}

                                    {/* Buttons */}
                                    {t.buttons && t.buttons.length > 0 && (
                                        <div className="space-y-2">
                                            {t.buttons.map((btn, i) => (
                                                <div key={i} className="w-full py-2 px-3 bg-[var(--ds-bg-elevated)] text-center text-primary-700 dark:text-primary-200 text-sm rounded font-medium border border-[var(--ds-border-default)]">
                                                    {btn.type === 'URL' && <span className="mr-1">🔗</span>}
                                                    {btn.text}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* BYPASS: Show variable mapping */}
                                    {strategy === 'bypass' && t.sample_variables && t.marketing_variables && (
                                        <div className="mt-4 p-2 bg-violet-500/10 text-violet-300 text-xs rounded border border-violet-500/20">
                                            <div className="font-medium mb-1">🎭 Variáveis:</div>
                                            {Object.entries(t.marketing_variables).slice(0, 2).map(([key, value]) => (
                                                <div key={key} className="truncate">
                                                    {`{{${key}}}`}: {value}
                                                </div>
                                            ))}
                                            {Object.keys(t.marketing_variables).length > 2 && (
                                                <div className="text-violet-400">+{Object.keys(t.marketing_variables).length - 2} mais...</div>
                                            )}
                                        </div>
                                    )}

                                    {/* AI Judgment */}
                                    {t.judgment && !t.judgment.approved && (
                                        <div className="mt-4 p-2 bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-200 text-xs rounded border border-amber-400 dark:border-amber-500/20 flex items-start gap-1">
                                            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                            <span>{t.judgment.issues[0]?.reason || 'Problemas detectados'}</span>
                                        </div>
                                    )}
                                    {t.wasFixed && (
                                        <div className="mt-4 p-2 bg-primary-100 dark:bg-primary-500/10 text-primary-700 dark:text-primary-200 text-xs rounded border border-primary-400 dark:border-primary-500/20 flex items-start gap-1">
                                            <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-primary-300" />
                                            <span>Corrigido pelo AI Judge</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex justify-start">
                        <button
                            onClick={handleReset}
                            className="px-4 py-2 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] flex items-center gap-2"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Recomeçar
                        </button>
                    </div>
                </div>
            )}
        </Page>
    );
}
