'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCampaignsController } from '@/hooks/useCampaigns'
import { CampaignListView } from '@/components/features/campaigns/CampaignListView'
import { OrganizationModals } from '@/components/features/campaigns/OrganizationModals'
import type { CampaignListResult } from '@/services/campaignService'

export function CampaignsClientWrapper({ initialData }: { initialData?: CampaignListResult }) {
    const router = useRouter()
    const [organizationModalOpen, setOrganizationModalOpen] = useState(false)
    const [organizationModalTab, setOrganizationModalTab] = useState<'folders' | 'tags'>('folders')

    const {
        campaigns,
        isLoading,
        filter,
        searchTerm,
        setFilter,
        setSearchTerm,
        currentPage,
        totalPages,
        totalFiltered,
        setCurrentPage,
        onDelete,
        onDuplicate,
        onRefresh,
        onMoveToFolder,
        deletingId,
        duplicatingId,
        movingToFolderId,
        lastDuplicatedCampaignId,
        clearLastDuplicatedCampaignId,
        folderFilter,
        tagFilter,
        setFolderFilter,
        setTagFilter,
    } = useCampaignsController(initialData)

    // Não mostra loading se já temos initialData do servidor
    const showLoading = isLoading && !initialData

    // Memoiza handler para evitar re-renders desnecessários no CampaignTableRow
    const handleRowClick = useCallback((id: string) => {
        router.push(`/campaigns/${id}`)
    }, [router])

    // Após clonar, navegar automaticamente para a campanha recém-criada.
    useEffect(() => {
        if (!lastDuplicatedCampaignId) return
        router.push(`/campaigns/${lastDuplicatedCampaignId}`)
        clearLastDuplicatedCampaignId?.()
    }, [lastDuplicatedCampaignId, router, clearLastDuplicatedCampaignId])

    // Handler para abrir modal de organização (pastas/tags)
    const handleManageFolders = useCallback(() => {
        setOrganizationModalTab('folders')
        setOrganizationModalOpen(true)
    }, [])

    return (
        <>
            <CampaignListView
                campaigns={campaigns}
                isLoading={showLoading}
                filter={filter}
                searchTerm={searchTerm}
                onFilterChange={setFilter}
                onSearchChange={setSearchTerm}
                currentPage={currentPage}
                totalPages={totalPages}
                totalFiltered={totalFiltered}
                onPageChange={setCurrentPage}
                onRefresh={onRefresh}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onRowClick={handleRowClick}
                onMoveToFolder={onMoveToFolder}
                deletingId={deletingId}
                duplicatingId={duplicatingId}
                movingToFolderId={movingToFolderId}
                folderFilter={folderFilter}
                tagFilter={tagFilter}
                onFolderFilterChange={setFolderFilter}
                onTagFilterChange={setTagFilter}
                onManageFolders={handleManageFolders}
            />

            <OrganizationModals
                isOpen={organizationModalOpen}
                onClose={() => setOrganizationModalOpen(false)}
                defaultTab={organizationModalTab}
            />
        </>
    )
}
