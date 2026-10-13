import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatarMeta } from "./formatoMetas";
import { faseDoNegocio, type NegocioMes } from "./negocioMetas";
import { temValor } from "./logicaQuadro";
import { useWorkflowExemplo } from "./useWorkflowExemplo";
import { textoAoAceitar, traduzir } from "./workflowNegocio";

interface CadeiaNegocioProps {
  negocio: NegocioMes;
  id: string;
  /** Em linha e compacta (para a linha expandida da Lista); por defeito, em coluna (para o painel). */
  horizontal?: boolean;
}

interface PassoProps {
  numero: number;
  titulo: string;
  feito: boolean;
  ultimo: boolean;
  children: ReactNode;
}

/** A marca de um passo: ✓ quando está feito, senão o número. */
function Marca({ numero, feito }: { numero: number; feito: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
        feito ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-muted-foreground",
      )}
    >
      {feito ? <Check className="h-3.5 w-3.5" /> : numero}
    </span>
  );
}

/** Um passo da cadeia: marca (✓ ou número) ligada ao seguinte por uma linha, sem caixas à volta. */
function Passo({ numero, titulo, feito, ultimo, children }: PassoProps) {
  return (
    <li className={cn("relative flex gap-3", !ultimo && "pb-5")}>
      {!ultimo && <span aria-hidden="true" className="absolute left-3 top-7 bottom-0 w-px -translate-x-1/2 bg-border" />}
      <Marca numero={numero} feito={feito} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <h4 className="text-sm font-semibold text-foreground">{titulo}</h4>
        {children}
      </div>
    </li>
  );
}

/** A cadeia numa linha: "1 Orçamentos · 2 orç. (1 escolhido)", "2 Proposta · Enviada", "3 Contrato · Passo opcional". */
function CadeiaHorizontal({ negocio, id }: Omit<CadeiaNegocioProps, "horizontal">) {
  const { t } = useTranslation();
  const { orcamentos, proposta, contrato } = negocio;
  const escolhidos = orcamentos.filter((o) => o.escolhido).length;
  const passos = [
    {
      titulo: t("businessGoals.chain.quotes"), feito: temValor(negocio),
      estado: t("businessGoals.mini.quotes", {
        count: orcamentos.length,
        chosen: t(escolhidos > 0 ? "businessGoals.mini.chosenOne" : "businessGoals.mini.chosenNone"),
      }),
    },
    {
      titulo: t("businessGoals.chain.proposal"), feito: proposta?.estado === "aceite",
      estado: proposta ? t(`businessGoals.proposal.${proposta.estado}`) : t("businessGoals.chain.none"),
    },
    {
      titulo: t("businessGoals.chain.contract"), feito: contrato?.estado === "assinado",
      estado: contrato ? t(`businessGoals.contract.${contrato.estado}`) : t("businessGoals.chain.optional"),
    },
  ];
  return (
    <ol id={id} aria-label={t("businessGoals.panel.chain")} className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {passos.map((p, i) => (
        <li key={p.titulo} className="flex items-center gap-2 text-sm">
          <Marca numero={i + 1} feito={p.feito} />
          <span className="font-semibold text-foreground">{p.titulo}</span>
          <span className="text-muted-foreground">{p.estado}</span>
        </li>
      ))}
    </ol>
  );
}

/** A cadeia do negócio, de cima para baixo: orçamentos (com o escolhido), proposta e contrato. */
export function CadeiaNegocio({ negocio, id, horizontal = false }: CadeiaNegocioProps) {
  const { t } = useTranslation();
  const { orcamentos, proposta, contrato } = negocio;
  const { config } = useWorkflowExemplo();
  if (horizontal) return <CadeiaHorizontal negocio={negocio} id={id} />;
  // "Ao aceitar: ..." só no passo ativo: Orçamento sem proposta, ou Proposta por aceitar.
  const aoAceitar = textoAoAceitar(config, negocio);
  const linhaAoAceitar = aoAceitar ? <p className="text-xs text-muted-foreground">{traduzir(t, aoAceitar)}</p> : null;
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
        {faseDoNegocio(negocio) === "orcamento" && linhaAoAceitar}
      </Passo>
      <Passo numero={2} titulo={t("businessGoals.chain.proposal")} feito={proposta?.estado === "aceite"} ultimo={false}>
        {proposta ? (
          <Badge variant="secondary">{t(`businessGoals.proposal.${proposta.estado}`)}</Badge>
        ) : (
          <p className="text-sm text-muted-foreground">{t("businessGoals.chain.none")}</p>
        )}
        {faseDoNegocio(negocio) === "proposta" && linhaAoAceitar}
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
