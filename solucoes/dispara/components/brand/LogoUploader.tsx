'use client';

import { useRef, useState } from 'react';
import { Upload, Link as LinkIcon, Image as ImageIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LOGO_ACCEPT,
  LOGO_GUIDANCE,
  readLogoFileAsDataUri,
} from '@/lib/brand-logo';

type Variant = 'installer' | 'settings';

interface LogoUploaderProps {
  value: string;
  onChange: (value: string) => void;
  variant?: Variant;
  /** Rótulo do campo (sem prefixo). Default: "Logo (opcional)". */
  label?: string;
  className?: string;
}

/**
 * Campo de logo do whitelabel com DUAS formas de preencher:
 *   - Enviar imagem (arquivo → data URI base64, sem depender de storage);
 *   - Colar uma URL.
 * Mostra preview e orientação de formato/proporção. Compartilhado entre o
 * install wizard (variant="installer", tema escuro mono) e as configurações
 * (variant="settings", design system padrão).
 */
export function LogoUploader({
  value,
  onChange,
  variant = 'settings',
  label = 'Logo (opcional)',
  className,
}: LogoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'upload' | 'url'>(
    value && !value.startsWith('data:') ? 'url' : 'upload'
  );
  const [error, setError] = useState<string | null>(null);

  const isInstaller = variant === 'installer';
  const isDataUri = value.startsWith('data:');

  const handleFile = async (file: File | undefined | null) => {
    setError(null);
    if (!file) return;
    const result = await readLogoFileAsDataUri(file);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.dataUri) onChange(result.dataUri);
  };

  const clear = () => {
    setError(null);
    onChange('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const s = isInstaller ? installerStyles : settingsStyles;

  return (
    <div className={className}>
      <label className={s.label}>
        {isInstaller ? `> ${label}` : label}
      </label>

      {/* Toggle: enviar imagem | URL */}
      <div className={s.toggleWrap}>
        <button type="button" onClick={() => setMode('upload')} className={cn(s.toggleBtn, mode === 'upload' ? s.toggleOn : s.toggleOff)}>
          <Upload className="w-3.5 h-3.5" />
          Enviar imagem
        </button>
        <button type="button" onClick={() => setMode('url')} className={cn(s.toggleBtn, mode === 'url' ? s.toggleOn : s.toggleOff)}>
          <LinkIcon className="w-3.5 h-3.5" />
          URL
        </button>
      </div>

      {mode === 'upload' ? (
        <label
          className={s.dropzone}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={LOGO_ACCEPT}
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Upload className={s.dropzoneIcon} />
          <span className={s.dropzoneText}>
            {isDataUri ? 'Trocar imagem' : 'Clique ou arraste uma imagem aqui'}
          </span>
        </label>
      ) : (
        <div className="relative">
          <ImageIcon className={s.urlIcon} />
          <input
            type="url"
            value={isDataUri ? '' : value}
            onChange={(e) => {
              setError(null);
              onChange(e.target.value);
            }}
            placeholder="https://exemplo.com/logo.svg"
            className={s.urlInput}
          />
        </div>
      )}

      {/* Preview do valor atual */}
      {value && (
        <div className={s.previewRow}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Preview do logo" className={s.previewImg} />
          <span className={s.previewText}>{isDataUri ? 'Imagem enviada' : 'URL definida'}</span>
          <button type="button" onClick={clear} className={s.removeBtn} aria-label="Remover logo">
            <X className="w-3.5 h-3.5" />
            remover
          </button>
        </div>
      )}

      {error ? (
        <p className={s.error}>{isInstaller ? `! ${error}` : error}</p>
      ) : (
        <p className={s.guidance}>{value ? LOGO_GUIDANCE : `Vazio = logo padrão · ${LOGO_GUIDANCE}`}</p>
      )}
    </div>
  );
}

/* ---- Estilos por variante ---- */

const installerStyles = {
  label: 'block text-xs font-mono text-[var(--br-muted-cyan)] mb-2 uppercase tracking-wider',
  toggleWrap: 'inline-flex mb-2 rounded-lg border border-[var(--br-dust-gray)]/50 overflow-hidden',
  toggleBtn: 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono transition-colors',
  toggleOn: 'bg-[var(--br-neon-cyan)] text-[var(--br-void-black)] font-bold',
  toggleOff: 'text-[var(--br-muted-cyan)] hover:text-[var(--br-hologram-white)]',
  dropzone:
    'flex flex-col items-center justify-center gap-1.5 w-full py-5 rounded-lg cursor-pointer border border-dashed border-[var(--br-dust-gray)]/50 bg-[var(--br-void-black)]/80 hover:border-[var(--br-neon-cyan)] transition-colors',
  dropzoneIcon: 'w-5 h-5 text-[var(--br-neon-cyan)]',
  dropzoneText: 'text-xs font-mono text-[var(--br-muted-cyan)]',
  urlIcon: 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--br-dust-gray)]',
  urlInput:
    'w-full pl-10 pr-4 py-3 rounded-lg bg-[var(--br-void-black)]/80 border border-[var(--br-dust-gray)]/50 text-[var(--br-hologram-white)] placeholder:text-[var(--br-dust-gray)] font-mono text-sm focus:border-[var(--br-neon-cyan)] focus:outline-none transition-all duration-200',
  previewRow: 'mt-2 flex items-center gap-3 rounded-lg border border-[var(--br-dust-gray)]/50 bg-[var(--br-void-black)]/60 px-3 py-2',
  previewImg: 'h-8 max-w-[120px] object-contain',
  previewText: 'flex-1 text-[10px] font-mono text-[var(--br-muted-cyan)] truncate',
  removeBtn: 'inline-flex items-center gap-1 text-[10px] font-mono text-[var(--br-dust-gray)] hover:text-[var(--br-neon-pink)] transition-colors',
  guidance: 'mt-1 text-[10px] font-mono text-[var(--br-dust-gray)]',
  error: 'mt-1 text-[10px] font-mono text-[var(--br-neon-pink)]',
} as const;

const settingsStyles = {
  label: 'block text-sm font-medium text-[var(--ds-text-primary)] mb-2',
  toggleWrap: 'inline-flex mb-2 rounded-lg border border-[var(--ds-border-default)] overflow-hidden',
  toggleBtn: 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
  toggleOn: 'bg-primary-600 text-white',
  toggleOff: 'text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)]',
  dropzone:
    'flex flex-col items-center justify-center gap-1.5 w-full py-5 rounded-xl cursor-pointer border border-dashed border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] hover:border-primary-500 transition-colors',
  dropzoneIcon: 'w-5 h-5 text-primary-500',
  dropzoneText: 'text-xs text-[var(--ds-text-muted)]',
  urlIcon: 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ds-text-muted)]',
  urlInput:
    'w-full pl-10 pr-4 py-3 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none text-sm text-[var(--ds-text-primary)] transition-all',
  previewRow: 'mt-2 flex items-center gap-3 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2',
  previewImg: 'h-9 max-w-[140px] object-contain',
  previewText: 'flex-1 text-xs text-[var(--ds-text-muted)] truncate',
  removeBtn: 'inline-flex items-center gap-1 text-xs text-[var(--ds-text-muted)] hover:text-red-400 transition-colors',
  guidance: 'mt-1 text-xs text-[var(--ds-text-muted)]',
  error: 'mt-1 text-xs text-red-400',
} as const;
