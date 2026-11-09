/**
 * «Aceitar desvio»: o RH aceita que o tempo picado conte tal como foi picado (sem pagar o excesso como hora extra). Exige um
 * motivo de 3 a 500 caracteres, que fica registado. A decisao e da base: se o desvio ja foi decidido por outro, ou a pessoa e quem
 * valida, o erro traduzido aparece aqui e a fila refaz-se.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dataCurta } from "@/components/rh-exemplo/fluxosC/formatosC";
import { useDesviosAcoes } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { useTranslation } from "@/hooks/useTranslation";

export interface PedidoAceitarDesvio {
  desvioId: string;
  pessoaNome: string;
  /** AAAA-MM-DD. */
  data: string;
}

interface Props {
  pedido: PedidoAceitarDesvio | null;
  aoFechar: () => void;
  /** O desvio ficou validado (a fila e o mapa relem). */
  aoValidado: (texto: string) => void;
}

const MOTIVO_MINIMO = 3;
const MOTIVO_MAXIMO = 500;

/** `key` pelo desvio: abrir outro comeca sempre com o motivo e os erros limpos. */
export function AceitarDesvioDialog({ pedido, aoFechar, aoValidado }: Props) {
  if (!pedido) return null;
  return <Conteudo key={pedido.desvioId} pedido={pedido} aoFechar={aoFechar} aoValidado={aoValidado} />;
}

function Conteudo({ pedido, aoFechar, aoValidado }: { pedido: PedidoAceitarDesvio; aoFechar: () => void; aoValidado: (texto: string) => void }) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erroBase, setErroBase] = useState<string | null>(null);
  const [aValidar, setAValidar] = useState(false);
  const { validar } = useDesviosAcoes();
  const dia = dataCurta(pedido.data);

  const motivoOk = motivo.trim().length >= MOTIVO_MINIMO;
  const erro = tentou && !motivoOk;

  const submeter = async (): Promise<void> => {
    setTentou(true);
    setErroBase(null);
    if (!motivoOk || aValidar) return;
    setAValidar(true);
    const r = await validar(pedido.desvioId, "aceitar_desvio", motivo);
    setAValidar(false);
    if (!r.ok) {
      setErroBase(r.erro);
      return;
    }
    aoValidado(t("rhDesvios.validar.ok.aceitar_desvio", { dia }));
    aoFechar();
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rhDesvios.validar.aceitarTitulo", { pessoa: pedido.pessoaNome, dia })}</DialogTitle>
          <DialogDescription>{t("rhDesvios.validar.aceitarDescricao")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="desvio-motivo">{t("rhDesvios.validar.motivo")}</Label>
          <Textarea
            id="desvio-motivo"
            value={motivo}
            maxLength={MOTIVO_MAXIMO}
            required
            aria-required
            aria-invalid={erro}
            aria-describedby={erro ? "desvio-motivo-erro" : undefined}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {erro && (
            <p id="desvio-motivo-erro" role="alert" className="text-sm text-destructive">
              {t("rhDesvios.validar.motivoCurto")}
            </p>
          )}
        </div>
        {erroBase && <p role="alert" className="text-sm text-destructive">{erroBase}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>
            {t("rhDesvios.validar.cancelar")}
          </Button>
          <Button type="button" className="min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50" aria-disabled={aValidar ? "true" : undefined} aria-busy={aValidar} onClick={() => void submeter()}>
            {aValidar ? t("rhDesvios.validar.aValidar") : t("rhDesvios.validar.aceitar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
