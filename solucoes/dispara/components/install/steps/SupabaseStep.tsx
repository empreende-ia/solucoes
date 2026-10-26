'use client';

import { useState, useCallback, useRef } from 'react';
import { ExternalLink, Loader2, CheckCircle2, ChevronDown } from 'lucide-react';
import { StepCard } from '../StepCard';
import { ServiceIcon } from '../ServiceIcon';
import { TokenInput } from '../TokenInput';
import { SuccessCheckmark } from '../SuccessCheckmark';

interface SupabaseStepProps {
  onComplete: (data: {
    pat: string;
    projectUrl: string;
    projectRef: string;
    publishableKey: string;
    secretKey: string;
    dbPass: string; // Senha do banco para usar nas migrations
  }) => void;
}

interface Organization {
  id: string;
  slug: string;
  name: string;
  plan: string;
  hasSlot: boolean;
}

type Phase =
  | 'token'           // Input do PAT
  | 'listing_orgs'    // Listando organizações
  | 'creating'        // Criando projeto
  | 'waiting'         // Aguardando projeto ficar ativo
  | 'resolving'       // Resolvendo chaves
  | 'success'         // Concluído
  | 'error';          // Erro

interface ProvisioningState {
  projectRef: string;
  projectUrl: string;
  publishableKey: string;
  secretKey: string;
  dbPass: string;
}

/**
 * Step 3: Coleta do Supabase Personal Access Token.
 *
 * Após validação do PAT, o sistema automaticamente:
 * 1. Lista organizações do usuário
 * 2. Escolhe a melhor (paga > free com slot)
 * 3. Cria projeto "dispara" (ou dispara-v2, v3...)
 * 4. Aguarda projeto ficar ACTIVE (polling)
 * 5. Resolve chaves (anon_key, service_role_key)
 * 6. Avança para próximo step
 */
