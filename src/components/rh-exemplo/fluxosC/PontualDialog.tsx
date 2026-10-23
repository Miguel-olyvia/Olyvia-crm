/** Acrescentar um valor pontual (positivo ou negativo) a uma pessoa, num mês ainda aberto. */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { adicionarPontual, type ErroPontual } from "./lojaFluxosC";

interface Props {
  pessoa: { id: string; nome: string } | null;
  mes: string;
  aoFechar: () => void;
}

export function PontualDialog({ pessoa, mes, aoFechar }: Props) {
  const { t } = useTranslation();
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<ErroPontual | null>(null);
  if (!pessoa) return null;

  const fechar = () => {
    setDescricao("");
    setValor("");
    setErro(null);
    aoFechar();
  };
  const guardar = () => {
    const e = adicionarPontual(pessoa.id, mes, descricao, Number(valor.replace(",", ".")));
    if (e) return setErro(e);
    toast.success(t("rhFluxosC.proc.pontual.guardado"));
    fechar();
  };

  return (
    <Dialog open onOpenChange={(a) => !a && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rhFluxosC.proc.pontual.titulo")}</DialogTitle>
          <DialogDescription>{pessoa.nome}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pt-descricao">{t("rhFluxosC.proc.pontual.descricao")}</Label>
            <Input id="pt-descricao" className="min-h-11" value={descricao} onChange={(e) => { setDescricao(e.target.value); setErro(null); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-valor">{t("rhFluxosC.proc.pontual.valor")}</Label>
            <Input id="pt-valor" inputMode="decimal" className="min-h-11" value={valor} onChange={(e) => { setValor(e.target.value); setErro(null); }} />
            <p className="text-xs text-muted-foreground">{t("rhFluxosC.proc.pontual.ajudaValor")}</p>
          </div>
          {erro && <p role="alert" className="text-sm text-destructive">{t(`rhFluxosC.proc.pontual.erro.${erro}`)}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={fechar}>{t("rhFluxosC.comum.cancelar")}</Button>
          <Button type="button" className="min-h-11" onClick={guardar}>{t("rhFluxosC.comum.guardar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
