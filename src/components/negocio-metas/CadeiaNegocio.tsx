import { useTranslation } from "@/hooks/useTranslation";
import { Badge } from "@/components/ui/badge";
import { formatarMeta } from "./formatoMetas";
import type { NegocioMes } from "./negocioMetas";

interface CadeiaNegocioProps {
  negocio: NegocioMes;
  id: string;
}

function Passo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background p-3">
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h4>
      {children}
    </div>
  );
}

/** A cadeia do negócio: orçamentos (com o escolhido), proposta e contrato. */
export function CadeiaNegocio({ negocio, id }: CadeiaNegocioProps) {
  const { t } = useTranslation();
  const { orcamentos, proposta, contrato } = negocio;
  return (
    <div id={id} className="grid gap-3 border-t border-border/60 bg-muted/20 p-3 md:grid-cols-3">
      <Passo titulo={t("businessGoals.chain.quotes")}>
        <ul className="space-y-1">
          {orcamentos.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="font-mono tabular-nums">{formatarMeta("euro", o.valor)}</span>
              {o.escolhido && <Badge variant="default">{t("businessGoals.chain.chosen")}</Badge>}
            </li>
          ))}
        </ul>
      </Passo>
      <Passo titulo={t("businessGoals.chain.proposal")}>
        {proposta ? (
          <Badge variant="secondary">{t(`businessGoals.proposal.${proposta.estado}`)}</Badge>
        ) : (
          <p className="text-sm text-muted-foreground">{t("businessGoals.chain.none")}</p>
        )}
      </Passo>
      <Passo titulo={t("businessGoals.chain.contract")}>
        {contrato ? (
          <Badge variant="secondary">{t(`businessGoals.contract.${contrato.estado}`)}</Badge>
        ) : (
          <p className="text-sm text-muted-foreground">{t("businessGoals.chain.optional")}</p>
        )}
      </Passo>
    </div>
  );
}
