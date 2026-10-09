/**
 * Janela de confirmacao de uma accao do RH sobre o fim do contrato -- Renovar ou
 * Terminar --, com o motivo opcional. Uma so janela para as duas: so mudam o
 * titulo, a descricao e o texto do botao. Quem a abre decide quando mostrar os
 * botoes (so com `hr.pessoas.vinculos.edit`); quem decide mesmo e a base.
 *
 * `onConfirmar` devolve o texto do erro (ja traduzido) ou `null` se correu
 * bem; com erro a janela fica aberta, com o erro a vista, para se poder
 * corrigir ou cancelar -- nunca se perde a accao em silencio.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";

interface AccaoFimContratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  descricao: string;
  confirmarLabel: string;
  saving: boolean;
  onConfirmar: (motivo: string | null) => Promise<string | null>;
}

export function AccaoFimContratoDialog({
  open,
  onOpenChange,
  titulo,
  descricao,
  confirmarLabel,
  saving,
  onConfirmar,
}: AccaoFimContratoDialogProps) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMotivo("");
      setErro(null);
    }
  }, [open]);

  const confirmar = async () => {
    const texto = motivo.trim();
    const resultado = await onConfirmar(texto === "" ? null : texto);
    if (resultado === null) {
      onOpenChange(false);
      return;
    }
    setErro(resultado);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="hr-fim-contrato-accao-motivo">{t("hr.fimContrato.motivo")}</Label>
          <Textarea
            id="hr-fim-contrato-accao-motivo"
            value={motivo}
            rows={3}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        {erro && (
          <p className="text-sm text-destructive" role="alert">
            {erro}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void confirmar()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {confirmarLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
