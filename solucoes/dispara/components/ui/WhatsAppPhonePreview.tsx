'use client'

import React from 'react';
import { MessageSquare, Zap, Image, Video, FileText, ExternalLink, Phone, Copy } from 'lucide-react';
import { TemplateComponent, TemplateButton } from '../../types';
import { replaceTemplatePlaceholders, type TemplateParameterFormat } from '@/lib/whatsapp/placeholder';

type PreviewVariant = 'whatsapp' | 'dispara';

const PREVIEW_THEME: Record<PreviewVariant, {
  headerBg: string;
  bubbleBg: string;
  bubbleText: string;
  bubbleBorder: string;
  subtleText: string;
  quoteBorder: string;
  quoteBg: string;
  inlineCodeBg: string;
  codeblockBg: string;
  divider: string;
  buttonText: string;
  buttonHoverBg: string;
  buttonDivider: string;
}> = {
  whatsapp: {
    headerBg: 'bg-[#202c33]',
    bubbleBg: 'bg-[#202c33]',
    bubbleText: 'text-[#e9edef]',
    bubbleBorder: '',
    subtleText: 'text-[#8696a0]',
    quoteBorder: 'border-[#00a884]/60',
    quoteBg: 'bg-black/10',
    inlineCodeBg: 'bg-black/25',
    codeblockBg: 'bg-[#111b21]',
    divider: 'border-[#111b21]',
    buttonText: 'text-[#00a884]',
    buttonHoverBg: 'hover:bg-[#182229]',
    buttonDivider: 'border-[#111b21]',
  },
  dispara: {
    headerBg: 'bg-[var(--ds-bg-surface)]/30',
    bubbleBg: 'bg-[var(--ds-bg-elevated)]',
    bubbleText: 'text-[var(--ds-text-primary)]',
    bubbleBorder: 'border border-[var(--ds-border-subtle)]',
    subtleText: 'text-[var(--ds-text-secondary)]',
    quoteBorder: 'border-primary-500/60',
    quoteBg: 'bg-[var(--ds-bg-hover)]',
    inlineCodeBg: 'bg-[var(--ds-bg-surface)]',
    codeblockBg: 'bg-[var(--ds-bg-surface)]/40',
    divider: 'border-[var(--ds-border-subtle)]',
    buttonText: 'text-primary-300',
    buttonHoverBg: 'hover:bg-[var(--ds-bg-hover)]',
    buttonDivider: 'border-[var(--ds-border-subtle)]',
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const replaceVariables = (
  text: string,
  input?: {
    parameterFormat?: TemplateParameterFormat;
    positional?: string[];
    named?: Record<string, string>;
  }
): string => {
  const parameterFormat = input?.parameterFormat ?? 'positional';
  return replaceTemplatePlaceholders({
    text,
    parameterFormat,
    positionalValues: input?.positional,
    namedValues: input?.named,
  });
};

type WhatsAppTextBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'codeblock'; text: string }
  | { type: 'spacer' };

const splitByTripleBackticks = (text: string): Array<{ type: 'text' | 'codeblock'; value: string }> => {
  const out: Array<{ type: 'text' | 'codeblock'; value: string }> = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('```', i);
    if (start === -1) {
      out.push({ type: 'text', value: text.slice(i) });
      break;
    }
    const end = text.indexOf('```', start + 3);
    if (end === -1) {
      out.push({ type: 'text', value: text.slice(i) });
      break;
    }
    if (start > i) out.push({ type: 'text', value: text.slice(i, start) });
    out.push({ type: 'codeblock', value: text.slice(start + 3, end) });
    i = end + 3;
  }
  return out.filter(t => t.value.length > 0);
};

