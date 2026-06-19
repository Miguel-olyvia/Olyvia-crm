import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";

export interface PromptVariable {
  /** Bare key without {{ }} — used as substitution token and record key. */
  key: string;
  label: string;
  description?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variables: PromptVariable[];
  onConfirm: (values: Record<string, string>) => void;
}

/**
 * Pede ao utilizador valores para variáveis personalizadas do tipo
 * "Preencher no contrato" detectadas no corpo da minuta no momento da geração.
 * Não toca BD — devolve `Record<bareKey, value>` via `onConfirm`.
 */
export function FillPromptVariablesDialog({ open, onOpenChange, variables, onConfirm }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      variables.forEach(v => { init[v.key] = ""; });
      setValues(init);
    }
  }, [open, variables]);

  const allFilled = variables.every(v => (values[v.key] || "").trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Preencher variáveis do contrato
          </DialogTitle>
          <DialogDescription>
            A minuta usa variáveis que precisam de ser preenchidas agora. Os valores
            ficam gravados directamente no corpo do contrato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          {variables.map(v => (
            <div key={v.key} className="space-y-1">
              <Label className="text-xs">
                {v.label} <span className="text-muted-foreground/60 font-mono ml-1">{`{{${v.key}}}`}</span>
              </Label>
              {v.description && (
                <p className="text-[11px] text-muted-foreground">{v.description}</p>
              )}
              <Input
                value={values[v.key] || ""}
                onChange={(e) => setValues(prev => ({ ...prev, [v.key]: e.target.value }))}
                placeholder={`Valor para ${v.label}`}
                className="h-8 text-sm"
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!allFilled}
            onClick={() => {
              onConfirm(values);
              onOpenChange(false);
            }}
          >
            Aplicar e gerar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FillPromptVariablesDialog;
