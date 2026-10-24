// Um diálogo que pede um motivo (de pelo menos 3 caracteres) antes de uma ação que fecha ou desfaz algo: rejeitar a ficha,
// anular o contrato. O motivo fica no histórico da admissão. Só em memória.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MIN_MOTIVO } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { useTranslation } from "@/hooks/useTranslation";

interface MotivoAdmissaoDialogProps {
  aberto: boolean;
  titulo: string;
  descricao: string;
  confirmar: string;
  /** Devolve `true` se a ação foi aceite (o diálogo fecha). */
  aoConfirmar: (motivo: string) => boolean;
  aoFechar: () => void;
}

export function MotivoAdmissaoDialog({ aberto, titulo, descricao, confirmar, aoConfirmar, aoFechar }: MotivoAdmissaoDialogProps) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  useEffect(() => {
    if (aberto) {
      setMotivo("");
      setTentou(false);
    }
  }, [aberto]);
  const curto = motivo.trim().length < MIN_MOTIVO;
  const erro = tentou && curto ? t("rhAdm.erro.motivoCurto", { n: MIN_MOTIVO }) : null;

  const enviar = () => {
    setTentou(true);
    if (!curto && aoConfirmar(motivo)) aoFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rh-adm-motivo">
            {t("rhAdm.motivo.rotulo")}
            <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
            <span className="sr-only"> ({t("hr.campos.obrigatorio")})</span>
          </Label>
          <Textarea
            id="rh-adm-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} required aria-required="true"
            aria-invalid={erro ? true : undefined} aria-describedby={erro ? "rh-adm-motivo-erro" : undefined}
          />
          {erro && <p id="rh-adm-motivo-erro" role="alert" className="text-xs text-destructive">{erro}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" className="min-h-11" onClick={aoFechar}>{t("employees.form.cancel")}</Button>
          <Button type="button" variant="destructive" className="min-h-11" onClick={enviar}>{confirmar}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