const parseWhatsAppTextBlocks = (text: string): WhatsAppTextBlock[] => {
  const tokens = splitByTripleBackticks(text);
  const blocks: WhatsAppTextBlock[] = [];

  const pushTextToken = (raw: string) => {
    const lines = raw.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i] ?? '';
      if (line.trim() === '') {
        blocks.push({ type: 'spacer' });
        i += 1;
        continue;
      }

      // Quote: "> texto"
      if (line.startsWith('> ')) {
        const quoteLines: string[] = [];
        while (i < lines.length && (lines[i] ?? '').startsWith('> ')) {
          quoteLines.push((lines[i] ?? '').slice(2));
          i += 1;
        }
        blocks.push({ type: 'quote', text: quoteLines.join('\n') });
        continue;
      }

      // Bullet list: "* texto" or "- texto"
      if (/^(?:\*|-)\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^(?:\*|-)\s+/.test(lines[i] ?? '')) {
          items.push((lines[i] ?? '').replace(/^(?:\*|-)\s+/, ''));
          i += 1;
        }
        blocks.push({ type: 'ul', items });
        continue;
      }

      // Numbered list: "1. texto"
      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? '')) {
          items.push((lines[i] ?? '').replace(/^\d+\.\s+/, ''));
          i += 1;
        }
        blocks.push({ type: 'ol', items });
        continue;
      }

      // Paragraph: consume until next structural block or empty line
      const para: string[] = [];
      while (i < lines.length) {
        const cur = lines[i] ?? '';
        if (cur.trim() === '') break;
        if (cur.startsWith('> ') || /^(?:\*|-)\s+/.test(cur) || /^\d+\.\s+/.test(cur)) break;
        para.push(cur);
        i += 1;
      }
      blocks.push({ type: 'paragraph', text: para.join('\n') });
    }
  };

  for (const token of tokens) {
    if (token.type === 'codeblock') {
      blocks.push({ type: 'codeblock', text: token.value });
    } else {
      pushTextToken(token.value);
    }
  }

  // Avoid trailing spacers
  while (blocks.length && blocks[blocks.length - 1]?.type === 'spacer') blocks.pop();

  return blocks;
};

const renderWhatsAppInline = (text: string, keyPrefix: string, variant: PreviewVariant): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const pushText = (value: string) => {
    if (value.length === 0) return;
    nodes.push(<React.Fragment key={`${keyPrefix}-t-${key++}`}>{value}</React.Fragment>);
  };

  while (i < text.length) {
    // Inline code: `texto`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        const code = text.slice(i + 1, end);
        nodes.push(
          <code
            key={`${keyPrefix}-code-${key++}`}
            className={`px-1 py-0.5 rounded ${PREVIEW_THEME[variant].inlineCodeBg} ${PREVIEW_THEME[variant].bubbleText} font-mono text-[12px]`}
          >
            {code}
          </code>
        );
        i = end + 1;
        continue;
      }
    }

    const ch = text[i];
    if (ch === '*' || ch === '_' || ch === '~') {
      const end = text.indexOf(ch, i + 1);
      if (end > i + 1) {
        const inner = text.slice(i + 1, end);
        const innerNodes = renderWhatsAppInline(inner, `${keyPrefix}-in-${key}`, variant);

        if (ch === '*') {
          nodes.push(
            <strong key={`${keyPrefix}-b-${key++}`} className="font-bold">
              {innerNodes}
            </strong>
          );
        } else if (ch === '_') {
          nodes.push(
            <em key={`${keyPrefix}-i-${key++}`} className="italic">
              {innerNodes}
            </em>
          );
        } else {
          nodes.push(
            <s key={`${keyPrefix}-s-${key++}`} className="line-through">
              {innerNodes}
            </s>
          );
        }

        i = end + 1;
        continue;
      }
    }

    // Plain text run
    const nextSpecial = (() => {
      const candidates = ['`', '*', '_', '~'].map(sym => text.indexOf(sym, i + 1)).filter(pos => pos !== -1);
      return candidates.length ? Math.min(...candidates) : -1;
    })();

    if (nextSpecial === -1) {
      pushText(text.slice(i));
      break;
    }

    pushText(text.slice(i, nextSpecial));
    i = nextSpecial;
  }

  return nodes;
};

const renderWhatsAppInlineWithBreaks = (text: string, keyPrefix: string, variant: PreviewVariant): React.ReactNode => {
  const parts = text.split(/\r?\n/);
  return (
    <>
      {parts.map((part, idx) => (
        <React.Fragment key={`${keyPrefix}-ln-${idx}`}>
          {renderWhatsAppInline(part, `${keyPrefix}-ln-${idx}`, variant)}
          {idx < parts.length - 1 ? <br /> : null}
        </React.Fragment>
      ))}
    </>
  );
};

