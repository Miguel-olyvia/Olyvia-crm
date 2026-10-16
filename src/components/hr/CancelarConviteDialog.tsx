/**
 * "Cancelar a admissao": termina o processo aberto, sem decisao sobre a pessoa.
 *
 * Cancelar NAO e rejeitar, e o link deixa de funcionar: o modal di-lo antes de
 * pedir o motivo, que e obrigatorio e INTERNO (a pessoa nao o ve). A base
 * decide se se pode (estado aberto; desde `aprovada` exige tambem
 * `hr.onboarding.approve`): a recusa volta em portugues, dentro do modal, que
 * fica aberto com o motivo escrito.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Ban, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAcoesConviteAdmissao } from "@/hooks/useAcoesConviteAdmissao";
import { useDevolverFoco } from "@/components/hr/useDevolverFoco";
import { MOTIVO_CANCELAR_MAX } from "@/lib/hr/estadoAdmissao";
import { toast } from "@/lib/toast";

interface CancelarConviteDialogProps {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  conviteId: string;
  /** Chamado quando a base aceitou: quem chama rele o estado. */
  onConcluido: () => void;
}

export function CancelarConviteDialog({ open, onOpenChange, conviteId, onConcluido }: CancelarConviteDialogProps) {
  const { t } = useTranslation();
  const { cancelar, aExecutar } = useAcoesConviteAdmissao();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [motivoEmFalta, setMotivoEmFalta] = useState(false);
  const campoMotivoRef = useRef<HTMLTextAreaElement>(null);
  const aoFechar = useDevolverFoco(open);

  // Cada abertura recomeca limpa.
  useEffect(() => {
    if (!open) return;
    setMotivo("");
    setErro(null);
    setMotivoEmFalta(false);
  }, [open]);

  const confirmar = async () => {
    if (motivo.trim() === "") {
      setMotivoEmFalta(true);
      setErro(t("hr.convite.cancelar.motivoObrigatorio"));
      campoMotivoRef.current?.focus();
      return;
    }
    setMotivoEmFalta(false);
    setErro(null);
    const resultado = await cancelar(conviteId, motivo);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    toast.success(t("hr.convite.cancelar.sucesso"));
    onConcluido();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(aberto) => (aExecutar ? undefined : onOpenChange(aberto))}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={aoFechar}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-4 w-4" aria-hidden="true" />
            {t("hr.convite.cancelar.titulo")}
          </DialogTitle>
          <DialogDescription>{t("hr.convite.cancelar.aviso")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="hr-convite-cancelar-motivo">
              {t("hr.convite.cancelar.motivo")}
              <span aria-hidden="true" className="ml-0.5 text-destructive">
                *
              </span>
              <span className="sr-only"> ({t("hr.campos.obrigatorio")})</span>
            </Label>
            <Textarea
              id="hr-convite-cancelar-motivo"
              ref={campoMotivoRef}
              required
              aria-required="true"
              aria-invalid={motivoEmFalta ? true : undefined}
              aria-describedby="hr-convite-cancelar-motivo-ajuda"
              maxLength={MOTIVO_CANCELAR_MAX}
              rows={4}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setMotivoEmFalta(false);
                setErro(null);
              }}
            />
            <p id="hr-convite-cancelar-motivo-ajuda" className="text-xs text-muted-foreground">
              {t("hr.convite.cancelar.motivoAjuda")}
            </p>
          </div>

          {erro && (
            <Alert role="alert" variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)} disabled={aExecutar}>
            {t("hr.convite.accao.voltar")}
          </Button>
          <Button type="button" variant="destructive" className="min-h-11" onClick={confirmar} disabled={aExecutar}>
            {aExecutar && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {t("hr.convite.cancelar.confirmar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
