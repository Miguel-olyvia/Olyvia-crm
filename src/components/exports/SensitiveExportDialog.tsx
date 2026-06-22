import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SensitiveExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sensitiveFields: string[];
  onConfirm: (includeSensitive: boolean) => void;
  loading?: boolean;
}

export function SensitiveExportDialog({
  open,
  onOpenChange,
  sensitiveFields,
  onConfirm,
  loading = false,
}: SensitiveExportDialogProps) {
  const chooseExport = (includeSensitive: boolean) => {
    onOpenChange(false);
    onConfirm(includeSensitive);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
            </span>
            Exportar dados pessoais
          </DialogTitle>
          <DialogDescription className="pt-2 text-left">
            Esta exportação pode incluir {sensitiveFields.join(", ")}. A inclusão destes dados
            sensíveis fica registada na auditoria.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground">
          Use a versão minimizada sempre que os dados pessoais não forem necessários.
        </div>

        <DialogFooter className="gap-2 sm:flex-col">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={loading}
            onClick={() => chooseExport(false)}
          >
            Exportar sem dados sensíveis
          </Button>
          <Button
            type="button"
            className="w-full"
            disabled={loading}
            onClick={() => chooseExport(true)}
          >
            Incluir e exportar
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
