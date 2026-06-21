import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageSquare } from "lucide-react";

interface ChangeReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  title?: string;
  description?: string;
  required?: boolean;
}

export function ChangeReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Razão da alteração",
  description = "Adicione uma nota sobre esta alteração (opcional)",
  required = false,
}: ChangeReasonDialogProps) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (required && !reason.trim()) return;
    onConfirm(reason);
    setReason("");
    onOpenChange(false);
  };

  const handleSkip = () => {
    onConfirm("");
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          
          <div className="space-y-2">
            <Label htmlFor="reason">
              Nota / Razão {required && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="reason"
              placeholder="Ex: Cliente pediu atualização de valores..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {!required && (
            <Button variant="ghost" onClick={handleSkip}>
              Saltar
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={required && !reason.trim()}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
