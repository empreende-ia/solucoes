import React, { useState, useEffect } from 'react';
import { Bot, Save, Key, CheckCircle, ExternalLink, RefreshCw, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { AI_PROVIDERS, type AIProvider, type AIProviderConfig } from '@/lib/ai/providers';
import type { AiFallbackConfig, AiPromptsConfig, AiRoutesConfig } from '@/lib/ai/ai-center-defaults';
import { Container } from '@/components/ui/container';
import { StatusBadge } from '@/components/ui/status-badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface ProviderStatus {
    isConfigured: boolean;
    source: 'database' | 'env' | 'none';
    tokenPreview?: string | null;
}

interface AISettingsProps {
    settings: {
        isConfigured: boolean;
        source: 'database' | 'env' | 'none';
        tokenPreview?: string | null;
        provider?: AIProvider;
        model?: string;
        providers?: {
            google: ProviderStatus;
            openai: ProviderStatus;
            anthropic: ProviderStatus;
        };
    } | undefined;
    isLoading: boolean;
    onSave: (data: {
        apiKey?: string;
        apiKeyProvider?: string;
        provider?: string;
        model?: string;
        routes?: AiRoutesConfig;
        prompts?: AiPromptsConfig;
        fallback?: AiFallbackConfig;
    }) => Promise<void>;
    onRemoveKey?: (provider: AIProvider) => Promise<void>;
    isSaving: boolean;
}

