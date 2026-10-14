/** Crédito ou débito manual no banco de horas: horas, minutos e motivo (3+ caracteres), dentro dos limites. */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { MOTIVO_BANCO_MINIMO, type ErroBanco } from "./bancoHorasRegras";
import { adicionarMovimentoBanco } from "./lojaFluxosC";

interface Props {
  pessoaId: string;
  tipo: "credito" | "debito" | null;
  aoFechar: () => void;
}

const inteiro = (v: string): number => (v.trim() === "" ? 0 : Number(v));

export function MovimentoBancoDialog({ pessoaId, tipo, aoFechar }: Props) {
  const { t } = useTranslation();
  const [horas, setHoras] = useState("1");
  const [minutos, setMinutos] = useState("0");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<ErroBanco | null>(null);

  const fechar = () => {
    setErro(null);
    setMotivo("");
    setHoras("1");
    setMinutos("0");
    aoFechar();
  };

  const guardar = () => {
    const total = inteiro(horas) * 60 + inteiro(minutos);
    const r = adicionarMovimentoBanco(pessoaId, tipo === "debito" ? -total : total, motivo);
    if ("erro" in r) {
      setErro(r.erro);
      return;
    }
    toast.success(t("rhFluxosC.banco.guardado"));
    fechar();
  };

  return (
    <Dialog open={tipo !== null} onOpenChange={(a) => !a && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(tipo === "debito" ? "rhFluxosC.banco.tituloDebito" : "rhFluxosC.banco.tituloCredito")}</DialogTitle>
          <DialogDescription>{t("rhFluxosC.banco.dialogoAjuda")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bh-horas">{t("rhFluxosC.banco.horas")}</Label>
            <Input id="bh-horas" type="number" min={0} className="min-h-11" value={horas} onChange={(e) => { setHoras(e.target.value); setErro(null); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bh-minutos">{t("rhFluxosC.banco.minutos")}</Label>
            <Input id="bh-minutos" type="number" min={0} max={59} className="min-h-11" value={minutos} onChange={(e) => { setMinutos(e.target.value); setErro(null); }} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="bh-motivo">{t("rhFluxosC.banco.motivo")}</Label>
            <Textarea id="bh-motivo" value={motivo} aria-invalid={erro === "motivo_obrigatorio"} onChange={(e) => { setMotivo(e.target.value); setErro(null); }} />
          </div>
        </div>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {t(`rhFluxosC.banco.erro.${erro}`).replace("{n}", String(MOTIVO_BANCO_MINIMO))}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={fechar}>{t("rhFluxosC.comum.cancelar")}</Button>
          <Button type="button" className="min-h-11" onClick={guardar}>{t("rhFluxosC.comum.guardar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
