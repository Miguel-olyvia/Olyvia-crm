/** Fechar o mês (guarda o recibo) e reabri-lo (autorização perigosa simulada, motivo de 3+ caracteres, fica registado). */
import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { fecharMesNaLoja, reabrirMesNaLoja } from "./lojaFluxosC";
import { MOTIVO_REABRIR_MINIMO, type ErroReabrir, type ReciboCongelado } from "./salarioFecho";
import { nomeDoMes } from "./formatosC";

interface Props {
  mes: string;
  fechado: boolean;
  recibosParaFechar: readonly ReciboCongelado[];
}

export function FecharReabrirMes({ mes, fechado, recibosParaFechar }: Props) {
  const { t } = useTranslation();
  const [confirmarFecho, setConfirmarFecho] = useState(false);
  const [reabrirAberto, setReabrirAberto] = useState(false);
  const [autorizado, setAutorizado] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<ErroReabrir | null>(null);

  const fechar = () => {
    setConfirmarFecho(false);
    if (fecharMesNaLoja(mes, recibosParaFechar)) toast.success(t("rhFluxosC.proc.fecho.fechado"));
  };
  const fecharReabrir = () => {
    setReabrirAberto(false);
    setAutorizado(false);
    setMotivo("");
    setErro(null);
  };
  const reabrir = () => {
    const r = reabrirMesNaLoja(mes, motivo, autorizado);
    if ("erro" in r) return setErro(r.erro);
    toast.success(t("rhFluxosC.proc.fecho.reaberto"));
    fecharReabrir();
  };

  return (
    <>
      {fechado ? (
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setReabrirAberto(true)}>
          <LockOpen className="mr-2 h-4 w-4" aria-hidden="true" />{t("rhFluxosC.proc.fecho.reabrir")}
        </Button>
      ) : (
        <Button type="button" className="min-h-11" onClick={() => setConfirmarFecho(true)}>
          <Lock className="mr-2 h-4 w-4" aria-hidden="true" />{t("rhFluxosC.proc.fecho.fechar")}
        </Button>
      )}

      <AlertDialog open={confirmarFecho} onOpenChange={setConfirmarFecho}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rhFluxosC.proc.fecho.confirmarTitulo").replace("{mes}", nomeDoMes(mes))}</AlertDialogTitle>
            <AlertDialogDescription>{t("rhFluxosC.proc.fecho.confirmarTexto")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{t("rhFluxosC.comum.cancelar")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={fechar}>{t("rhFluxosC.proc.fecho.fechar")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={reabrirAberto} onOpenChange={(a) => !a && fecharReabrir()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rhFluxosC.proc.reabrir.titulo").replace("{mes}", nomeDoMes(mes))}</DialogTitle>
            <DialogDescription>{t("rhFluxosC.proc.reabrir.aviso")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3">
            <Checkbox id="reabrir-autorizacao" checked={autorizado} onCheckedChange={(v) => { setAutorizado(v === true); setErro(null); }} className="mt-1" />
            <Label htmlFor="reabrir-autorizacao" className="text-sm leading-snug">{t("rhFluxosC.proc.reabrir.autorizacao")}</Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reabrir-motivo">{t("rhFluxosC.proc.reabrir.motivo")}</Label>
            <Textarea id="reabrir-motivo" value={motivo} aria-invalid={erro === "motivo_obrigatorio"} onChange={(e) => { setMotivo(e.target.value); setErro(null); }} />
          </div>
          {erro && <p role="alert" className="text-sm text-destructive">{t(`rhFluxosC.proc.reabrir.erro.${erro}`).replace("{n}", String(MOTIVO_REABRIR_MINIMO))}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={fecharReabrir}>{t("rhFluxosC.comum.cancelar")}</Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={reabrir}>{t("rhFluxosC.proc.fecho.reabrir")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
