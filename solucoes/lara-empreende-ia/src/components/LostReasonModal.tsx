import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/Button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface LostReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  dealTitle: string;
}

export const LostReasonModal = ({ open, onOpenChange, onConfirm, dealTitle }: LostReasonModalProps) => {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm(reason);
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-popover border-border" aria-describedby="lost-reason-description">
        <DialogHeader>
          <DialogTitle className="text-foreground">Marcar Deal como Perdido</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Você está marcando "{dealTitle}" como perdido. Por favor, informe o motivo.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo da Perda *</Label>
            <Textarea
              id="reason"
              placeholder="Ex: Cliente escolheu concorrente, orçamento insuficiente, timing inadequado..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!reason.trim()}
            variant="danger"
          >
            Confirmar perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
