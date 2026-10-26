'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { FlowBuilderListView } from '@/components/features/flows/builder/FlowBuilderListView'
import { useFlowsBuilderController } from '@/hooks/useFlowsBuilder'

export default function FlowBuilderHomePage() {
  const controller = useFlowsBuilderController()

  return (
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>MiniApp Builder</PageTitle>
          <PageDescription>
            Crie MiniApps a partir de modelos e edite o JSON da Meta.
          </PageDescription>
        </div>
        <PageActions>
          <Link href="/templates?tab=flows">
            <Button variant="outline" className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)]">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          </Link>
        </PageActions>
      </PageHeader>

      <FlowBuilderListView
        flows={controller.flows}
        isLoading={controller.isLoading}
        isFetching={controller.isFetching}
        search={controller.search}
        onSearchChange={controller.setSearch}
        onCreate={controller.createFlowAsync}
        onCreateFromTemplate={controller.createFlowFromTemplateAsync}
        onCreateWithAI={controller.createFlowWithAIAsync}
        isCreating={controller.isCreating}
        isCreatingWithAI={controller.isCreatingWithAI}
        onDelete={controller.deleteFlow}
        isDeleting={controller.isDeleting}
        onRefresh={() => controller.refetch()}
      />
    </Page>
  )
}
