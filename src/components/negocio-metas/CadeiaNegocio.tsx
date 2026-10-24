import { Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { NegocioMes } from "./negocioMetas";
import { temValor } from "./logicaQuadro";
import { textoOrcamentos } from "./saudeTexto";

interface CadeiaNegocioProps {
  negocio: NegocioMes;
  id: string;
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

/** A cadeia do negócio numa linha: "1 Orçamentos · 2 orçamentos (1 escolhido)", "2 Proposta · Enviada", "3 Contrato · Passo opcional". */
export function CadeiaNegocio({ negocio, id }: CadeiaNegocioProps) {
  const { t } = useTranslation();
  const { orcamentos, proposta, contrato } = negocio;
  const passos = [
    {
      titulo: t("businessGoals.chain.quotes"), feito: temValor(negocio),
      estado: textoOrcamentos(negocio, t),
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
          <span className="sr-only">, {t(p.feito ? "businessGoals.chain.done" : "businessGoals.chain.todo")}</span>
        </li>
      ))}
    </ol>
  );
}