export function SupabaseStep({ onComplete }: SupabaseStepProps) {
  const [pat, setPat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('token');
  const [statusMessage, setStatusMessage] = useState('');
  const [provisioningState, setProvisioningState] = useState<ProvisioningState | null>(null);

  // Ref para evitar execução dupla
  const isProvisioningRef = useRef(false);

  /**
   * Gera senha forte para o banco de dados
   */
  const generateDbPassword = (): string => {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
    const array = new Uint8Array(20);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => charset[b % charset.length]).join('');
  };

  /**
   * Fluxo completo de provisionamento
   */
  const runProvisioning = useCallback(async (accessToken: string) => {
    if (isProvisioningRef.current) return;
    isProvisioningRef.current = true;

    try {
      // ========== 1. LISTAR ORGANIZAÇÕES ==========
      setPhase('listing_orgs');
      setStatusMessage('Buscando suas organizações...');

      const orgsRes = await fetch('/api/installer/supabase/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });

      if (!orgsRes.ok) {
        const data = await orgsRes.json();
        throw new Error(data.error || 'Erro ao listar organizações');
      }

      const { organizations } = await orgsRes.json() as { organizations: Organization[] };

      if (!organizations.length) {
        throw new Error('Nenhuma organização encontrada. Crie uma em supabase.com primeiro.');
      }

      // Escolher a melhor organização (já vem ordenada: paga > free com slot)
      const targetOrg = organizations.find((o) => o.hasSlot);

      if (!targetOrg) {
        throw new Error(
          'Todas as organizações free atingiram o limite de 2 projetos. ' +
          'Pause um projeto existente ou faça upgrade para Pro.'
        );
      }

      setStatusMessage(`Usando organização "${targetOrg.name}"...`);

      // ========== 2. CRIAR PROJETO ==========
      setPhase('creating');
      setStatusMessage('Criando projeto Dispara...');

      const dbPass = generateDbPassword();
      let projectName = 'dispara';
      let attempt = 0;
      let createdProject: { id: string; url: string } | null = null;

      while (attempt < 30 && !createdProject) {
        const createRes = await fetch('/api/installer/supabase/create-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken,
            organizationSlug: targetOrg.slug, // Igual ao CRM: usa slug, não id
            name: projectName,
            dbPass,
            regionSmartGroup: 'americas', // Igual ao CRM: usa region smart group
          }),
        });

        if (createRes.ok) {
          const data = await createRes.json();
          const project = data.project;
          // Igual ao CRM: usa ref (não id)
          createdProject = { id: project.ref || project.id, url: project.url };
        } else if (createRes.status === 409) {
          // Nome já existe, tentar outro
          attempt++;
          projectName = `dispara-v${attempt + 1}`;
          setStatusMessage(`Nome em uso, tentando "${projectName}"...`);
        } else {
          const data = await createRes.json();
          throw new Error(data.error || 'Erro ao criar projeto');
        }
      }

      if (!createdProject) {
        throw new Error('Não foi possível criar projeto após 30 tentativas');
      }

      const projectRef = createdProject.id;
      const projectUrl = createdProject.url;

      setStatusMessage(`Projeto "${projectName}" criado!`);

      // ========== 3. AGUARDAR ATIVO (POLLING) ==========
      setPhase('waiting');
      setStatusMessage('Aguardando projeto ficar ativo...');

      const maxWait = 210000; // 3.5 minutos
      const pollInterval = 4000; // 4 segundos
      const startTime = Date.now();
      let isReady = false;

      while (Date.now() - startTime < maxWait && !isReady) {
        const statusRes = await fetch('/api/installer/supabase/project-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, projectRef }),
        });

        if (statusRes.ok) {
          const { isReady: ready, status } = await statusRes.json();
          isReady = ready;

          if (!isReady) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            setStatusMessage(`Status: ${status} (${elapsed}s)...`);
            await new Promise((r) => setTimeout(r, pollInterval));
          }
        } else {
          await new Promise((r) => setTimeout(r, pollInterval));
        }
      }

      if (!isReady) {
        throw new Error('Timeout aguardando projeto ficar ativo. Tente novamente em alguns minutos.');
      }

      setStatusMessage('Projeto ativo!');

      // ========== 4. RESOLVER CHAVES ==========
      setPhase('resolving');
      setStatusMessage('Obtendo chaves de API...');

      // Pequeno delay para garantir que as chaves estão disponíveis
      await new Promise((r) => setTimeout(r, 2000));

      const resolveRes = await fetch('/api/installer/supabase/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, projectRef }),
      });

      if (!resolveRes.ok) {
        const data = await resolveRes.json();
        throw new Error(data.error || 'Erro ao obter chaves');
      }

      const { publishableKey, secretKey } = await resolveRes.json();

      // ========== 5. SUCESSO ==========
      setProvisioningState({
        projectRef,
        projectUrl,
        publishableKey,
        secretKey,
        dbPass, // Guardar a senha pra usar nas migrations
      });
      setPhase('success');

    } catch (err) {
      console.error('[SupabaseStep] Erro no provisionamento:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setPhase('error');
    } finally {
      isProvisioningRef.current = false;
    }
  }, []);

  /**
   * Validação inicial do token e início do provisionamento
   */
  const handleValidateToken = useCallback(async () => {
    const trimmed = pat.trim();

    if (!trimmed.startsWith('sbp_')) {
      setError('Token deve começar com "sbp_"');
      return;
    }

    if (trimmed.length < 30) {
      setError('Token muito curto');
      return;
    }

    setError(null);
    runProvisioning(trimmed);
  }, [pat, runProvisioning]);

  /**
   * Callback quando animação de sucesso termina
   */
  const handleSuccessComplete = () => {
    if (provisioningState) {
      onComplete({
        pat: pat.trim(),
        ...provisioningState,
      });
    }
  };

  /**
   * Retry após erro
   */
  const handleRetry = () => {
    setError(null);
    setPhase('token');
    setStatusMessage('');
  };

  // ========== RENDERS ==========

  // Estado de sucesso
  if (phase === 'success') {
    return (
      <StepCard glowColor="purple">
        <SuccessCheckmark
          message="Projeto Supabase criado!"
          onComplete={handleSuccessComplete}
        />
      </StepCard>
    );
  }

  // Estado de erro
  if (phase === 'error') {
    return (
      <StepCard glowColor="red">
        <div className="flex flex-col items-center text-center py-4">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <span className="text-3xl">❌</span>
          </div>

          <h2 className="text-xl font-semibold text-slate-100">
            Erro no provisionamento
          </h2>
          <p className="mt-2 text-sm text-red-400 max-w-sm">
            {error}
          </p>

          <button
            type="button"
            onClick={handleRetry}
            className="mt-6 px-6 py-2.5 rounded-xl bg-slate-700 text-slate-100 hover:bg-slate-600 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </StepCard>
    );
  }

  // Estados de provisionamento (loading)
  if (phase !== 'token') {
    return (
      <StepCard glowColor="purple">
        <div className="flex flex-col items-center text-center py-8">
          {/* Spinner ou checkmarks */}
          <div className="relative w-20 h-20 mb-6">
            <Loader2 className="w-20 h-20 text-primary-500 animate-spin" />
          </div>

          {/* Status atual - Narrativa de Despertar */}
          <h2 className="text-lg font-medium text-slate-100">
            {phase === 'listing_orgs' && 'Olhando ao redor...'}
            {phase === 'creating' && 'Tomando forma...'}
            {phase === 'waiting' && 'Despertando...'}
            {phase === 'resolving' && 'Quase lá...'}
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            {phase === 'listing_orgs' && 'Reconhecendo o ambiente'}
            {phase === 'creating' && 'Seu assistente está nascendo'}
            {phase === 'waiting' && 'Abrindo os olhos pela primeira vez'}
            {phase === 'resolving' && 'Aprendendo a se comunicar'}
          </p>

          {/* Progress steps */}
          <div className="mt-8 flex items-center gap-2">
            {['listing_orgs', 'creating', 'waiting', 'resolving'].map((step, i) => {
              const phases = ['listing_orgs', 'creating', 'waiting', 'resolving'];
              const currentIdx = phases.indexOf(phase);
              const stepIdx = i;

              return (
                <div
                  key={step}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${
                    stepIdx < currentIdx
                      ? 'bg-primary-500'
                      : stepIdx === currentIdx
                      ? 'bg-primary-500 animate-pulse'
                      : 'bg-slate-700'
                  }`}
                />
              );
            })}
          </div>

          {/* Indicador de tempo para waiting */}
          {phase === 'waiting' && (
            <p className="mt-4 text-xs text-slate-500">
              Isso pode levar até 3 minutos...
            </p>
          )}
        </div>
      </StepCard>
    );
  }

  // Estado inicial: input do token
  return (
    <StepCard glowColor="purple">
      <div className="flex flex-col items-center text-center">
        {/* Icon */}
        <ServiceIcon service="supabase" size="lg" />

        {/* Title */}
        <h2 className="mt-4 text-xl font-semibold text-slate-100">
          Configure o banco de dados
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Cole seu Personal Access Token do Supabase
        </p>

        {/* Info box */}
        <div className="w-full mt-4 p-3 rounded-lg bg-primary-500/10 border border-primary-500/20">
          <div className="flex items-center gap-2 text-primary-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <p className="text-xs text-left">
              Criaremos automaticamente um projeto dedicado para o Dispara
            </p>
          </div>
        </div>

        {/* Input */}
        <div className="w-full mt-6">
          <TokenInput
            value={pat}
            onChange={(v) => {
              setPat(v);
              setError(null);
            }}
            placeholder="sbp_xxxxxxxxxxxxxxxx"
            error={error || undefined}
            minLength={30}
            autoSubmitLength={40}
            onAutoSubmit={handleValidateToken}
            accentColor="purple"
          />
        </div>

        {/* Collapsible help */}
        <details className="w-full mt-6 group">
          <summary className="flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 cursor-pointer list-none transition-colors">
            <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
            Como criar o token?
          </summary>
          <div className="mt-3 p-3 rounded-lg bg-slate-800/50 text-left space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
              <li>Acesse <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">supabase.com/dashboard/account/tokens</a></li>
              <li>Clique em <strong className="text-slate-300">Generate new token</strong></li>
              <li>Nome: <strong className="text-slate-300">dispara</strong></li>
              <li>Copie e cole o token acima</li>
            </ol>
            <p className="text-xs text-slate-500 pt-1 border-t border-slate-700/50">
              💡 O projeto Supabase será criado automaticamente
            </p>
          </div>
        </details>
      </div>
    </StepCard>
  );
}