const renderWhatsAppFormattedBody = (text: string, variant: PreviewVariant): React.ReactNode => {
  const blocks = parseWhatsAppTextBlocks(text);

  return (
    <div className="space-y-1">
      {blocks.map((b, idx) => {
        const k = `wa-${idx}`;
        if (b.type === 'spacer') return <div key={k} className="h-2" />;

        if (b.type === 'codeblock') {
          return (
            <pre
              key={k}
              className={`${PREVIEW_THEME[variant].codeblockBg} rounded-md p-2 ${PREVIEW_THEME[variant].bubbleText} font-mono text-[12px] leading-relaxed overflow-x-auto whitespace-pre-wrap ${PREVIEW_THEME[variant].bubbleBorder}`}
            >
              <code>{b.text.replace(/^\n+|\n+$/g, '')}</code>
            </pre>
          );
        }

        if (b.type === 'quote') {
          return (
            <div key={k} className={`border-l-2 ${PREVIEW_THEME[variant].quoteBorder} pl-3 py-0.5 ${PREVIEW_THEME[variant].quoteBg} rounded-sm`}>
              {renderWhatsAppInlineWithBreaks(b.text, k, variant)}
            </div>
          );
        }

        if (b.type === 'ul') {
          return (
            <div key={k} className="space-y-1">
              {b.items.map((item, itemIdx) => (
                <div key={`${k}-ul-${itemIdx}`} className="flex gap-2">
                  <span className={PREVIEW_THEME[variant].subtleText}>•</span>
                  <span className="flex-1">{renderWhatsAppInlineWithBreaks(item, `${k}-ul-${itemIdx}`, variant)}</span>
                </div>
              ))}
            </div>
          );
        }

        if (b.type === 'ol') {
          return (
            <div key={k} className="space-y-1">
              {b.items.map((item, itemIdx) => (
                <div key={`${k}-ol-${itemIdx}`} className="flex gap-2">
                  <span className={PREVIEW_THEME[variant].subtleText}>{itemIdx + 1}.</span>
                  <span className="flex-1">{renderWhatsAppInlineWithBreaks(item, `${k}-ol-${itemIdx}`, variant)}</span>
                </div>
              ))}
            </div>
          );
        }

        // paragraph
        return <div key={k}>{renderWhatsAppInlineWithBreaks(b.text, k, variant)}</div>;
      })}
    </div>
  );
};

// ============================================================================
// BUTTON ICONS
// ============================================================================

