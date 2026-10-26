export default function Loading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-[var(--ds-text-secondary)] text-sm">Carregando...</span>
      </div>
    </div>
  )
}
