/**
 * Account Health Check
 *
 * Validates WhatsApp Business Account status before sending campaigns
 * Usa o endpoint do servidor (/api/health) para validar conectividade básica.
 */

import { logger } from './logger';

// ============================================================================
// Types
// ============================================================================

export interface AccountHealth {
  isHealthy: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  checks: HealthCheck[];
  lastChecked: Date;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: Record<string, unknown>;
}

export interface WhatsAppAccountInfo {
  [key: string]: unknown;
  verified_name?: string;
  quality_rating?: 'GREEN' | 'YELLOW' | 'RED';
  messaging_limit_tier?: string;
  account_mode?: 'SANDBOX' | 'LIVE';
  is_pin_enabled?: boolean;
  status?: string;
}

// ============================================================================
// Health Check Implementation
// ============================================================================

/**
 * Performs comprehensive health check using server API
 * WhatsApp credentials são obtidas do Supabase (settings) ou env vars.
 */
export async function checkAccountHealth(): Promise<AccountHealth> {
  const checks: HealthCheck[] = [];

  try {
    // Use server health endpoint
    const response = await fetch('/api/health');
    
    if (!response.ok) {
      return {
        isHealthy: false,
        status: 'unhealthy',
        checks: [{
          name: 'Servidor',
          status: 'fail',
          message: 'Não foi possível conectar ao servidor'
        }],
        lastChecked: new Date(),
      };
    }

    const health = await response.json();

    // Check WhatsApp
    if (health.services?.whatsapp?.status === 'ok') {
      checks.push({
        name: 'WhatsApp API',
        status: 'pass',
        message: health.services.whatsapp.message || 'Conectado',
        details: { phoneNumber: health.services.whatsapp.phoneNumber }
      });
    } else if (health.services?.whatsapp?.status === 'not_configured') {
      checks.push({
        name: 'WhatsApp API',
        status: 'fail',
        message: 'Credenciais não configuradas. Vá para Configurações.'
      });
    } else {
      checks.push({
        name: 'WhatsApp API',
        status: 'fail',
        message: health.services?.whatsapp?.message || 'Erro de conexão'
      });
    }

    // Determine overall health
    const failedChecks = checks.filter(c => c.status === 'fail');
    const warnChecks = checks.filter(c => c.status === 'warn');

    let status: AccountHealth['status'] = 'healthy';
    let isHealthy = true;

    if (failedChecks.length > 0) {
      status = 'unhealthy';
      isHealthy = false;
    } else if (warnChecks.length > 0) {
      status = 'degraded';
    }

    const result: AccountHealth = {
      isHealthy,
      status,
      checks,
      lastChecked: new Date(),
    };

    logger.info('Account health check completed', {
      status: result.status,
      isHealthy: result.isHealthy,
      failedChecks: failedChecks.length,
      warnChecks: warnChecks.length,
    });

    return result;

  } catch (error) {
    logger.error('Health check failed', { error });
    return {
      isHealthy: false,
      status: 'unknown',
      checks: [{
        name: 'Conexão',
        status: 'fail',
        message: 'Erro ao verificar status do sistema'
      }],
      lastChecked: new Date(),
    };
  }
}

// ============================================================================
// Quick Health Check
// ============================================================================

/**
 * Quick health check - just verifies credentials and basic connectivity
 * Use this before starting a campaign
 * Exige WhatsApp conectado (para envio). O agendamento/processamento assíncrono
 * de campanhas roda via pg_cron do Supabase (não depende de serviço externo).
 */
export async function quickHealthCheck(): Promise<{
  canSend: boolean;
  reason?: string;
}> {
  try {
    // Use server health endpoint
    const response = await fetch('/api/health');
    
    if (!response.ok) {
      return {
        canSend: false,
        reason: 'Erro ao verificar status do sistema.',
      };
    }

    const health = await response.json();
    
    // Check if WhatsApp is connected
    if (health.services?.whatsapp?.status !== 'ok') {
      return {
        canSend: false,
        reason: health.services?.whatsapp?.message || 'WhatsApp não configurado. Vá para Configurações.',
      };
    }

    return { canSend: true };
  } catch {
    return {
      canSend: false,
      reason: 'Erro de conexão com o servidor.',
    };
  }
}

// ============================================================================
// Health Summary for UI
// ============================================================================

/**
 * Gets a human-readable summary of account health
 */
export function getHealthSummary(health: AccountHealth): {
  icon: string;
  color: string;
  title: string;
  description: string;
} {
  switch (health.status) {
    case 'healthy':
      return {
        icon: '✅',
        color: 'green',
        title: 'Conta Saudável',
        description: 'Tudo funcionando normalmente. Pronto para enviar.',
      };

    case 'degraded':
      return {
        icon: '⚠️',
        color: 'yellow',
        title: 'Atenção',
        description: 'Alguns avisos encontrados. Pode enviar, mas revise os alertas.',
      };

    case 'unhealthy':
      return {
        icon: '❌',
        color: 'red',
        title: 'Problema Detectado',
        description: 'Existem problemas que impedem o envio. Corrija antes de continuar.',
      };

    case 'unknown':
    default:
      return {
        icon: '❓',
        color: 'gray',
        title: 'Status Desconhecido',
        description: 'Não foi possível verificar o status da conta.',
      };
  }
}
