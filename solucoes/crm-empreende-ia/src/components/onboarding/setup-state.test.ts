import { describe, expect, it } from 'vitest';
import { emptySetupEvidence, nextSetupStep, parseGuideStep, SETUP_STEPS, setupGuideKey } from './setup-state';

describe('configuration guide position', () => {
  it('has exactly the five real commercial requirements and chooses the first unverified one', () => {
    expect(SETUP_STEPS.map((step) => step.id)).toEqual(['identity', 'pipeline', 'contact', 'opportunity', 'activity']);
    expect(nextSetupStep(emptySetupEvidence())).toBe('identity');
    expect(nextSetupStep({ ...emptySetupEvidence(), identity: 'done', pipeline: 'done', contact: 'error' })).toBe('contact');
    expect(nextSetupStep({ identity: 'done', pipeline: 'done', contact: 'done', opportunity: 'done', activity: 'done' })).toBe('identity');
  });
  it('accepts only a stable step and rejects stale, malformed and personal data as position', () => {
    expect(parseGuideStep(JSON.stringify({ version: 1, stepId: 'contact' }))).toBe('contact');
    for (const value of [null, 'invalid', '{', 'null', JSON.stringify({ version: 2, stepId: 'contact' }), JSON.stringify({ version: 1, stepId: 'private@example.com' })]) expect(parseGuideStep(value)).toBeNull();
  });
  it('keeps saved position separated by organization and person', () => {
    expect(setupGuideKey('org:a', 'user/b')).toBe('empreende-crm:setup-guide:v1:org%3Aa:user%2Fb');
    expect(setupGuideKey('org:a', 'user/b')).not.toBe(setupGuideKey('org', 'a:user/b'));
    expect(setupGuideKey('org:a', 'user/b')).not.toBe(setupGuideKey('org:a', 'other'));
  });
});
