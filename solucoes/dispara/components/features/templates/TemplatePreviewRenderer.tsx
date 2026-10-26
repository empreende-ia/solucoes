import React from 'react';
import { TemplateComponent, TemplateButton } from '../../../types';
import { Zap, ExternalLink, Phone, Copy, Image, Video, FileText, MessageCircle, MapPin } from 'lucide-react';

interface TemplatePreviewRendererProps {
    components?: TemplateComponent[];
    /** Variables to replace in template. Index 0 = {{1}}, Index 1 = {{2}}, etc. */
    variables?: string[];
}

/**
 * Replaces template variables like {{1}}, {{2}} with actual values
 */
const replaceVariables = (text: string, variables?: string[]): string => {
    if (!variables || !Array.isArray(variables) || variables.length === 0) return text;
    
    let result = text;
    variables.forEach((value, index) => {
        // Replace {{1}}, {{2}}, etc. (1-indexed)
        const placeholder = `{{${index + 1}}}`;
        result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value || '');
    });
    
    return result;
};

export const TemplatePreviewRenderer: React.FC<TemplatePreviewRendererProps> = ({ components, variables }) => {
    if (!components || components.length === 0) {
        return (
            <div className="text-[13px] text-[#e9edef] leading-relaxed">
                Nenhum conteúdo disponível
            </div>
        );
    }

    const header = components.find(c => c.type === 'HEADER');
    const body = components.find(c => c.type === 'BODY');
    const footer = components.find(c => c.type === 'FOOTER');
    const buttons = components.find(c => c.type === 'BUTTONS');

    const renderButton = (button: TemplateButton, index: number) => {
        // Ícones para tipos de botão suportados pela Meta API
        const icons: Record<string, React.ReactNode> = {
            'URL': <ExternalLink size={14} />,
            'PHONE_NUMBER': <Phone size={14} />,
            'QUICK_REPLY': <Zap size={14} />,
            'COPY_CODE': <Copy size={14} />,
            'OTP': <Copy size={14} />,
            'FLOW': <MessageCircle size={14} />,
        };

        return (
            <div
                key={index}
                className="bg-[#202c33] text-[#00a884] text-center py-2.5 rounded-lg shadow-sm text-[13px] font-medium cursor-pointer hover:bg-[#2a3942] transition-colors flex items-center justify-center gap-2"
            >
                {icons[button.type] || <Zap size={14} />}
                {button.text}
            </div>
        );
    };

    const renderHeader = () => {
        if (!header) return null;

        switch (header.format) {
            case 'TEXT':
                if (!header.text) return null;
                return (
                    <div className="bg-[#202c33] p-2 px-3 rounded-lg rounded-tl-none shadow-sm mb-1">
                        <p className="text-[13px] font-bold text-white">{replaceVariables(header.text, variables)}</p>
                    </div>
                );
            case 'IMAGE':
                return (
                    <div className="bg-[#202c33] rounded-lg rounded-tl-none shadow-sm mb-1 overflow-hidden">
                        <div className="bg-slate-700/50 h-32 flex items-center justify-center">
                            <Image size={32} className="text-slate-500" />
                        </div>
                    </div>
                );
            case 'VIDEO':
                return (
                    <div className="bg-[#202c33] rounded-lg rounded-tl-none shadow-sm mb-1 overflow-hidden">
                        <div className="bg-slate-700/50 h-32 flex items-center justify-center">
                            <Video size={32} className="text-slate-500" />
                        </div>
                    </div>
                );
            case 'DOCUMENT':
                return (
                    <div className="bg-[#202c33] rounded-lg rounded-tl-none shadow-sm mb-1 p-3">
                        <div className="flex items-center gap-2 text-slate-400">
                            <FileText size={20} />
                            <span className="text-[12px]">Documento anexado</span>
                        </div>
                    </div>
                );
            case 'LOCATION':
                return (
                    <div className="bg-[#202c33] rounded-lg rounded-tl-none shadow-sm mb-1 overflow-hidden">
                        <div className="relative h-24 bg-gradient-to-br from-primary-900/50 to-primary-800/30">
                            {/* Grid pattern to simulate map */}
                            <div className="absolute inset-0 opacity-10" style={{
                                backgroundImage: 'linear-gradient(#34d399 1px, transparent 1px), linear-gradient(90deg, #34d399 1px, transparent 1px)',
                                backgroundSize: '20px 20px'
                            }} />
                            {/* Pin */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <MapPin size={32} className="text-red-500 drop-shadow-lg" fill="currentColor" />
                            </div>
                            {/* Label */}
                            <div className="absolute bottom-2 left-2 right-2">
                                <div className="bg-slate-800/80 rounded px-2 py-1 text-[11px] text-slate-300 text-center truncate">
                                    {(header as any)?.location?.name || (header as any)?.location?.address || 'Localização'}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="animate-in zoom-in-95 slide-in-from-bottom-2 duration-500">
            {/* Header */}
            {renderHeader()}

            {/* Body */}
            <div className="bg-[#202c33] p-3 rounded-lg rounded-tl-none shadow-sm text-[13px] leading-relaxed text-[#e9edef] relative max-w-[95%]">
                {replaceVariables(body?.text || 'Sem conteúdo', variables)}

                {/* Footer */}
                {footer?.text && (
                    <p className="text-[11px] text-[#8696a0] mt-2 italic">{replaceVariables(footer.text, variables)}</p>
                )}

                <div className="flex justify-end items-center gap-1 mt-1">
                    <span className="text-[9px] text-[#8696a0]">10:42</span>
                </div>
            </div>

            {/* Buttons */}
            {buttons?.buttons && buttons.buttons.length > 0 && (
                <div className="mt-1.5 space-y-1">
                    {buttons.buttons.map((button, index) => renderButton(button, index))}
                </div>
            )}
        </div>
    );
};
