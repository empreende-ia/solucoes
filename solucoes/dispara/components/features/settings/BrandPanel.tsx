'use client';

/**
 * BrandPanel — Configuração de Marca (whitelabel)
 *
 * Permite ajustar nome, logo e cor primária do deploy sem reinstalar.
 * Self-contained (React Query interno) seguindo o padrão de panels
 * como ApiDocsPanel/FlowEndpointPanel.
 */

import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Palette } from 'lucide-react';
import { toast } from 'sonner';
import { SectionHeader } from '@/components/ui/section-header';
import { LogoUploader } from '@/components/brand/LogoUploader';

interface BrandSettings {
  name: string;
  logoUrl: string;
  primaryColor: string;
}

const DEFAULT_COLOR = '#10b981';
const DEFAULT_LOGO = '/brand/logo.svg';

const isValidHex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

async function fetchBrandSettings(): Promise<BrandSettings> {
  const response = await fetch('/api/settings/brand');
  if (!response.ok) throw new Error('Falha ao carregar configuração de marca');
  return response.json();
}

export function BrandPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<BrandSettings>({
    queryKey: ['brandSettings'],
    queryFn: fetchBrandSettings,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR);

  // Sincroniza o formulário quando os dados chegam
  useEffect(() => {
    if (!data) return;
    setName(data.name || '');
    // Não pré-preenche com o default para deixar claro que é opcional
    setLogoUrl(data.logoUrl === DEFAULT_LOGO ? '' : data.logoUrl || '');
    setPrimaryColor(isValidHex(data.primaryColor) ? data.primaryColor : DEFAULT_COLOR);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: BrandSettings) => {
      const response = await fetch('/api/settings/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao salvar marca');
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Marca atualizada. Recarregue a página para ver a nova cor aplicada.');
      queryClient.invalidateQueries({ queryKey: ['brandSettings'] });
      queryClient.invalidateQueries({ queryKey: ['brand'] });
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSave = () => {
    if (!name.trim() || name.trim().length < 2) {
      toast.error('Nome da marca deve ter pelo menos 2 caracteres');
      return;
    }
    if (!isValidHex(primaryColor)) {
      toast.error('Cor primária inválida (formato hex, ex: #10b981)');
      return;
    }
    saveMutation.mutate({
      name: name.trim(),
      logoUrl: logoUrl.trim(),
      primaryColor: primaryColor.toLowerCase(),
    });
  };

  const previewColor = isValidHex(primaryColor) ? primaryColor : DEFAULT_COLOR;
  const previewLogo = logoUrl.trim() || DEFAULT_LOGO;

  return (
    <div className="glass-panel rounded-2xl p-8">
      <SectionHeader
        title="Marca"
        description="Personalize nome, logo e cor primária deste deploy (whitelabel)."
        color="brand"
        icon={Palette}
        className="mb-6"
      />

      {isLoading ? (
        <div className="h-24 rounded-xl bg-[var(--ds-bg-elevated)] animate-pulse" />
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--ds-text-primary)] mb-2">
              Nome da marca
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Minha Empresa"
              className="w-full px-4 py-3 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none text-sm text-[var(--ds-text-primary)] transition-all"
            />
          </div>

          <LogoUploader
            value={logoUrl}
            onChange={setLogoUrl}
            variant="settings"
            label="Logo (opcional)"
          />

          <div>
            <label className="block text-sm font-medium text-[var(--ds-text-primary)] mb-2">
              Cor primária
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={previewColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                aria-label="Cor primária da marca"
                className="h-11 w-14 cursor-pointer rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-1"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder={DEFAULT_COLOR}
                className="w-32 px-3 py-2.5 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none text-sm font-mono text-[var(--ds-text-primary)] transition-all"
              />
              <span className="text-xs text-[var(--ds-text-muted)]">Default: {DEFAULT_COLOR} (emerald)</span>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
            <p className="text-xs uppercase tracking-wider text-[var(--ds-text-muted)] mb-3">Preview</p>
            <div className="flex items-center gap-4">
              <img
                src={previewLogo}
                alt={name || 'Logo'}
                className="h-10 max-w-[140px] object-contain"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.dataset.fallback !== 'true') {
                    img.dataset.fallback = 'true';
                    img.src = DEFAULT_LOGO;
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-8 w-8 rounded-lg border border-[var(--ds-border-default)]"
                  style={{ backgroundColor: previewColor }}
                  aria-hidden="true"
                />
                <span
                  className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={{
                    backgroundColor: previewColor,
                    color: '#fff',
                  }}
                >
                  {name || 'Marca'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="h-11 px-6 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
            >
              {saveMutation.isPending ? 'Salvando...' : 'Salvar marca'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
