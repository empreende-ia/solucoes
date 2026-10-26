import { useMemo, useCallback } from 'react';
import { humanizePrecheckReason, humanizeVarSource } from '@/lib/precheck-humanizer';
import type { MissingParamDetail } from '@/lib/whatsapp/template-contract';
import type { 
  PrecheckResult, 
  MissingSummaryItem, 
  BatchFixCandidate,
  QuickEditTarget,
  QuickEditFocus,
  TemplateVariables,
  TemplateVariableInfo,
} from '../types';
import { formatVarKeyForHumans, getSuggestedValueForSlot } from '../utils/formatting';

interface UseWizardPrecheckLogicParams {
  precheckResult?: PrecheckResult | null;
  customFieldLabelByKey: Record<string, string>;
  templateVariables: TemplateVariables;
  templateVariableInfo?: TemplateVariableInfo;
  setTemplateVariables: (vars: TemplateVariables) => void;
}

export function useWizardPrecheckLogic({
  precheckResult,
  customFieldLabelByKey,
  templateVariables,
  templateVariableInfo,
  setTemplateVariables,
}: UseWizardPrecheckLogicParams) {
  /**
   * Parses precheckResult to extract all missing parameter details
   */
  const missingParams = useMemo<MissingParamDetail[]>(() => {
    const results = (precheckResult as any)?.results as any[] | undefined;
    if (!results || !Array.isArray(results)) return [];

    const out: MissingParamDetail[] = [];
    const parseReason = (reason: string): MissingParamDetail[] => {
      if (!reason || typeof reason !== 'string') return [];
      if (!reason.includes('Variaveis obrigatorias sem valor:')) return [];

      const tail = reason.split('Variaveis obrigatorias sem valor:')[1] || '';
      const parts = tail.split(',').map(s => s.trim()).filter(Boolean);
      const parsed: MissingParamDetail[] = [];

      for (const p of parts) {
        // button:0:1 (raw="{{email}}")
        const btn = p.match(/^button:(\d+):(\w+) \(raw="([\s\S]*?)"\)$/);
        if (btn) {
          parsed.push({ where: 'button', buttonIndex: Number(btn[1]), key: String(btn[2]), raw: btn[3] });
          continue;
        }
        // body:1 (raw="<vazio>")
        const hb = p.match(/^(header|body):(\w+) \(raw="([\s\S]*?)"\)$/);
        if (hb) {
          parsed.push({ where: hb[1] as any, key: String(hb[2]), raw: hb[3] });
        }
      }
      return parsed;
    };

    for (const r of results) {
      if (r?.ok) continue;
      if (r?.skipCode !== 'MISSING_REQUIRED_PARAM') continue;

      const missing = r?.missing;
      if (Array.isArray(missing) && missing.length > 0) {
        out.push(
          ...missing
            .map((m: any) => {
              if (!m) return null;
              const where = m.where as MissingParamDetail['where'];
              const key = String(m.key ?? '');
              const raw = String(m.raw ?? '');
              const buttonIndex = m.buttonIndex === undefined ? undefined : Number(m.buttonIndex);
              if (!where || !key) return null;
              return { where, key, raw, ...(where === 'button' ? { buttonIndex } : {}) } as MissingParamDetail;
            })
            .filter((x): x is MissingParamDetail => x !== null)
        );
        continue;
      }

      const reason = String(r?.reason || '');
      out.push(...parseReason(reason));
    }

    return out;
  }, [precheckResult]);

  /**
   * Aggregates missing params into a summary with counts
   */
  const missingSummary = useMemo<MissingSummaryItem[]>(() => {
    const map = new Map<string, MissingSummaryItem>();
    for (const m of missingParams) {
      const id = m.where === 'button' ? `button:${m.buttonIndex}:${m.key}` : `${m.where}:${m.key}`;
      const cur = map.get(id) || { where: m.where, key: m.key, buttonIndex: m.buttonIndex, count: 0, rawSamples: new Set<string>() };
      cur.count += 1;
      if (m.raw) cur.rawSamples.add(m.raw);
      map.set(id, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [missingParams]);

  /**
   * Computes candidates for batch fix (contacts with missing required params)
   */
  const batchFixCandidates = useMemo<BatchFixCandidate[]>(() => {
    const results = (precheckResult as any)?.results as any[] | undefined;
    if (!results || !Array.isArray(results)) return [];

    const out: BatchFixCandidate[] = [];
    const seen = new Set<string>();

    for (const r of results) {
      if (!r || r.ok) continue;
      if (r.skipCode !== 'MISSING_REQUIRED_PARAM') continue;
      if (!r.contactId) continue;

      const missing = (r.missing as MissingParamDetail[] | undefined) || [];

      const targets: QuickEditTarget[] = [];
      for (const m of missing) {
        const inferred = humanizeVarSource(String(m.raw || '<vazio>'), customFieldLabelByKey);
        const f = inferred.focus || null;
        if (f) targets.push(f as any);
      }

      const dedupedTargets = Array.from(
        new Map(
          targets.map((t) => [
            t.type === 'email'
              ? 'email'
              : t.type === 'name'
                ? 'name'
                : `custom_field:${(t as any).key}`,
            t,
          ])
        ).values()
      );

      let focus: QuickEditFocus = null;
      if (dedupedTargets.length === 1) focus = dedupedTargets[0];
      if (dedupedTargets.length > 1) focus = { type: 'multi', targets: dedupedTargets };

      if (!focus) {
        const h = humanizePrecheckReason(String(r.reason || ''), { customFieldLabelByKey });
        focus = h.focus || null;
      }

      if (!focus) continue;

      const contactId = String(r.contactId);
      if (seen.has(contactId)) continue;
      seen.add(contactId);
      out.push({ contactId, focus });
    }

    return out;
  }, [precheckResult, customFieldLabelByKey]);

  /**
   * Applies a quick fill value to a template variable slot
   */
  const applyQuickFill = useCallback((
    slot: { where: 'header' | 'body' | 'button'; key: string; buttonIndex?: number },
    value: string
  ) => {
    if (slot.where === 'header') {
      const idx = (templateVariableInfo?.header || []).findIndex(v => String(v.key) === String(slot.key));
      if (idx < 0) return;
      const newHeader = [...templateVariables.header];
      newHeader[idx] = value;
      setTemplateVariables({ ...templateVariables, header: newHeader });
      return;
    }
    if (slot.where === 'body') {
      const idx = (templateVariableInfo?.body || []).findIndex(v => String(v.key) === String(slot.key));
      if (idx < 0) return;
      const newBody = [...templateVariables.body];
      newBody[idx] = value;
      setTemplateVariables({ ...templateVariables, body: newBody });
      return;
    }
    if (slot.where === 'button') {
      const bIdx = Number(slot.buttonIndex);
      const key = String(slot.key);
      if (!Number.isFinite(bIdx) || bIdx < 0) return;

      // Maintain compatibility with current UI (button_{idx}_0) and contract (accepts legacy and modern)
      const legacyKey = `button_${bIdx}_${Math.max(0, Number(key) - 1)}`;
      const modernKey = `button_${bIdx}_${key}`;

      setTemplateVariables({
        ...templateVariables,
        buttons: {
          ...(templateVariables.buttons || {}),
          [legacyKey]: value,
          [modernKey]: value,
        },
      });
      return;
    }
  }, [templateVariables, templateVariableInfo, setTemplateVariables]);

  /**
   * Gets suggested value for a slot based on its key
   */
  const getFixedValueSuggestion = useCallback((key: string): string => {
    return getSuggestedValueForSlot(key);
  }, []);

  /**
   * Creates dialog title for fixed value input
   */
  const getFixedValueDialogTitle = useCallback((key: string): string => {
    return `Valor fixo (teste) - ${formatVarKeyForHumans(String(key))}`;
  }, []);

  return {
    missingParams,
    missingSummary,
    batchFixCandidates,
    applyQuickFill,
    getFixedValueSuggestion,
    getFixedValueDialogTitle,
  };
}
