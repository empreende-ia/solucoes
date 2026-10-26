import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { Save, MessageSquare, Mic, Eye, EyeOff, Copy, Check, Loader2, Send, ChevronDown, Volume2, Download, Upload, FileAudio, HelpCircle, AlertCircle, Brain, X, RefreshCw } from 'lucide-react';
import { Button } from '../Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useAuth } from '@/hooks/useAuth';
import ZernioApiSettings from './ZernioApiSettings';

interface LaraSettings {
  id?: string;
  whatsapp_access_token: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_verify_token: string | null;
  whatsapp_webhook_key: string | null;
  anthropic_api_key: string | null;
  openai_api_key: string | null;
  elevenlabs_api_key: string | null;
  elevenlabs_voice_id: string;
  elevenlabs_model: string | null;
  elevenlabs_stability: number;
  elevenlabs_similarity_boost: number;
  elevenlabs_style: number;
  elevenlabs_speed: number | null;
  elevenlabs_speaker_boost: boolean;
  audio_response_enabled: boolean;
}

const VOICE_OPTIONS = [
  { id: '33B4UnXyTNbgLmdEDh5P', name: 'Keren - Young Brazilian Female', desc: 'Feminina, brasileira (Padrão)' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', desc: 'Feminina, natural' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', desc: 'Masculina, confiante' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Feminina, suave' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', desc: 'Feminina, expressiva' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', desc: 'Masculina, casual' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', desc: 'Masculina, britânica' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', desc: 'Masculina, transatlântica' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', desc: 'Não-binária, americana' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', desc: 'Masculina, articulada' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', desc: 'Feminina, sueca' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', desc: 'Feminina, britânica' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', desc: 'Feminina, calorosa' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', desc: 'Masculina, amigável' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', desc: 'Feminina, expressiva' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', desc: 'Masculina, amigável' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', desc: 'Masculina, casual' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', desc: 'Masculina, profunda' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'Masculina, britânica' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', desc: 'Feminina, britânica' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', desc: 'Masculina, americana' },
];

const MODEL_OPTIONS = [
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (Recomendado)' },
  { id: 'eleven_turbo_v2', name: 'Turbo v2' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2' },
];

export interface ApiSettingsRef {
  save: () => Promise<void>;
  cancel: () => void;
  isSaving: boolean;
}

const ApiSettings = forwardRef<ApiSettingsRef>((props, ref) => {
  const { companyName, isAdmin } = useCompanySettings();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showWhatsAppToken, setShowWhatsAppToken] = useState(false);
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [rotatingWebhook, setRotatingWebhook] = useState(false);
  const [advancedVoiceOpen, setAdvancedVoiceOpen] = useState(false);
  const [testSectionOpen, setTestSectionOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testSending, setTestSending] = useState(false);
  
  // Audio test states
  const [audioTestOpen, setAudioTestOpen] = useState(false);
  const [audioTestText, setAudioTestText] = useState('Olá! Esta é uma mensagem de teste para verificar a qualidade da voz.');
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioStats, setAudioStats] = useState<{ duration_ms: number; size_kb: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Audio simulation states
  const [audioSimulateOpen, setAudioSimulateOpen] = useState(false);
  const [audioSimulatePhone, setAudioSimulatePhone] = useState('');
  const [audioSimulateName, setAudioSimulateName] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioSimulating, setAudioSimulating] = useState(false);
  const [audioSimulateResult, setAudioSimulateResult] = useState<{
    transcription: string;
    contact_id: string;
    conversation_id: string;
    message_id: string;
    queued_for_lara: boolean;
  } | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  
  // Gera um verify token único para esta instalação
  const generateUniqueToken = () => `verify-${crypto.randomUUID().slice(0, 8)}`;
  
  const [settings, setSettings] = useState<LaraSettings>({
    whatsapp_access_token: null,
    whatsapp_business_account_id: null,
    whatsapp_phone_number_id: null,
    whatsapp_verify_token: generateUniqueToken(),
    whatsapp_webhook_key: null,
    anthropic_api_key: null,
    openai_api_key: null,
    elevenlabs_api_key: null,
    elevenlabs_voice_id: '33B4UnXyTNbgLmdEDh5P',
    elevenlabs_model: 'eleven_turbo_v2_5',
    elevenlabs_stability: 0.75,
    elevenlabs_similarity_boost: 0.80,
    elevenlabs_style: 0.30,
    elevenlabs_speed: 1.0,
    elevenlabs_speaker_boost: true,
    audio_response_enabled: false,
  });

  // Auto-save ElevenLabs API key when field loses focus
  const handleElevenLabsKeyBlur = async () => {
    if (!settings.id || !settings.elevenlabs_api_key) return;
    
    try {
      const { error } = await supabase
        .from('lara_settings')
        .update({
          elevenlabs_api_key: settings.elevenlabs_api_key,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id);

      if (error) throw error;
      toast.success('API Key da ElevenLabs salva automaticamente');
    } catch (error) {
      console.error('Error auto-saving ElevenLabs key:', error);
    }
  };

  const webhookBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
  const webhookUrl = settings.whatsapp_webhook_key
    ? `${webhookBaseUrl}?key=${encodeURIComponent(settings.whatsapp_webhook_key)}`
    : webhookBaseUrl;

  useEffect(() => {
    setTestMessage(`Olá! Esta é uma mensagem de teste do sistema ${companyName}.`);
  }, [companyName]);

  useEffect(() => {
    loadSettings();
  }, []);

  useImperativeHandle(ref, () => ({
    save: handleSave,
    cancel: loadSettings,
    isSaving: saving
  }));

  const loadSettings = async () => {
    if (!user?.id) {
      console.log('[ApiSettings] No user, skipping load');
      setLoading(false);
      return;
    }
    
    try {
      // Fetch global lara_settings (no user_id filter - single tenant)
      const { data, error } = await supabase
        .from('lara_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // Se não existe registro, admin precisa configurar via onboarding
      if (!data) {
        console.log('[ApiSettings] No global settings found');
        setLoading(false);
        return;
      }

      // Load settings from global data
      const uniqueToken = data.whatsapp_verify_token || generateUniqueToken();
      setSettings({
        id: data.id,
        whatsapp_access_token: data.whatsapp_access_token,
        whatsapp_business_account_id: data.whatsapp_business_account_id,
        whatsapp_phone_number_id: data.whatsapp_phone_number_id,
        whatsapp_verify_token: uniqueToken,
        // A migration já existe no banco; os tipos gerados ainda não
        // incluem a coluna rotacionável até a próxima regeneração do schema.
        whatsapp_webhook_key: (data as typeof data & { whatsapp_webhook_key: string | null }).whatsapp_webhook_key,
        anthropic_api_key: data.anthropic_api_key,
        openai_api_key: data.openai_api_key,
        elevenlabs_api_key: data.elevenlabs_api_key,
        elevenlabs_voice_id: data.elevenlabs_voice_id,
        elevenlabs_model: data.elevenlabs_model,
        elevenlabs_stability: data.elevenlabs_stability,
        elevenlabs_similarity_boost: data.elevenlabs_similarity_boost,
        elevenlabs_style: data.elevenlabs_style,
        elevenlabs_speed: data.elevenlabs_speed,
        elevenlabs_speaker_boost: data.elevenlabs_speaker_boost,
        audio_response_enabled: data.audio_response_enabled || false,
      });
    } catch (error) {
      console.error('[ApiSettings] Error loading settings:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings.whatsapp_phone_number_id && !/^\d+$/.test(settings.whatsapp_phone_number_id)) {
        toast.error('Phone Number ID deve conter apenas números');
        return;
      }
      if (settings.whatsapp_business_account_id && !/^\d+$/.test(settings.whatsapp_business_account_id)) {
        toast.error('WABA ID deve conter apenas números');
        return;
      }

      // Update global settings (no user_id filter - RLS handles admin check)
      const { error } = await supabase
        .from('lara_settings')
        .update({
          whatsapp_access_token: settings.whatsapp_access_token,
          whatsapp_business_account_id: settings.whatsapp_business_account_id,
          whatsapp_phone_number_id: settings.whatsapp_phone_number_id,
          whatsapp_verify_token: settings.whatsapp_verify_token,
          whatsapp_webhook_key: settings.whatsapp_webhook_key,
          anthropic_api_key: settings.anthropic_api_key,
          openai_api_key: settings.openai_api_key,
          elevenlabs_api_key: settings.elevenlabs_api_key,
          elevenlabs_voice_id: settings.elevenlabs_voice_id,
          elevenlabs_model: settings.elevenlabs_model,
          elevenlabs_stability: settings.elevenlabs_stability,
          elevenlabs_similarity_boost: settings.elevenlabs_similarity_boost,
          elevenlabs_style: settings.elevenlabs_style,
          elevenlabs_speed: settings.elevenlabs_speed,
          elevenlabs_speaker_boost: settings.elevenlabs_speaker_boost,
          audio_response_enabled: settings.audio_response_enabled,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id!);

      if (error) throw error;

      toast.success('Configurações de APIs salvas com sucesso.');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    toast.success('URL do webhook copiada.');
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleRotateWebhook = async () => {
    if (!settings.id) {
      toast.error('Configurações não encontradas. Recarregue a página e tente novamente.');
      return;
    }

    const webhookKey = crypto.randomUUID();
    const verifyToken = `eia-${crypto.randomUUID().replace(/-/g, '')}`;
    setRotatingWebhook(true);

    try {
      const { data, error } = await supabase
        .from('lara_settings')
        .update({
          whatsapp_webhook_key: webhookKey,
          whatsapp_verify_token: verifyToken,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Configuração não encontrada ou atualização não permitida');

      setSettings((current) => ({
        ...current,
        whatsapp_webhook_key: webhookKey,
        whatsapp_verify_token: verifyToken,
      }));
      toast.success('Nova Callback URL e novo Verify Token gerados', {
        description: 'Atualize os dois valores na Meta. A URL anterior deixou de ser aceita.',
      });
    } catch (error) {
      console.error('[ApiSettings] Error rotating WhatsApp webhook:', error);
      toast.error('Não foi possível gerar novas credenciais do webhook');
    } finally {
      setRotatingWebhook(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!settings.elevenlabs_api_key) {
      toast.error('Configure sua API Key da ElevenLabs primeiro');
      return;
    }

    if (!audioTestText.trim()) {
      toast.error('Insira um texto para converter em áudio');
      return;
    }

    setAudioGenerating(true);
    setAudioUrl(null);
    setAudioStats(null);

    try {
      const { data, error } = await supabase.functions.invoke('test-elevenlabs-tts', {
        body: { 
          text: audioTestText,
          apiKey: settings.elevenlabs_api_key,
          voiceId: settings.elevenlabs_voice_id,
          model: settings.elevenlabs_model,
          stability: settings.elevenlabs_stability,
          similarityBoost: settings.elevenlabs_similarity_boost,
          speed: settings.elevenlabs_speed,
        }
      });

      if (error) throw error;

      if (data?.success && data?.audioBase64) {
        // Create audio URL from base64
        const audioBlob = new Blob(
          [Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0))],
          { type: 'audio/mpeg' }
        );
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        setAudioStats({ duration_ms: data.duration_ms, size_kb: data.size_kb });
        toast.success(`Áudio gerado em ${(data.duration_ms / 1000).toFixed(1)}s`);
      } else {
        throw new Error(data?.error || 'Erro ao gerar áudio');
      }
    } catch (error) {
      console.error('Error generating audio:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar áudio';
      toast.error(errorMessage);
    } finally {
      setAudioGenerating(false);
    }
  };

  const handleDownloadAudio = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = 'elevenlabs-test.mp3';
    a.click();
  };

  const handleTestMessage = async () => {
    if (!settings.whatsapp_access_token || !settings.whatsapp_phone_number_id) {
      toast.error('Preencha e salve as credenciais do WhatsApp primeiro.', {
        description: 'Clique em "Salvar alterações" no topo da página antes de testar.'
      });
      return;
    }

    if (!testPhone.trim()) {
      toast.error('Insira um número de telefone');
      return;
    }

    if (!testMessage.trim()) {
      toast.error('Insira uma mensagem');
      return;
    }

    if (!testPhone.startsWith('+')) {
      toast.error('O número deve estar no formato internacional (ex: +5511999999999)');
      return;
    }

    setTestSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-whatsapp-message', {
        body: {
          phone_number: testPhone,
          message: testMessage
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Mensagem enviada com sucesso.', {
          description: `ID: ${data.message_id}`
        });
      } else {
        throw new Error(data?.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Error sending test message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao enviar mensagem de teste';
      toast.error('Falha ao enviar mensagem', {
        description: errorMessage
      });
    } finally {
      setTestSending(false);
    }
  };

  const handleSimulateAudioWebhook = async () => {
    if (!audioSimulatePhone.trim()) {
      toast.error('Insira um número de telefone');
      return;
    }

    if (!audioFile) {
      toast.error('Selecione um arquivo de áudio');
      return;
    }

    // Validate phone format
    const cleanPhone = audioSimulatePhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      toast.error('Número de telefone inválido');
      return;
    }

    setAudioSimulating(true);
    setAudioSimulateResult(null);

    try {
      // Convert file to base64
      const arrayBuffer = await audioFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const { data, error } = await supabase.functions.invoke('simulate-audio-webhook', {
        body: {
          phone: cleanPhone,
          name: audioSimulateName.trim() || undefined,
          audio_base64: base64,
          audio_mime_type: audioFile.type || 'audio/ogg'
        }
      });

      if (error) throw error;

      if (data?.success) {
        setAudioSimulateResult({
          transcription: data.transcription,
          contact_id: data.contact_id,
          conversation_id: data.conversation_id,
          message_id: data.message_id,
          queued_for_lara: data.queued_for_lara
        });
        toast.success('Áudio simulado com sucesso.', {
          description: `Transcrição: "${data.transcription?.substring(0, 50)}..."`
        });
      } else {
        throw new Error(data?.error || 'Erro ao simular áudio');
      }
    } catch (error) {
      console.error('Error simulating audio webhook:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao simular recebimento de áudio';
      toast.error('Falha na simulação', {
        description: errorMessage
      });
    } finally {
      setAudioSimulating(false);
    }
  };

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/webm', 'audio/mp4'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(ogg|mp3|wav|m4a|webm|mp4)$/i)) {
        toast.error('Formato de áudio não suportado', {
          description: 'Use .ogg, .mp3, .wav, .m4a ou .webm'
        });
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Arquivo muito grande', {
          description: 'O arquivo deve ter no máximo 10MB'
        });
        return;
      }
      
      setAudioFile(file);
      setAudioSimulateResult(null);
    }
  };

  const whatsappConfigured = settings.whatsapp_access_token
    && settings.whatsapp_business_account_id
    && settings.whatsapp_phone_number_id;
  const whatsappPartiallyConfigured = !whatsappConfigured && (
    settings.whatsapp_access_token
    || settings.whatsapp_business_account_id
    || settings.whatsapp_phone_number_id
  );
  const elevenlabsConfigured = settings.elevenlabs_api_key;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Provedores de LLM (Anthropic / OpenAI) */}
      <div className="eia-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Provedores de IA (LLM)</h3>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          A OpenAI (GPT) é o cérebro padrão da Lara — salve a chave aqui (ou defina o
          secret OPENAI_API_KEY no Supabase). A Anthropic (Claude) fica disponível como
          alternativa. O provedor e o modelo são escolhidos na aba{' '}
          <strong className="text-foreground">Agente → Comportamento</strong>.
          Se o provedor escolhido falhar e o outro tiver chave, a Lara responde pelo outro.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-muted-foreground block">Anthropic API Key</label>
              <div className={`eia-pill border ${
                settings.anthropic_api_key
                  ? 'border-success/20 bg-success/10 text-success'
                  : 'border-transparent bg-muted text-muted-foreground'
              }`}>
                {settings.anthropic_api_key ? 'Configurado' : 'Aguardando'}
              </div>
            </div>
            <div className="relative">
              <input
                type={showAnthropicKey ? "text" : "password"}
                value={settings.anthropic_api_key || ''}
                onChange={(e) => setSettings({ ...settings, anthropic_api_key: e.target.value || null })}
                placeholder="sk-ant-..."
                className="h-9 w-full rounded-lg border border-input bg-secondary px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                aria-label={showAnthropicKey ? 'Ocultar chave da Anthropic' : 'Mostrar chave da Anthropic'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Obtenha em <a href="https://platform.claude.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">platform.claude.com</a>
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-muted-foreground block">OpenAI API Key</label>
              <div className={`eia-pill border ${
                settings.openai_api_key
                  ? 'border-success/20 bg-success/10 text-success'
                  : 'border-transparent bg-muted text-muted-foreground'
              }`}>
                {settings.openai_api_key ? 'Configurado' : 'Aguardando'}
              </div>
            </div>
            <div className="relative">
              <input
                type={showOpenaiKey ? "text" : "password"}
                value={settings.openai_api_key || ''}
                onChange={(e) => setSettings({ ...settings, openai_api_key: e.target.value || null })}
                placeholder="sk-proj-..."
                className="h-9 w-full rounded-lg border border-input bg-secondary px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                aria-label={showOpenaiKey ? 'Ocultar chave da OpenAI' : 'Mostrar chave da OpenAI'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Obtenha em <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">platform.openai.com</a>
            </p>
          </div>
        </div>
      </div>

      <div className="eia-card flex items-start gap-3 p-5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">Escolha uma única conexão para o WhatsApp</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use <strong className="text-foreground">Zernio OU WhatsApp Cloud API</strong>. Não configure
            os dois caminhos ao mesmo tempo, porque ambos tentariam receber e responder as mesmas mensagens.
          </p>
        </div>
      </div>

      <ZernioApiSettings />

      <div className="flex items-center gap-4" role="separator" aria-label="Ou use a WhatsApp Cloud API">
        <span className="h-px flex-1 bg-border" />
        <span className="eia-eyebrow text-muted-foreground">Ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* WhatsApp Cloud API + Webhook */}
      <div className="eia-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground">WhatsApp Cloud API</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Integração direta com a Meta · opcional</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="eia-pill border border-border bg-secondary text-secondary-foreground">Opção 2</div>
            <div className={`eia-pill border ${
              whatsappConfigured
                ? 'border-success/20 bg-success/10 text-success'
                : 'border-transparent bg-muted text-muted-foreground'
            }`}>
              {whatsappConfigured ? 'Configurada' : whatsappPartiallyConfigured ? 'Incompleta' : 'Não configurada'}
            </div>
          </div>
        </div>

        <div className="mb-4 flex gap-3 rounded-xl border border-border bg-muted/60 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Estes dados não são obrigatórios.</p>
            <p>
              Preencha somente se a Lara for conectada diretamente à WhatsApp Cloud API da Meta.
              Se você usa a Zernio API acima, deixe o Access Token, o WABA ID e o Phone Number ID
              em branco: a Zernio gerencia essa conexão e o webhook.
            </p>
          </div>
        </div>

        {/* Mini-guia de configuração */}
        <details className="mb-4">
          <summary className="text-xs text-primary cursor-pointer hover:text-primary/80 flex items-center gap-2 py-2">
            <HelpCircle className="w-4 h-4" />
            Como obter as credenciais do WhatsApp?
          </summary>
          <div className="mt-2 p-4 rounded-lg bg-muted border border-border text-xs space-y-3">
            <div className="space-y-2">
              <p className="text-foreground font-medium">Passo a passo:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                <li>Acesse o <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Meta for Developers</a></li>
                <li>Crie ou selecione um App do tipo "Business"</li>
                <li>Adicione o produto "WhatsApp" ao app</li>
                <li>Na seção "API Setup", copie o <strong className="text-foreground">Access Token</strong> temporário (ou gere um permanente)</li>
                <li>Copie o <strong className="text-foreground">WhatsApp Business Account ID (WABA ID)</strong></li>
                <li>Copie também o <strong className="text-foreground">Phone Number ID</strong> (identificador do número)</li>
                <li>Em "Configuration" → "Webhook", cole a URL e o Verify Token abaixo</li>
              </ol>
            </div>
            <div className="pt-2 border-t border-border">
              <p className="text-muted-foreground">
                <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Documentação oficial do WhatsApp Cloud API</a>
              </p>
            </div>
          </div>
        </details>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Access Token <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <div className="relative">
              <input
                type={showWhatsAppToken ? "text" : "password"}
                value={settings.whatsapp_access_token || ''}
                onChange={(e) => setSettings({ ...settings, whatsapp_access_token: e.target.value })}
                placeholder="EAAxxxxxxxxxxxxxxx..."
                className="h-9 w-full rounded-lg border border-input bg-secondary px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowWhatsAppToken(!showWhatsAppToken)}
                aria-label={showWhatsAppToken ? 'Ocultar token do WhatsApp' : 'Mostrar token do WhatsApp'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showWhatsAppToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              WABA ID <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={settings.whatsapp_business_account_id || ''}
              onChange={(e) => setSettings({ ...settings, whatsapp_business_account_id: e.target.value || null })}
              placeholder="123456789012345"
              aria-label="WhatsApp Business Account ID"
              className="h-9 w-full rounded-lg border border-input bg-secondary px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Phone Number ID <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <input
              type="text"
              value={settings.whatsapp_phone_number_id || ''}
              onChange={(e) => setSettings({ ...settings, whatsapp_phone_number_id: e.target.value })}
              placeholder="123456789012345"
              className="h-9 w-full rounded-lg border border-input bg-secondary px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Webhook sempre visível: é parte necessária da conexão direta com a Meta. */}
        <div className="mt-5 border-t border-border pt-5">
          <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Configuração de Webhook</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Use os dois valores abaixo na Meta. Ao gerar novamente, a URL anterior é invalidada.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleRotateWebhook}
              disabled={!isAdmin || rotatingWebhook}
              className="shrink-0 gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${rotatingWebhook ? 'animate-spin' : ''}`} aria-hidden="true" />
              {rotatingWebhook ? 'Gerando...' : 'Gerar nova URL e token'}
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Callback URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookUrl}
                  readOnly
                  aria-label="Callback URL do WhatsApp"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-secondary px-3 font-mono text-sm text-muted-foreground"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={copyWebhookUrl}
                  aria-label="Copiar Callback URL"
                  className="px-3"
                >
                  {copiedWebhook ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Verify Token</label>
              <input
                type="text"
                value={settings.whatsapp_verify_token || ''}
                onChange={(event) => setSettings({ ...settings, whatsapp_verify_token: event.target.value })}
                className="h-9 w-full rounded-lg border border-input bg-secondary px-3 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ElevenLabs */}
      <div className="eia-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Mic className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">ElevenLabs (Text-to-Speech)</h3>
          </div>
          <div className={`eia-pill border ${
            elevenlabsConfigured 
              ? 'border-success/20 bg-success/10 text-success'
              : 'border-transparent bg-muted text-muted-foreground'
          }`}>
            {elevenlabsConfigured ? 'Configurado' : 'Aguardando'}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">API Key</label>
            <div className="relative">
              <input
                type={showElevenLabsKey ? "text" : "password"}
                value={settings.elevenlabs_api_key || ''}
                onChange={(e) => setSettings({ ...settings, elevenlabs_api_key: e.target.value })}
                onBlur={handleElevenLabsKeyBlur}
                placeholder="sk_xxxxxxxxxxxxxxxxxxxxxxxx"
                className="h-9 w-full rounded-lg border border-input bg-secondary px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowElevenLabsKey(!showElevenLabsKey)}
                aria-label={showElevenLabsKey ? 'Ocultar chave da ElevenLabs' : 'Mostrar chave da ElevenLabs'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showElevenLabsKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Voz</label>
              <select
                value={settings.elevenlabs_voice_id}
                onChange={(e) => setSettings({ ...settings, elevenlabs_voice_id: e.target.value })}
                className="h-9 w-full rounded-lg border border-input bg-secondary px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {VOICE_OPTIONS.map(voice => (
                  <option key={voice.id} value={voice.id}>{voice.name} - {voice.desc}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Modelo</label>
              <select
                value={settings.elevenlabs_model || 'eleven_turbo_v2_5'}
                onChange={(e) => setSettings({ ...settings, elevenlabs_model: e.target.value })}
                className="h-9 w-full rounded-lg border border-input bg-secondary px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {MODEL_OPTIONS.map(model => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Audio Response Toggle */}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Volume2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Respostas em Áudio</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Quando ativado, o agente responderá com áudios em vez de texto
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Respostas em áudio"
                  checked={settings.audio_response_enabled}
                  onChange={(e) => setSettings({ ...settings, audio_response_enabled: e.target.checked })}
                  disabled={!elevenlabsConfigured}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-background after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary ${!elevenlabsConfigured ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
              </label>
            </div>
            {!elevenlabsConfigured && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Configure a API Key da ElevenLabs para habilitar respostas em áudio
              </p>
            )}
            {settings.audio_response_enabled && elevenlabsConfigured && (
              <p className="text-xs text-success mt-2 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                Áudios recebidos serão transcritos automaticamente e o agente responderá com áudio
              </p>
            )}
          </div>

          {/* Advanced Voice Settings Collapsible */}
          <Collapsible.Root open={advancedVoiceOpen} onOpenChange={setAdvancedVoiceOpen}>
            <Collapsible.Trigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`w-4 h-4 transition-transform ${advancedVoiceOpen ? 'rotate-180' : ''}`} />
              Configurações Avançadas de Voz
            </Collapsible.Trigger>
            <Collapsible.Content className="mt-3 p-4 bg-muted rounded-lg border border-border space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-muted-foreground">Stability</label>
                    <span className="text-xs font-mono text-muted-foreground">{settings.elevenlabs_stability.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    aria-label="Velocidade da voz"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.elevenlabs_stability}
                    onChange={(e) => setSettings({ ...settings, elevenlabs_stability: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-muted-foreground">Similarity</label>
                    <span className="text-xs font-mono text-muted-foreground">{settings.elevenlabs_similarity_boost.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.elevenlabs_similarity_boost}
                    onChange={(e) => setSettings({ ...settings, elevenlabs_similarity_boost: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-muted-foreground">Style</label>
                    <span className="text-xs font-mono text-muted-foreground">{settings.elevenlabs_style.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.elevenlabs_style}
                    onChange={(e) => setSettings({ ...settings, elevenlabs_style: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-muted-foreground">Speed</label>
                    <span className="text-xs font-mono text-muted-foreground">{settings.elevenlabs_speed?.toFixed(1) || '1.0'}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={settings.elevenlabs_speed || 1.0}
                    onChange={(e) => setSettings({ ...settings, elevenlabs_speed: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    aria-label="Speaker Boost"
                    checked={settings.elevenlabs_speaker_boost}
                    onChange={(e) => setSettings({ ...settings, elevenlabs_speaker_boost: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
                <span className="text-sm text-foreground">Speaker Boost</span>
              </div>
            </Collapsible.Content>
          </Collapsible.Root>

          {/* Audio Test Section */}
          <Collapsible.Root open={audioTestOpen} onOpenChange={setAudioTestOpen} className="mt-4">
            <Collapsible.Trigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`w-4 h-4 transition-transform ${audioTestOpen ? 'rotate-180' : ''}`} />
              <Volume2 className="w-4 h-4" />
              Testar Áudio
            </Collapsible.Trigger>
            <Collapsible.Content className="mt-3 p-4 bg-muted rounded-lg border border-border space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Texto para converter em áudio</label>
                <textarea
                  value={audioTestText}
                  onChange={(e) => setAudioTestText(e.target.value)}
                  placeholder="Digite o texto que deseja converter em áudio..."
                  rows={3}
                  maxLength={1000}
                  className="w-full rounded-lg border border-input bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">{audioTestText.length}/1000 caracteres</p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleGenerateAudio}
                  disabled={audioGenerating || !settings.elevenlabs_api_key}
                >
                  {audioGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 mr-2" />
                      Gerar e ouvir
                    </>
                  )}
                </Button>

                {audioUrl && (
                  <Button
                    onClick={handleDownloadAudio}
                    variant="ghost"
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Baixar
                  </Button>
                )}
              </div>

              {!settings.elevenlabs_api_key && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Configure sua API Key da ElevenLabs acima para testar
                </p>
              )}

              {audioUrl && (
                <div className="space-y-2">
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    controls
                    className="w-full h-10"
                    autoPlay
                  />
                  {audioStats && (
                    <p className="text-xs text-muted-foreground">
                      Gerado em {(audioStats.duration_ms / 1000).toFixed(1)}s • {audioStats.size_kb}KB
                    </p>
                  )}
                </div>
              )}
            </Collapsible.Content>
          </Collapsible.Root>
        </div>
      </div>

      {/* Test Message Collapsible */}
      <Collapsible.Root open={testSectionOpen} onOpenChange={setTestSectionOpen}>
        <div className="eia-card p-6">
          <Collapsible.Trigger className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground transition-colors w-full">
            <Send className="w-4 h-4" />
            <span>Teste de Envio</span>
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${testSectionOpen ? 'rotate-180' : ''}`} />
          </Collapsible.Trigger>
          <Collapsible.Content className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Telefone</label>
                <input
                  type="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+5511999999999"
                  className="h-9 w-full rounded-lg border border-input bg-secondary px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Mensagem</label>
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Mensagem de teste..."
                  className="h-9 w-full rounded-lg border border-input bg-secondary px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleTestMessage}
                disabled={testSending}
              >
                {testSending ? (
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
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {/* Simulate Audio Reception - Seção Avançada (escondida por padrão) */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-2 py-2">
          <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
          Ferramentas Avançadas de Teste
        </summary>
        <div className="mt-2">
      <Collapsible.Root open={audioSimulateOpen} onOpenChange={setAudioSimulateOpen}>
        <div className="eia-card p-6">
          <Collapsible.Trigger className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground transition-colors w-full">
            <FileAudio className="w-4 h-4" />
            <span>Simular Recebimento de Áudio</span>
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${audioSimulateOpen ? 'rotate-180' : ''}`} />
          </Collapsible.Trigger>
          <Collapsible.Content className="mt-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Simula o recebimento de um áudio pelo WhatsApp. O áudio será transcrito e processado pela IA.
            </p>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Telefone do Contato *</label>
                <input
                  type="tel"
                  value={audioSimulatePhone}
                  onChange={(e) => setAudioSimulatePhone(e.target.value)}
                  placeholder="5511999999999"
                  className="h-9 w-full rounded-lg border border-input bg-secondary px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome do Contato (opcional)</label>
                <input
                  type="text"
                  value={audioSimulateName}
                  onChange={(e) => setAudioSimulateName(e.target.value)}
                  placeholder="João da Silva"
                  className="h-9 w-full rounded-lg border border-input bg-secondary px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* File Upload */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Arquivo de Áudio *</label>
              <div 
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  audioFile
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50 bg-muted'
                }`}
                onClick={() => audioFileInputRef.current?.click()}
              >
                <input
                  ref={audioFileInputRef}
                  type="file"
                  accept=".ogg,.mp3,.wav,.m4a,.webm,audio/*"
                  onChange={handleAudioFileChange}
                  className="hidden"
                />
                {audioFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileAudio className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <p className="text-sm text-foreground">{audioFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(audioFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAudioFile(null);
                        setAudioSimulateResult(null);
                      }}
                      className="ml-2 text-muted-foreground hover:text-foreground"
                      aria-label="Remover áudio"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Clique ou arraste um arquivo de áudio</p>
                    <p className="text-xs text-muted-foreground mt-1">.ogg, .mp3, .wav, .m4a, .webm (máx 10MB)</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSimulateAudioWebhook}
                disabled={audioSimulating || !audioFile || !audioSimulatePhone.trim()}
              >
                {audioSimulating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <FileAudio className="w-4 h-4 mr-2" />
                    Simular áudio recebido
                  </>
                )}
              </Button>
            </div>

            {/* Result Display */}
            {audioSimulateResult && (
              <div className="p-4 bg-success/10 border border-success/20 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-success">
                  <Check className="w-4 h-4" />
                  <span className="text-sm font-medium">Áudio processado com sucesso!</span>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Transcrição:</span>
                    <p className="text-foreground mt-1 p-2 bg-muted rounded border border-border">
                      "{audioSimulateResult.transcription}"
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Contact ID:</span>
                      <p className="text-foreground font-mono">{audioSimulateResult.contact_id.slice(0, 8)}...</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Conversation ID:</span>
                      <p className="text-foreground font-mono">{audioSimulateResult.conversation_id.slice(0, 8)}...</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Message ID:</span>
                      <p className="text-foreground font-mono">{audioSimulateResult.message_id.slice(0, 8)}...</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Lara:</span>
                      <p className={audioSimulateResult.queued_for_lara ? 'text-success' : 'text-muted-foreground'}>
                        {audioSimulateResult.queued_for_lara ? 'Processando' : 'Não enfileirado'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Collapsible.Content>
        </div>
      </Collapsible.Root>
        </div>
      </details>
    </div>
  );
});

ApiSettings.displayName = 'ApiSettings';

export default ApiSettings;
