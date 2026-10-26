'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Send,
  Phone,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StepHeader } from './StepHeader';
import { toast } from 'sonner';

interface SendFirstMessageStepProps {
  onNext: () => void;
  onBack: () => void;
  stepNumber: number;
  totalSteps: number;
  onMessageSent?: (messageId: string) => void;
}

interface TestContact {
  name?: string;
  phone: string;
}

interface SendResult {
  ok: boolean;
  messageId?: string;
  templateUsed?: string;
  noTemplate?: boolean;
  error?: string;
  hint?: string;
}

type SendStatus = 'idle' | 'sending' | 'success' | 'error';

export function SendFirstMessageStep({
  onNext,
  onBack,
  stepNumber,
  totalSteps,
  onMessageSent,
}: SendFirstMessageStepProps) {
  const [testContact, setTestContact] = useState<TestContact | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isLoadingContact, setIsLoadingContact] = useState(true);
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  // Buscar contato de teste salvo
  useEffect(() => {
    async function fetchTestContact() {
      try {
        const response = await fetch('/api/settings/test-contact');
        if (response.ok) {
          const data = await response.json();
          if (data?.phone) {
            setTestContact(data);
            setPhoneInput(data.phone);
            setNameInput(data.name || '');
          }
        }
      } catch (error) {
        // Ignore - usuário vai digitar manualmente
      } finally {
        setIsLoadingContact(false);
      }
    }
    fetchTestContact();
  }, []);

  const handleSaveAndSend = async () => {
    if (!phoneInput.trim()) {
      toast.error('Digite um número de telefone');
      return;
    }

    setSendStatus('sending');
    setSendResult(null);

    try {
      // Salvar contato de teste
      const saveResponse = await fetch('/api/settings/test-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInput.trim() || 'Contato de teste',
          phone: phoneInput.trim(),
        }),
      });

      if (!saveResponse.ok) {
        const saveError = await saveResponse.json();
        throw new Error(saveError.error || 'Falha ao salvar contato');
      }

      // Enviar mensagem de teste
      const sendResponse = await fetch('/api/messages/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phoneInput.trim() }),
      });

      const result = await sendResponse.json();

      if (result.ok) {
        setSendStatus('success');
        setSendResult(result);
        onMessageSent?.(result.messageId);
        toast.success('Mensagem enviada!', {
          description: `Template: ${result.templateUsed}`,
        });
      } else if (result.noTemplate) {
        // Sem template mas não é erro crítico
        setSendStatus('error');
        setSendResult(result);
        toast.warning('Nenhum template disponível', {
          description: result.hint,
        });
      } else {
        throw new Error(result.error || 'Falha ao enviar mensagem');
      }
    } catch (error) {
      setSendStatus('error');
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      setSendResult({ ok: false, error: message });
      toast.error(message);
    }
  };

  const handleContinue = () => {
    onNext();
  };

  if (isLoadingContact) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--ds-text-secondary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepHeader
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        title="Enviar Primeira Mensagem"
        onBack={onBack}
      />

      {/* Ícone central */}
      <div className="flex justify-center py-4">
        <div className={`
          w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300
          ${sendStatus === 'sending' ? 'bg-blue-500/20 animate-pulse' : ''}
          ${sendStatus === 'success' ? 'bg-green-500/20' : ''}
          ${sendStatus === 'error' ? 'bg-amber-500/20' : ''}
          ${sendStatus === 'idle' ? 'bg-gradient-to-br from-primary-500/20 to-teal-500/20' : ''}
        `}>
          {sendStatus === 'sending' && (
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
          )}
          {sendStatus === 'success' && (
            <CheckCircle2 className="w-10 h-10 text-primary-400" />
          )}
          {sendStatus === 'error' && (
            <AlertCircle className="w-10 h-10 text-amber-400" />
          )}
          {sendStatus === 'idle' && (
            <Send className="w-10 h-10 text-primary-400" />
          )}
        </div>
      </div>

      {/* Descrição */}
      <div className="text-center">
        <p className="text-[var(--ds-text-secondary)]">
          Vamos enviar uma mensagem de teste para verificar se tudo está funcionando
        </p>
      </div>

      {/* Formulário de contato */}
      {sendStatus !== 'success' && (
        <div className="space-y-4 p-4 rounded-xl bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)]">
          <h4 className="text-sm font-medium text-[var(--ds-text-secondary)]">Contato para teste:</h4>

          <div className="space-y-3">
            {/* Nome (opcional) */}
            <div className="space-y-1">
              <label className="text-xs text-[var(--ds-text-secondary)] flex items-center gap-1">
                <User className="w-3 h-3" />
                Nome (opcional)
              </label>
              <Input
                type="text"
                placeholder="Ex: Meu WhatsApp"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                disabled={sendStatus === 'sending'}
              />
            </div>

            {/* Telefone */}
            <div className="space-y-1">
              <label className="text-xs text-[var(--ds-text-secondary)] flex items-center gap-1">
                <Phone className="w-3 h-3" />
                Número de WhatsApp *
              </label>
              <Input
                type="tel"
                placeholder="Ex: +5511999999999"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                disabled={sendStatus === 'sending'}
                className={sendStatus === 'error' && sendResult?.error?.includes('inválido') ? 'border-red-500' : ''}
              />
              <p className="text-xs text-[var(--ds-text-muted)]">
                Use seu próprio número para receber a mensagem de teste
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Resultado de sucesso */}
      {sendStatus === 'success' && sendResult && (
        <div className="p-4 rounded-xl bg-primary-500/10 border border-primary-500/20 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-primary-200">Mensagem enviada com sucesso!</p>
              <p className="text-sm text-primary-200/70">
                Template usado: {sendResult.templateUsed}
              </p>
            </div>
          </div>

          <p className="text-sm text-[var(--ds-text-secondary)]">
            Verifique seu WhatsApp em <strong className="text-[var(--ds-text-primary)]">{phoneInput}</strong> para confirmar o recebimento.
          </p>
        </div>
      )}

      {/* Resultado de erro (sem template) */}
      {sendStatus === 'error' && sendResult?.noTemplate && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-200">{sendResult.error || 'Nenhum template disponível'}</p>
              {sendResult.hint && (
                <p className="text-sm text-amber-200/70">{sendResult.hint}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Resultado de erro genérico */}
      {sendStatus === 'error' && !sendResult?.noTemplate && sendResult?.error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-200">Erro ao enviar</p>
              <p className="text-sm text-red-200/70">{sendResult.error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="flex justify-between pt-2">
        {sendStatus !== 'success' ? (
          <>
            <Button
              variant="ghost"
              onClick={onNext}
              disabled={sendStatus === 'sending'}
            >
              Pular
            </Button>
            <Button
              onClick={handleSaveAndSend}
              disabled={sendStatus === 'sending' || !phoneInput.trim()}
            >
              {sendStatus === 'sending' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar teste
                </>
              )}
            </Button>
          </>
        ) : (
          <Button onClick={handleContinue} className="ml-auto">
            Finalizar setup
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
