import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatarMeta } from "./formatoMetas";
import type { NegocioMes } from "./negocioMetas";
import { temValor } from "./logicaQuadro";

interface CadeiaNegocioProps {
  negocio: NegocioMes;
  id: string;
}

interface PassoProps {
  numero: number;
  titulo: string;
  feito: boolean;
  ultimo: boolean;
  children: ReactNode;
}

/** Um passo da cadeia: marca (✓ ou número) ligada ao seguinte por uma linha, sem caixas à volta. */
function Passo({ numero, titulo, feito, ultimo, children }: PassoProps) {
  return (
    <li className={cn("relative flex gap-3", !ultimo && "pb-5")}>
      {!ultimo && <span aria-hidden="true" className="absolute left-3 top-7 bottom-0 w-px -translate-x-1/2 bg-border" />}
      <span
        aria-hidden="true"
        className={cn(
          "z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          feito ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-muted-foreground",
        )}
      >
        {feito ? <Check className="h-3.5 w-3.5" /> : numero}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <h4 className="text-sm font-semibold text-foreground">{titulo}</h4>
        {children}
      </div>
    </li>
  );
}

/** A cadeia do negócio, de cima para baixo: orçamentos (com o escolhido), proposta e contrato. */
export function CadeiaNegocio({ negocio, id }: CadeiaNegocioProps) {
  const { t } = useTranslation();
  const { orcamentos, proposta, contrato } = negocio;
  return (
    <ol id={id} aria-label={t("businessGoals.panel.chain")}>
      <Passo numero={1} titulo={t("businessGoals.chain.quotes")} feito={temValor(negocio)} ultimo={false}>
        <ul className="space-y-1">
          {orcamentos.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="font-mono tabular-nums">{formatarMeta("euro", o.valor)}</span>
              {o.escolhido && <Badge variant="default">{t("businessGoals.chain.chosen")}</Badge>}
            </li>
          ))}
        </ul>
      </Passo>
      <Passo numero={2} titulo={t("businessGoals.chain.proposal")} feito={proposta?.estado === "aceite"} ultimo={false}>
        {proposta ? (
          <Badge variant="secondary">{t(`businessGoals.proposal.${proposta.estado}`)}</Badge>
        ) : (
          <p className="text-sm text-muted-foreground">{t("businessGoals.chain.none")}</p>
        )}
      </Passo>
      <Passo numero={3} titulo={t("businessGoals.chain.contract")} feito={contrato?.estado === "assinado"} ultimo>
        {contrato ? (
          <Badge variant="secondary">{t(`businessGoals.contract.${contrato.estado}`)}</Badge>
        ) : (
          <p className="text-sm text-muted-foreground">{t("businessGoals.chain.optional")}</p>
        )}
      </Passo>
    </ol>
  );
}