export const AISettings: React.FC<AISettingsProps> = ({
    settings,
    isLoading,
    onSave,
    onRemoveKey,
    isSaving
}) => {
    const [apiKey, setApiKey] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [selectedProvider, setSelectedProvider] = useState<AIProvider>('google');
    const [selectedModel, setSelectedModel] = useState<string>('');

    // Get current provider config
    const currentProviderConfig = AI_PROVIDERS.find(p => p.id === selectedProvider);
    const availableModels = currentProviderConfig?.models || [];

    // Track if we've initialized from settings
    const [hasInitialized, setHasInitialized] = useState(false);

    // Detect if there are unsaved changes to provider/model
    const hasChanges = hasInitialized && (
        selectedProvider !== (settings?.provider || 'google') ||
        selectedModel !== (settings?.model || '')
    );

    // Initialize from settings ONLY ONCE
    useEffect(() => {
        if (settings && !isLoading && !hasInitialized) {
            if (!settings.isConfigured) {
                setIsEditing(true);
            }
            if (settings.provider) {
                setSelectedProvider(settings.provider);
            }
            if (settings.model) {
                setSelectedModel(settings.model);
            } else {
                // Set first model of the provider
                const providerModels = AI_PROVIDERS.find(p => p.id === (settings.provider || 'google'))?.models || [];
                if (providerModels.length > 0) {
                    setSelectedModel(providerModels[0].id);
                }
            }
            setHasInitialized(true);
        }
    }, [settings, isLoading, hasInitialized]);

    // Update model when provider changes (by user action)
    useEffect(() => {
        if (hasInitialized) {
            const models = AI_PROVIDERS.find(p => p.id === selectedProvider)?.models || [];
            // Only reset if current model isn't in the new provider's list
            if (models.length > 0 && !models.find(m => m.id === selectedModel)) {
                setSelectedModel(models[0].id);
            }
            // Clear any error message when switching providers
            setErrorMessage(null);
        }
    }, [selectedProvider, hasInitialized]);

    const handleSave = async () => {
        if (isEditing && !apiKey.trim()) {
            setErrorMessage('Informe a chave da API');
            return;
        }

        setErrorMessage(null); // Clear previous errors

        try {
            await onSave({
                apiKey: apiKey.trim() || undefined,
                provider: selectedProvider,
                model: selectedModel,
            });
            setIsEditing(false);
            setApiKey('');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erro ao salvar configuração';
            setErrorMessage(message);
        }
    };

    const handleRemoveKey = async () => {
        if (!onRemoveKey) return;

        setIsRemoving(true);
        try {
            await onRemoveKey(selectedProvider);
            toast.success('Chave removida com sucesso!');
        } catch {
            // Error handled by hook
        } finally {
            setIsRemoving(false);
        }
    };

    const getApiKeyLink = (provider: AIProvider): string => {
        switch (provider) {
            case 'google':
                return 'https://aistudio.google.com/app/apikey';
            case 'openai':
                return 'https://platform.openai.com/api-keys';
            case 'anthropic':
                return 'https://console.anthropic.com/settings/keys';
            default:
                return '#';
        }
    };

    const getApiKeyPlaceholder = (provider: AIProvider): string => {
        switch (provider) {
            case 'google':
                return 'AIza...';
            case 'openai':
                return 'sk-...';
            case 'anthropic':
                return 'sk-ant-...';
            default:
                return 'Chave de API';
        }
    };

    if (isLoading) {
        return (
            <Container variant="glass" padding="lg" className="flex items-center justify-center">
                <div className="animate-spin text-primary-500 mr-2">
                    <RefreshCw size={24} />
                </div>
                <span className="text-[var(--ds-text-secondary)]">Carregando configurações de IA...</span>
            </Container>
        );
    }

    // Get status for the SELECTED provider
    const currentProviderStatus = settings?.providers?.[selectedProvider];
    const isConfigured = currentProviderStatus?.isConfigured ?? false;
    const source = currentProviderStatus?.source ?? 'none';
    const tokenPreview = currentProviderStatus?.tokenPreview ?? null;

    return (
        <Container variant="glass" padding="lg" className="relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${isConfigured ? 'bg-primary-500/20 text-primary-400' : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]'}`}>
                            <Bot size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-[var(--ds-text-primary)]">Inteligência Artificial</h3>
                            <p className="text-sm text-[var(--ds-text-secondary)]">Geração de templates e respostas inteligentes</p>
                        </div>
                    </div>

                    {isConfigured && (
                        <StatusBadge status="success" showDot>Ativo</StatusBadge>
                    )}
                </div>

                {/* Provider & Model Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Provider Selection */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--ds-text-secondary)] mb-2">
                            Provider de IA
                        </label>
                        <div className="relative">
                            <select
                                value={selectedProvider}
                                onChange={(e) => setSelectedProvider(e.target.value as AIProvider)}
                                className="w-full px-4 py-3 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none text-[var(--ds-text-primary)] appearance-none cursor-pointer transition-all"
                            >
                                {AI_PROVIDERS.map((provider) => (
                                    <option key={provider.id} value={provider.id}>
                                        {provider.icon} {provider.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--ds-text-secondary)] pointer-events-none" />
                        </div>
                    </div>

                    {/* Model Selection */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--ds-text-secondary)] mb-2">
                            Modelo
                        </label>
                        <div className="relative">
                            <select
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="w-full px-4 py-3 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none text-[var(--ds-text-primary)] appearance-none cursor-pointer transition-all"
                            >
                                {availableModels.map((model) => (
                                    <option key={model.id} value={model.id}>
                                        {model.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--ds-text-secondary)] pointer-events-none" />
                        </div>
                        {/* Model Description */}
                        {availableModels.find(m => m.id === selectedModel) && (
                            <p className="text-xs text-[var(--ds-text-muted)] mt-1">
                                {availableModels.find(m => m.id === selectedModel)?.description}
                            </p>
                        )}
                    </div>
                </div>

                {/* API Key Section */}
                {!isEditing && isConfigured ? (
                    <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-xl p-5 mb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-[var(--ds-text-secondary)] mb-1">Status da Configuração</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-[var(--ds-text-primary)] font-mono text-sm">
                                        {source === 'env' ? 'Configurado via Variável de Ambiente' : 'Configurado via Banco de Dados'}
                                    </span>
                                </div>
                                {tokenPreview && (
                                    <p className="text-xs text-[var(--ds-text-muted)] mt-2 font-mono">
                                        Chave: {tokenPreview}
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="px-4 py-2 text-sm text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] bg-[var(--ds-bg-hover)] hover:bg-[var(--ds-bg-surface)] rounded-lg transition-colors border border-[var(--ds-border-subtle)]"
                                >
                                    Alterar Chave
                                </button>
                                {source === 'database' && onRemoveKey && (
                                    <button
                                        onClick={handleRemoveKey}
                                        disabled={isRemoving}
                                        className="px-4 py-2 text-sm text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/10 disabled:opacity-50"
                                    >
                                        {isRemoving ? 'Removendo...' : 'Remover Chave'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                        <div className="bg-primary-500/5 border border-primary-500/10 rounded-xl p-4 mb-4">
                            <p className="text-sm text-primary-200/80 leading-relaxed">
                                Para ativar o provider {currentProviderConfig?.name || 'selecionado'}, você precisa de uma chave de API.
                                <a
                                    href={getApiKeyLink(selectedProvider)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 ml-1 font-medium hover:underline"
                                >
                                    Obter chave <ExternalLink size={12} />
                                </a>
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--ds-text-secondary)] mb-2">
                                {currentProviderConfig?.name || 'API'} Key
                            </label>
                            <div className="relative">
                                <div className="absolute left-4 top-3 text-[var(--ds-text-muted)]">
                                    <Key size={18} />
                                </div>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder={getApiKeyPlaceholder(selectedProvider)}
                                    className="w-full pl-12 pr-4 py-3 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none font-mono text-sm text-[var(--ds-text-primary)] transition-all placeholder:text-[var(--ds-text-muted)]"
                                />
                            </div>
                        </div>

                        {/* Error Message */}
                        {errorMessage && (
                            <Alert variant="error" className="animate-in slide-in-from-top-2 duration-200">
                                <AlertDescription>{errorMessage}</AlertDescription>
                            </Alert>
                        )}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4">
                    {/* Cancel button - only when editing a configured provider */}
                    {isEditing && isConfigured && (
                        <button
                            onClick={() => {
                                setIsEditing(false);
                                setApiKey('');
                            }}
                            className="px-4 py-2 text-sm text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors"
                        >
                            Cancelar
                        </button>
                    )}

                    {/* Save button - when editing, not configured, OR has unsaved changes */}
                    {(isEditing || !isConfigured || hasChanges) && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving || (isEditing && !apiKey.trim() && !hasChanges)}
                            className="px-6 py-2 bg-primary-600 text-white dark:bg-white dark:text-black font-medium rounded-lg hover:bg-primary-500 dark:hover:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-white/5"
                        >
                            {isSaving ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin" /> Salvando...
                                </>
                            ) : (
                                <>
                                    <Save size={16} /> Salvar Configuração
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </Container>
    );
};