// Ícones para tipos de botão suportados pela Meta API
const BUTTON_ICONS: Record<string, React.ReactNode> = {
  'URL': <ExternalLink size={14} />,
  'PHONE_NUMBER': <Phone size={14} />,
  'QUICK_REPLY': <Zap size={14} />,
  'COPY_CODE': <Copy size={14} />,
  'OTP': <Copy size={14} />,
  'FLOW': <MessageSquare size={14} />,
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(String(value || '').trim())

const getHeaderExampleUrl = (header?: TemplateComponent): string | null => {
  if (!header) return null
  const format = header.format ? String(header.format).toUpperCase() : ''
  if (!['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(format)) return null

  let exampleObj: any = header.example
  if (typeof exampleObj === 'string') {
    try {
      exampleObj = JSON.parse(exampleObj)
    } catch {
      exampleObj = undefined
    }
  }
  const arr = exampleObj?.header_handle
  const candidate = Array.isArray(arr) ? arr.find((item: any) => typeof item === 'string' && item.trim()) : null
  if (!candidate) return null
  return isHttpUrl(candidate) ? String(candidate).trim() : null
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface MessageButtonProps {
  button: TemplateButton;
}

const MessageButton: React.FC<MessageButtonProps> = ({ button }) => (
  <div className="bg-[#202c33] text-[#00a884] text-center py-2.5 rounded-lg shadow-sm text-[13px] font-medium cursor-pointer hover:bg-[#2a3942] transition-colors flex items-center justify-center gap-2">
    {BUTTON_ICONS[button.type] || <Zap size={14} />}
    {button.text}
  </div>
);

interface MessageHeaderProps {
  header: TemplateComponent;
  variables?: string[];
  headerVariables?: string[];
  parameterFormat?: TemplateParameterFormat;
  namedVariables?: Record<string, string>;
  namedHeaderVariables?: Record<string, string>;
  headerMediaPreviewUrl?: string | null;
  variant?: PreviewVariant;
}

const MessageHeader: React.FC<MessageHeaderProps> = ({
  header,
  variables,
  headerVariables,
  parameterFormat = 'positional',
  namedVariables,
  namedHeaderVariables,
  headerMediaPreviewUrl,
  variant = 'whatsapp',
}) => {
  const format = String(header.format || '').toUpperCase()
  const resolvedHeaderMediaPreviewUrl = headerMediaPreviewUrl || getHeaderExampleUrl(header)

  switch (format) {
    case 'TEXT':
      if (!header.text) return null;
      return (
        <div className={`${PREVIEW_THEME[variant].bubbleBg} ${PREVIEW_THEME[variant].bubbleBorder} p-2 px-3 rounded-lg rounded-tl-none shadow-sm mb-1`}>
          <p className={`text-[13px] font-bold ${PREVIEW_THEME[variant].bubbleText}`}>
            {renderWhatsAppInlineWithBreaks(
              replaceVariables(header.text, {
                parameterFormat,
                positional: headerVariables || variables,
                named: namedHeaderVariables || namedVariables,
              }),
              'header',
              variant
            )}
          </p>
        </div>
      );
    case 'IMAGE':
      return (
        <div className="bg-[#202c33] rounded-lg rounded-tl-none shadow-sm mb-1 overflow-hidden">
          {resolvedHeaderMediaPreviewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- Dynamic user-provided media URL */
            <img
              src={resolvedHeaderMediaPreviewUrl}
              alt="Prévia da mídia do cabeçalho"
              className="w-full h-auto"
              loading="lazy"
            />
          ) : (
            <div className="bg-slate-700/50 h-32 flex items-center justify-center">
              <Image size={32} className="text-slate-500" />
            </div>
          )}
        </div>
      );
    case 'VIDEO':
    case 'GIF':
      return (
        <div className="bg-[#202c33] rounded-lg rounded-tl-none shadow-sm mb-1 overflow-hidden">
          {resolvedHeaderMediaPreviewUrl ? (
            <video
              src={resolvedHeaderMediaPreviewUrl}
              className="w-full h-auto"
              muted
              controls
              playsInline
            />
          ) : (
            <div className="bg-slate-700/50 h-32 flex items-center justify-center">
              <Video size={32} className="text-slate-500" />
            </div>
          )}
        </div>
      );
    case 'DOCUMENT':
      return (
        <div className="bg-[#202c33] rounded-lg rounded-tl-none shadow-sm mb-1 p-3">
          {resolvedHeaderMediaPreviewUrl ? (
            <a
              href={resolvedHeaderMediaPreviewUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-slate-200 hover:text-white transition-colors"
            >
              <FileText size={20} />
              <span className="text-[12px]">Abrir documento</span>
            </a>
          ) : (
            <div className="flex items-center gap-2 text-slate-400">
              <FileText size={20} />
              <span className="text-[12px]">Documento anexado</span>
            </div>
          )}
        </div>
      );
    default:
      return null;
  }
};

// ============================================================================
// MESSAGE BUBBLE COMPONENT
// ============================================================================

interface MessageBubbleProps {
  components?: TemplateComponent[];
  variables?: string[];
  headerVariables?: string[];
  parameterFormat?: TemplateParameterFormat;
  namedVariables?: Record<string, string>;
  namedHeaderVariables?: Record<string, string>;
  headerMediaPreviewUrl?: string | null;
  /** Fallback content when no components available */
  fallbackContent?: string;
  /** Visual variant */
  variant?: PreviewVariant;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  components,
  variables,
  headerVariables,
  parameterFormat = 'positional',
  namedVariables,
  namedHeaderVariables,
  headerMediaPreviewUrl,
  fallbackContent,
  variant = 'whatsapp',
}) => {
  // Parse components
  const header = components?.find(c => c.type === 'HEADER');
  const body = components?.find(c => c.type === 'BODY');
  const footer = components?.find(c => c.type === 'FOOTER');
  const buttons = components?.find(c => c.type === 'BUTTONS');

  // If no components but has fallback content, show just the body
  const bodyText = body?.text || fallbackContent || 'Sem conteúdo';
  const hasContent = components?.length || fallbackContent;

  if (!hasContent) {
    return (
      <div className="text-[13px] text-[#e9edef] leading-relaxed">
        Nenhum conteúdo disponível
      </div>
    );
  }

  const hasButtons = buttons?.buttons && buttons.buttons.length > 0;

  return (
    <div className="animate-in zoom-in-95 slide-in-from-bottom-2 duration-500 max-w-[95%]">
      {/* Header */}
      {header && (
        <MessageHeader
          header={header}
          variables={variables}
          headerVariables={headerVariables}
          parameterFormat={parameterFormat}
          namedVariables={namedVariables}
          namedHeaderVariables={namedHeaderVariables}
          headerMediaPreviewUrl={headerMediaPreviewUrl}
          variant={variant}
        />
      )}

      {/* Message Card (Body + Buttons united) */}
      <div className={`${PREVIEW_THEME[variant].bubbleBg} ${PREVIEW_THEME[variant].bubbleBorder} shadow-sm overflow-hidden ${hasButtons ? 'rounded-t-lg rounded-tl-none' : 'rounded-lg rounded-tl-none'}`}>
        {/* Body */}
        <div className={`p-3 text-[13px] leading-relaxed ${PREVIEW_THEME[variant].bubbleText}`}>
          {renderWhatsAppFormattedBody(
            replaceVariables(bodyText, {
              parameterFormat,
              positional: variables,
              named: namedVariables,
            }),
            variant
          )}

          {/* Footer */}
          {footer?.text && (
            <p className={`text-[11px] ${PREVIEW_THEME[variant].subtleText} mt-2 italic`}>
              {renderWhatsAppInlineWithBreaks(
                replaceVariables(footer.text, {
                  parameterFormat,
                  positional: variables,
                  named: namedVariables,
                }),
                'footer',
                variant
              )}
            </p>
          )}

          <div className="flex justify-end items-center gap-1 mt-1">
            <span className={`text-[9px] ${PREVIEW_THEME[variant].subtleText}`}>10:42</span>
          </div>
        </div>

        {/* Buttons (inside same card) */}
        {hasButtons && buttons?.buttons && (
          <div className={`border-t ${PREVIEW_THEME[variant].divider}`}>
            {buttons.buttons.map((button, index) => (
              <div
                key={index}
                className={`${PREVIEW_THEME[variant].buttonText} text-center py-2.5 text-[13px] font-medium cursor-pointer ${PREVIEW_THEME[variant].buttonHoverBg} transition-colors flex items-center justify-center gap-2 ${index < (buttons.buttons?.length ?? 0) - 1 ? `border-b ${PREVIEW_THEME[variant].buttonDivider}` : ''}`}
              >
                {BUTTON_ICONS[button.type] || <Zap size={14} />}
                {button.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT - WHATSAPP PHONE PREVIEW
// ============================================================================

interface WhatsAppPhonePreviewProps {
  /** Template components (header, body, footer, buttons) */
  components?: TemplateComponent[];
  /** Variables to replace in body. Index 0 = {{1}}, Index 1 = {{2}}, etc. */
  variables?: string[];
  /** Variables to replace in header. Separate from body indices. */
  headerVariables?: string[];
  /** URL para preview da mídia do header (quando disponível). */
  headerMediaPreviewUrl?: string | null;
  /** How to interpret placeholders: positional ({{1}}) or named ({{first_name}}). */
  parameterFormat?: TemplateParameterFormat;
  /** Variables for named templates (BODY). */
  namedVariables?: Record<string, string>;
  /** Variables for named templates (HEADER). */
  namedHeaderVariables?: Record<string, string>;
  /** Fallback content when no components available */
  fallbackContent?: string;
  /** Business name shown in header */
  businessName?: string;
  /** Whether to show empty state placeholder */
  showEmptyState?: boolean;
  /** Custom empty state message */
  emptyStateMessage?: string;
  /** Phone mockup size: 'sm' | 'md' | 'lg' | 'adaptive' (fills container) */
  size?: 'sm' | 'md' | 'lg' | 'adaptive';
  /** Additional class names */
  className?: string;
  /** Visual variant (default keeps WhatsApp look) */
  variant?: PreviewVariant;
}

const SIZE_CONFIGS = {
  sm: { height: 'h-[400px]', width: 'w-[220px]', border: 'border-[6px]', notch: 'w-24 h-5', aspect: '' },
  md: { height: 'h-[520px]', width: 'w-[260px]', border: 'border-[8px]', notch: 'w-28 h-5', aspect: '' },
  lg: { height: 'h-[600px]', width: 'w-[300px]', border: 'border-[8px]', notch: 'w-32 h-6', aspect: '' },
  adaptive: { height: '', width: 'w-full', border: 'border-[8px]', notch: 'w-32 h-6', aspect: 'aspect-[9/19]' },
};

export const WhatsAppPhonePreview: React.FC<WhatsAppPhonePreviewProps> = ({
  components,
  variables,
  headerVariables,
  headerMediaPreviewUrl,
  parameterFormat = 'positional',
  namedVariables,
  namedHeaderVariables,
  fallbackContent,
  businessName = 'Dispara',
  showEmptyState = true,
  emptyStateMessage = 'Selecione um template',
  size = 'lg',
  className = '',
  variant = 'whatsapp',
}) => {
  const sizeConfig = SIZE_CONFIGS[size];
  const hasContent = components?.length || fallbackContent;

  return (
    <div className={`relative mx-auto border-slate-800 bg-slate-950 ${sizeConfig.border} rounded-[2.5rem] ${sizeConfig.height} ${sizeConfig.width} ${sizeConfig.aspect} shadow-2xl flex flex-col overflow-hidden ${className}`}>
      {/* Notch */}
      <div className={`absolute top-0 left-1/2 transform -translate-x-1/2 ${sizeConfig.notch} bg-slate-800 rounded-b-xl z-20`}></div>

      {/* WhatsApp Header */}
      <div className="bg-[#202c33] h-20 flex items-end px-4 pb-3 border-b border-[#111b21] shrink-0 z-10">
        <div className="flex items-center gap-3 w-full">
          <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
            {businessName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-slate-100 text-sm font-medium leading-none">{businessName}</p>
            <p className="text-[10px] text-slate-400 mt-1">Conta Comercial</p>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 min-h-0 bg-[#0b141a] relative overflow-y-auto overflow-x-hidden p-4 flex flex-col">
        {/* Chat Background Pattern */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)',
            backgroundSize: '20px 20px'
          }}
        />

        {/* Message Date */}
        <div className="flex justify-center mb-6 mt-2">
          <span className="bg-[#182229] text-[#8696a0] text-[10px] py-1 px-3 rounded-lg font-medium shadow-sm uppercase tracking-wide">
            Hoje
          </span>
        </div>

        {/* Message Content */}
        {hasContent ? (
          <MessageBubble
            components={components}
            variables={variables}
            headerVariables={headerVariables}
            headerMediaPreviewUrl={headerMediaPreviewUrl}
            parameterFormat={parameterFormat}
            namedVariables={namedVariables}
            namedHeaderVariables={namedHeaderVariables}
            fallbackContent={fallbackContent}
            variant={variant}
          />
        ) : showEmptyState ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs gap-2 opacity-50">
            <div className="w-12 h-12 border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center">
              <MessageSquare size={20} />
            </div>
            <span>{emptyStateMessage}</span>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="bg-[#202c33] h-14 flex items-center px-2 gap-2 shrink-0">
        <div className="w-8 h-8 rounded-full hover:bg-[var(--ds-bg-hover)] flex items-center justify-center text-[#8696a0]">
          <span className="text-xl">+</span>
        </div>
        <div className="flex-1 h-9 bg-[#2a3942] rounded-lg px-3 flex items-center text-[#8696a0] text-xs">
          Mensagem
        </div>
        <div className="w-8 h-8 rounded-full bg-[#00a884] flex items-center justify-center text-white">
          <Zap size={14} />
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// COMPACT PREVIEW (without phone mockup)
// ============================================================================

interface CompactPreviewProps {
  /** Template components */
  components?: TemplateComponent[];
  /** Variables for replacement */
  variables?: string[];
  /** Variables to replace in header. Separate from body indices. */
  headerVariables?: string[];
  /** URL para preview da mídia do header (quando disponível). */
  headerMediaPreviewUrl?: string | null;
  /** How to interpret placeholders: positional ({{1}}) or named ({{first_name}}). */
  parameterFormat?: TemplateParameterFormat;
  /** Variables for named templates (BODY). */
  namedVariables?: Record<string, string>;
  /** Variables for named templates (HEADER). */
  namedHeaderVariables?: Record<string, string>;
  /** Fallback content */
  fallbackContent?: string;
  /** Additional class */
  className?: string;
  /** Visual variant (default = dispara) */
  variant?: PreviewVariant;
}

export const CompactPreview: React.FC<CompactPreviewProps> = ({
  components,
  variables,
  headerVariables,
  headerMediaPreviewUrl,
  parameterFormat = 'positional',
  namedVariables,
  namedHeaderVariables,
  fallbackContent,
  className = '',
  variant = 'dispara',
}) => {
  return (
    <div
      className={`rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)] ${className}`}
    >
      <MessageBubble
        components={components}
        variables={variables}
        headerVariables={headerVariables}
        headerMediaPreviewUrl={headerMediaPreviewUrl}
        parameterFormat={parameterFormat}
        namedVariables={namedVariables}
        namedHeaderVariables={namedHeaderVariables}
        fallbackContent={fallbackContent}
        variant={variant}
      />
    </div>
  );
};

export default WhatsAppPhonePreview;
