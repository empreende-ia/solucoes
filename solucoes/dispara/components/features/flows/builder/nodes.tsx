'use client'

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

type StartNodeType = Node<{ label?: string }, 'start'>
type MessageNodeType = Node<{ label?: string; text?: string }, 'message'>
type EndNodeType = Node<{ label?: string }, 'end'>

interface NodeShellProps {
  /** Title displayed in the node header */
  title: string
  /** Optional subtitle displayed below the title */
  subtitle?: string
  /** Visual tone/color scheme for the node */
  tone?: 'default' | 'success' | 'danger'
  /** Content to render inside the node body */
  children?: React.ReactNode
}

function NodeShell(props: NodeShellProps) {
  const tone = props.tone || 'default'
  const ring =
    tone === 'success'
      ? 'ring-primary-500/25 border-primary-500/30'
      : tone === 'danger'
        ? 'ring-red-500/25 border-red-500/30'
        : 'ring-white/10 border-[var(--ds-border-subtle)]'

  return (
    <div className={`min-w-55 rounded-2xl border ${ring} bg-slate-950/70 backdrop-blur shadow-lg shadow-black/30 ring-1`}>
      <div className="px-4 py-3 border-b border-[var(--ds-border-subtle)]">
        <div className="text-sm font-semibold text-white">{props.title}</div>
        {props.subtitle ? <div className="text-[11px] text-slate-400 mt-0.5">{props.subtitle}</div> : null}
      </div>
      <div className="px-4 py-3 text-xs text-slate-300">{props.children}</div>
    </div>
  )
}

export function StartNode({ data }: NodeProps<StartNodeType>) {
  const d = data as unknown as StartNodeType['data']
  return (
    <div className="relative">
      <NodeShell title={d?.label || 'Início'} subtitle="Entrada" tone="success">
        <div>Começo do fluxo.</div>
      </NodeShell>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function MessageNode({ data }: NodeProps<MessageNodeType>) {
  const d = data as unknown as MessageNodeType['data']
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} />
      <NodeShell title={d?.label || 'Mensagem'} subtitle="Envio" tone="default">
        <div className="line-clamp-3 whitespace-pre-wrap">{d?.text || 'Clique no nó para editar o texto.'}</div>
      </NodeShell>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function EndNode({ data }: NodeProps<EndNodeType>) {
  const d = data as unknown as EndNodeType['data']
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} />
      <NodeShell title={d?.label || 'Fim'} subtitle="Saída" tone="danger">
        <div>Encerramento do fluxo.</div>
      </NodeShell>
    </div>
  )
}

export const flowNodeTypes = {
  start: StartNode,
  message: MessageNode,
  end: EndNode,
}
