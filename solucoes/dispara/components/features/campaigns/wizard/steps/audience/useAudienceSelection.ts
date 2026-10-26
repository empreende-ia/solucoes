import { useMemo, useCallback } from 'react';
import { ContactStatus } from '@/types';
import { AudienceCriteria, AudiencePreset, AudienceStats } from './types';
import type { Contact, CustomFieldDefinition } from '@/types';

interface UseAudienceSelectionParams {
  allContacts: Contact[];
  audienceStats?: AudienceStats;
  audiencePreset?: AudiencePreset;
  audienceCriteria?: AudienceCriteria;
  customFields: CustomFieldDefinition[];
  recipientSource: 'all' | 'specific' | 'test' | null;
  isJobsAudienceMode: boolean;
}

export function useAudienceSelection({
  allContacts,
  audienceStats,
  audiencePreset,
  audienceCriteria,
  customFields,
  recipientSource,
  isJobsAudienceMode,
}: UseAudienceSelectionParams) {
  // Eligible contacts count
  const eligibleContactsCount = useMemo(() => {
    if (audienceStats) return audienceStats.eligible;
    return (allContacts || []).filter((c) => c.status !== ContactStatus.OPT_OUT).length;
  }, [allContacts, audienceStats]);

  // Segments subtitle
  const segmentsSubtitle = useMemo(() => {
    if (audiencePreset === 'no_tags' || audienceCriteria?.noTags) {
      return `Sem tags • ${audienceStats?.noTagsEligible ?? 0} contatos`;
    }

    if (audienceCriteria?.uf) {
      const uf = String(audienceCriteria.uf).trim().toUpperCase();
      const count = (audienceStats?.brUfCounts ?? []).find((x) => x.uf === uf)?.count ?? 0;
      return `UF: ${uf} • ${count} contatos`;
    }

    if (audienceCriteria?.ddi) {
      const ddi = String(audienceCriteria.ddi).trim().replace(/^\+/, '');
      const count =
        (audienceStats?.ddiCountsEligible ?? []).find((x) => String(x.ddi) === ddi)?.count ?? 0;
      return `DDI +${ddi} • ${count} contatos`;
    }

    if (audienceCriteria?.customFieldKey) {
      const key = String(audienceCriteria.customFieldKey).trim();
      const def = (customFields || []).find((f) => f.key === key);
      const label = def?.label || key;
      const count =
        (audienceStats?.customFieldCountsEligible ?? []).find((x) => x.key === key)?.count ?? 0;
      return `${label} • ${count} contatos`;
    }

    if (audienceCriteria?.includeTag) {
      const tag = String(audienceCriteria.includeTag).trim();
      const tagKey = tag.toLowerCase();
      const count =
        (audienceStats?.tagCountsEligible ?? []).find(
          (x) => String(x.tag).trim().toLowerCase() === tagKey
        )?.count ?? 0;
      return `Tag: ${tag} • ${count} contatos`;
    }

    const totalTags = audienceStats?.tagCountsEligible?.length ?? 0;
    return totalTags > 0 ? `${totalTags} tags disponíveis` : 'Escolha uma tag';
  }, [audienceCriteria, audiencePreset, audienceStats, customFields]);

  // Is all criteria selected (no refinements)
  const isAllCriteriaSelected = useMemo(() => {
    if (!audienceCriteria) return audiencePreset === 'all';
    const status = audienceCriteria.status ?? 'ALL';
    const includeTag = (audienceCriteria.includeTag || '').trim();
    const uf = (audienceCriteria.uf || '').trim();
    const ddi = (audienceCriteria.ddi || '').trim();
    const cfk = (audienceCriteria.customFieldKey || '').trim();
    const createdWithinDays = audienceCriteria.createdWithinDays ?? null;
    const noTags = !!audienceCriteria.noTags;

    return (
      status === 'ALL' &&
      !includeTag &&
      !uf &&
      !ddi &&
      !cfk &&
      !noTags &&
      !createdWithinDays
    );
  }, [audienceCriteria, audiencePreset]);

  // Is auto specific selection (segment-based)
  const isAutoSpecificSelection = useMemo(() => {
    if (recipientSource !== 'specific') return false;
    if (!isJobsAudienceMode) return false;
    return (audienceCriteria?.excludeOptOut ?? true) === true;
  }, [recipientSource, isJobsAudienceMode, audienceCriteria?.excludeOptOut]);

  // Is "All" card selected
  const isAllCardSelected = useMemo(() => {
    if (!isJobsAudienceMode) return false;
    if (recipientSource === 'test') return false;
    return audiencePreset === 'all' || (recipientSource === 'specific' && isAllCriteriaSelected);
  }, [audiencePreset, isAllCriteriaSelected, isJobsAudienceMode, recipientSource]);

  // Is "Segments" card selected
  const isSegmentsCardSelected = useMemo(() => {
    if (!isJobsAudienceMode) return false;
    if (recipientSource === 'test') return false;
    return recipientSource === 'specific' && !isAllCriteriaSelected;
  }, [isAllCriteriaSelected, isJobsAudienceMode, recipientSource]);

  return {
    eligibleContactsCount,
    segmentsSubtitle,
    isAllCriteriaSelected,
    isAutoSpecificSelection,
    isAllCardSelected,
    isSegmentsCardSelected,
  };
}
