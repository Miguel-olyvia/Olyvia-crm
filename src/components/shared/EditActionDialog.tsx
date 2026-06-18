import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface EditActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interactionId: string;
  currentType: string;
  currentDate: string;
  onSaved?: () => void;
}

const NEXT_ACTIONS = [
  { value: "follow_up", label: "Follow-up" },
  { value: "send_proposal", label: "Enviar proposta" },
  { value: "schedule_meeting", label: "Agendar reunião" },
  { value: "send_info", label: "Enviar informação" },
];

export function EditActionDialog({
  open, onOpenChange, interactionId, currentType, currentDate, onSaved,
}: EditActionDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [actionType, setActionType] = useState(currentType);
  const [actionDate, setActionDate] = useState("");

  useEffect(() => {
    if (open) {
      setActionType(currentType);
      try {
        setActionDate(format(new Date(currentDate), "yyyy-MM-dd'T'HH:mm"));
      } catch {
        setActionDate("");
      }
    }
  }, [open, currentType, currentDate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("entity_interactions")
        .update({
          next_action_type: actionType,
          next_action_date: actionDate ? new Date(actionDate).toISOString() : null,
        })
        .eq("id", interactionId);

      if (error) throw error;
      toast({ title: "Acção actualizada" });
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("entity_interactions")
        .update({ next_action_type: null, next_action_date: null })
        .eq("id", interactionId);

      if (error) throw error;
      toast({ title: "Acção removida" });
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Editar Próxima Acção
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de acção</Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NEXT_ACTIONS.map(a => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Data/hora</Label>
            <Input
              type="datetime-local"
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="destructive" size="sm" onClick={handleRemove} disabled={saving}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Remover
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
