/**
 * O RH confirma ou rejeita uma hora extra. Rejeitar (e confirmar acima do limite ou sem autorizacao) exige motivo de 3+
 * caracteres; um motivo opcional so pode estar vazio ou ter 3+. A decisao e da base: se a linha ja foi decidida por outro, o erro
 * traduzido aparece aqui e a lista refaz-se.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useHorasExtraAcoes } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { minutosEmHoras, dataCurta } from "./formatosC";
import { MOTIVO_MINIMO_CARACTERES, confirmaExigeMotivo, type HoraExtra } from "./horasExtraRegras";

export interface PedidoDecisao {
  hora: HoraExtra;
  pessoaNome: string;
  decisao: "confirmar" | "rejeitar";
}

interface Props {
  pedido: PedidoDecisao | null;
  aoFechar: () => void;
}

const MOTIVO_MAXIMO = 500;

/** `key` pela hora: abrir outra hora extra comeca sempre com o motivo e os erros limpos. */
export function DecidirHoraExtraDialog({ pedido, aoFechar }: Props) {
  if (!pedido) return null;
  return <DecidirConteudo key={`${pedido.hora.id}-${pedido.decisao}`} pedido={pedido} aoFechar={aoFechar} />;
}

function DecidirConteudo({ pedido, aoFechar }: { pedido: PedidoDecisao; aoFechar: () => void }) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erroBase, setErroBase] = useState<string | null>(null);
  const { decidir, aExecutar } = useHorasExtraAcoes();

  const { hora, decisao, pessoaNome } = pedido;
  const exigeMotivo = decisao === "rejeitar" || confirmaExigeMotivo(hora);
  const tamanho = motivo.trim().length;
  const motivoOk = exigeMotivo ? tamanho >= MOTIVO_MINIMO_CARACTERES : tamanho === 0 || tamanho >= MOTIVO_MINIMO_CARACTERES;
  const erro = tentou && !motivoOk;

  const submeter = async () => {
    setTentou(true);
    setErroBase(null);
    if (!motivoOk) return;
    const r = await decidir(hora.id, decisao, motivo, exigeMotivo);
    if (!r.ok) {
      setErroBase(r.erro);
      return;
    }
    toast.success(t(decisao === "confirmar" ? "rhFluxosC.he.decisao.confirmadaOk" : "rhFluxosC.he.decisao.rejeitadaOk"));
    aoFechar();
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
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
        {hora.semAutorizacao === true && decisao === "confirmar" && (
          <p role="note" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            {t("rhHeReal.avisoSemAutorizacao")}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="he-motivo">
            {t(exigeMotivo ? "rhFluxosC.he.decisao.motivo" : "rhFluxosC.he.decisao.motivoOpcional")}
          </Label>
          <Textarea
            id="he-motivo"
            value={motivo}
            maxLength={MOTIVO_MAXIMO}
            required={exigeMotivo}
            aria-required={exigeMotivo}
            onChange={(e) => setMotivo(e.target.value)}
            aria-invalid={erro}
            aria-describedby={erro ? "he-motivo-erro" : undefined}
          />
          {erro && (
            <p id="he-motivo-erro" role="alert" className="text-sm text-destructive">
              {exigeMotivo
                ? t("rhFluxosC.he.decisao.motivoErro").replace("{n}", String(MOTIVO_MINIMO_CARACTERES))
                : t("rhHeReal.decisao.motivoOpcionalErro", { n: String(MOTIVO_MINIMO_CARACTERES) })}
            </p>
          )}
        </div>
        {erroBase && <p role="alert" className="text-sm text-destructive">{erroBase}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>
            {t("rhFluxosC.comum.cancelar")}
          </Button>
          <Button type="button" variant={decisao === "rejeitar" ? "destructive" : "default"} className="min-h-11" disabled={aExecutar} onClick={() => void submeter()}>
            {t(decisao === "confirmar" ? "rhFluxosC.he.acao.confirmar" : "rhFluxosC.he.acao.rejeitar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
