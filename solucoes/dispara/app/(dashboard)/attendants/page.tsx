'use client'

import { useState } from 'react'
import { Users2, Plus, RefreshCw, Link2, Eye, EyeOff, Copy, ExternalLink, MoreVertical, MessageCircle, ArrowRightLeft } from 'lucide-react'
import { PageHeader, PageTitle, PageDescription, PageActions } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/container'

interface Attendant {
  id: string
  name: string
  accessCount: number
  lastAccess: string | null
  status: 'active' | 'inactive'
  token: string
}

const MOCK_ATTENDANTS: Attendant[] = [
  {
    id: '1',
    name: 'Rafael',
    accessCount: 2,
    lastAccess: '16/04/26, 10:34',
    status: 'active',
    token: 'rfl_a8k2m9x',
  },
  {
    id: '2',
    name: 'Eduardo',
    accessCount: 1,
    lastAccess: '16/04/26, 01:44',
    status: 'active',
    token: 'edu_j3p7n1z',
  },
]

function AttendantCard({ attendant }: { attendant: Attendant }) {
  const [showToken, setShowToken] = useState(false)
  const [copied, setCopied] = useState(false)
  const initial = attendant.name.charAt(0).toUpperCase()
  const link = `https://dispara.vercel.app/atendimento?token=${showToken ? attendant.token : '••••••••'}`

  const handleCopy = () => {
    navigator.clipboard.writeText(`https://dispara.vercel.app/atendimento?token=${attendant.token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Container variant="default" padding="lg" className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 font-semibold text-lg">
            {initial}
          </div>
          <div>
            <h3 className="font-semibold text-[var(--ds-text-primary)]">{attendant.name}</h3>
            <p className="text-xs text-[var(--ds-text-muted)]">
              {attendant.accessCount} {attendant.accessCount === 1 ? 'acesso' : 'acessos'} • Último: {attendant.lastAccess || 'Nunca'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            attendant.status === 'active'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${attendant.status === 'active' ? 'bg-green-400' : 'bg-red-400'}`} />
            {attendant.status === 'active' ? 'Ativo' : 'Inativo'}
          </span>
          <button className="p-1 rounded-md text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors">
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors">
          <Eye size={12} />
          Visualizar
        </button>
        <button className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary-500/10 text-primary-400 border border-primary-500/20 hover:bg-primary-500/20 transition-colors">
          <MessageCircle size={12} />
          Responder
        </button>
        <button className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors">
          <ArrowRightLeft size={12} />
          Transferir
        </button>
      </div>

      <div className="flex items-center gap-2 bg-[var(--ds-bg-surface)] rounded-lg px-4 py-3 border border-[var(--ds-border-subtle)]">
        <Link2 size={14} className="text-[var(--ds-text-muted)] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-[var(--ds-text-muted)] mb-0.5">Link de Acesso</p>
          <p className="text-xs text-[var(--ds-text-secondary)] font-mono truncate">{link}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowToken(!showToken)}
            className="p-1.5 rounded-md text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors"
            title={showToken ? 'Ocultar token' : 'Mostrar token'}
          >
            {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors"
            title="Copiar link"
          >
            <Copy size={14} />
          </button>
          <button
            className="p-1.5 rounded-md text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors"
            title="Abrir link"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
      {copied && (
        <p className="text-xs text-green-400">Link copiado!</p>
      )}
    </Container>
  )
}

export default function AttendantsPage() {
  const attendants = MOCK_ATTENDANTS

  return (
    <div className="space-y-6">
      <PageHeader>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-500/10 flex items-center justify-center">
            <Users2 className="w-6 h-6 text-primary-400" />
          </div>
          <div>
            <PageTitle>Atendentes</PageTitle>
            <PageDescription>Crie links de acesso para sua equipe atender pelo navegador</PageDescription>
          </div>
        </div>
        <PageActions>
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
          <Button variant="brand" size="sm">
            <Plus className="w-4 h-4" />
            Novo Atendente
          </Button>
        </PageActions>
      </PageHeader>

      {/* Info banner */}
      <Container variant="glass" padding="md">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <Link2 className="w-4 h-4 text-primary-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--ds-text-primary)]">Acesso sem conta</p>
            <p className="text-sm text-[var(--ds-text-secondary)]">
              Cada atendente recebe um link único de acesso. Não é necessário criar conta ou fazer login. Basta compartilhar o link e o atendente pode começar a usar.
            </p>
          </div>
        </div>
      </Container>

      {/* Count */}
      <p className="text-sm text-[var(--ds-text-muted)]">{attendants.length} atendentes</p>

      {/* Attendant cards */}
      <div className="space-y-4">
        {attendants.map((attendant) => (
          <AttendantCard key={attendant.id} attendant={attendant} />
        ))}
      </div>
    </div>
  )
}
