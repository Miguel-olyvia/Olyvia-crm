/** O RH confirma ou rejeita uma hora extra. Rejeitar (e confirmar acima do limite) exige motivo de 3+ caracteres. */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { minutosEmHoras, dataCurta } from "./formatosC";
import { MOTIVO_MINIMO_CARACTERES, motivoValido, type HoraExtra } from "./horasExtraRegras";
import { decidirHoraExtraNaLoja } from "./lojaFluxosC";

export interface PedidoDecisao {
  hora: HoraExtra;
  pessoaNome: string;
  decisao: "confirmar" | "rejeitar";
}

interface Props {
  pedido: PedidoDecisao | null;
  aoFechar: () => void;
}

export function DecidirHoraExtraDialog({ pedido, aoFechar }: Props) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  if (!pedido) return null;

  const { hora, decisao, pessoaNome } = pedido;
  const exigeMotivo = decisao === "rejeitar" || hora.acimaDoLimite;
  const erro = tentou && exigeMotivo && !motivoValido(motivo);

  const fechar = () => {
    setMotivo("");
    setTentou(false);
    aoFechar();
  };

  const submeter = () => {
    setTentou(true);
    const r = decidirHoraExtraNaLoja(hora.id, decisao, motivo);
    if (!r.ok) return;
    toast.success(t(decisao === "confirmar" ? "rhFluxosC.he.decisao.confirmadaOk" : "rhFluxosC.he.decisao.rejeitadaOk"));
    fechar();
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(decisao === "confirmar" ? "rhFluxosC.he.decisao.tituloConfirmar" : "rhFluxosC.he.decisao.tituloRejeitar")}</DialogTitle>
          <DialogDescription>
            {pessoaNome} · {dataCurta(hora.data)} · {minutosEmHoras(hora.minutos)}
          </DialogDescription>
        </DialogHeader>
        {hora.acimaDoLimite && decisao === "confirmar" && (
          <p role="note" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            {t("rhFluxosC.he.decisao.avisoAcimaLimite")}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="he-motivo">
            {t(exigeMotivo ? "rhFluxosC.he.decisao.motivo" : "rhFluxosC.he.decisao.motivoOpcional")}
          </Label>
          <Textarea
            id="he-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            aria-invalid={erro}
            aria-describedby={erro ? "he-motivo-erro" : undefined}
          />
          {erro && (
            <p id="he-motivo-erro" role="alert" className="text-sm text-destructive">
              {t("rhFluxosC.he.decisao.motivoErro").replace("{n}", String(MOTIVO_MINIMO_CARACTERES))}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={fechar}>
            {t("rhFluxosC.comum.cancelar")}
          </Button>
          <Button type="button" variant={decisao === "rejeitar" ? "destructive" : "default"} className="min-h-11" onClick={submeter}>
            {t(decisao === "confirmar" ? "rhFluxosC.he.acao.confirmar" : "rhFluxosC.he.acao.rejeitar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
