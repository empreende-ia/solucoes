import type { DirectoryKind, RelationshipActivity, RelationshipData } from '@/lib/contact-model';
import { ActivityDialog } from '@/components/workday/ActivityDialog';
interface Props { kind: DirectoryKind; recordId: string; ownerId: string | null; data: RelationshipData; activity?: RelationshipActivity; initialType?: string; onClose: () => void }
/** The 360 view uses the same editor and mutations as Activities, Tasks and Agenda. */
export function ActivityEditor({ kind, recordId, ownerId, data, activity, initialType = 'task', onClose }: Props) {
  return <ActivityDialog data={data} activity={activity} defaults={{ type: initialType, user_id: ownerId, contact_id: kind === 'contacts' ? recordId : null, company_id: kind === 'companies' ? recordId : null }} onClose={onClose} />;
}
