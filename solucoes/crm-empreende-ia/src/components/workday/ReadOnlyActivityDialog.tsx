import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ds/dialog';
import { Button } from '@/components/ds/button';
export function ReadOnlyActivityDialog({ onClose }: { onClose: () => void }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Acesso somente para consulta</DialogTitle><DialogDescription>Seu papel não permite criar atividades. Peça a um administrador para revisar suas permissões.</DialogDescription></DialogHeader><DialogFooter><Button onClick={onClose}>Voltar à rotina</Button></DialogFooter></DialogContent></Dialog>;
}
