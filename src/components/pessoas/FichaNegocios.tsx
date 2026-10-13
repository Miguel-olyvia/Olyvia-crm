import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { MiniCadeia } from "@/components/negocio-metas/MiniCadeia";
import { valorDoNegocio } from "@/components/negocio-metas/negocioMetas";
import { SaudeTag } from "@/components/negocio-metas/SaudeTag";
import { textoMes } from "./formatoPessoas";
import { ehHistorico, type NegocioHistorico, type NegocioPessoa } from "./pessoasTipos";

/** Serviço, comercial e valor: o que é comum aos negócios do mês e aos históricos. */
function Cabeca({ negocio }: { negocio: NegocioPessoa }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{negocio.servico}</p>
        <p className="text-xs text-muted-foreground">{t("pessoasPagina.deals.rep", { name: negocio.comercial })}</p>
      </div>
      <p className="text-sm font-semibold tabular-nums text-foreground">{formatarMeta("euro", valorDoNegocio(negocio))}</p>
    </div>
  );
}

/** Um negócio do quadro do mês: cadeia, saúde e a ligação para o abrir em Negócio e metas. */
function NegocioDoMes({ negocio, hoje }: { negocio: NegocioPessoa; hoje: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Cabeca negocio={negocio} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <MiniCadeia negocio={negocio} />
        <SaudeTag negocio={negocio} hoje={hoje} />
      </div>
      <Button asChild variant="outline" className={cn("min-h-11 gap-2", FOCO)}>
        <Link to={`/negocio-metas?open=${encodeURIComponent(negocio.id)}`}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t("pessoasPagina.deals.open")}
        </Link>
      </Button>
    </div>
  );
}

/** Um negócio que já terminou, fora do quadro do mês: sem ligação. */
function NegocioTerminado({ negocio }: { negocio: NegocioHistorico }) {
  const { t } = useTranslation();
  const chave = negocio.resultado === "ganho" ? "pessoasPagina.deals.won" : "pessoasPagina.deals.lost";
  return (
    <div className="space-y-2">
      <Cabeca negocio={negocio} />
      <p className="text-sm font-medium text-foreground">{t(chave, { month: textoMes(t, negocio.mes) })}</p>
      <p className="text-xs text-muted-foreground">{t("pessoasPagina.deals.outOfBoard")}</p>
    </div>
  );
}

interface FichaNegociosProps {
  negocios: NegocioPessoa[];
  hoje: string;
}

/** Os negócios da pessoa: os do mês primeiro, os históricos depois. Sem negócios, diz-o e leva ao quadro. */
export function FichaNegocios({ negocios, hoje }: FichaNegociosProps) {
  const { t } = useTranslation();
  if (negocios.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-4">
        <p className="text-sm font-semibold text-foreground">{t("pessoasPagina.deals.emptyTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("pessoasPagina.deals.emptyHint")}</p>
        <Button asChild className={cn("min-h-11", FOCO)}>
          <Link to="/negocio-metas">{t("pessoasPagina.deals.emptyAction")}</Link>
        </Button>
      </div>
    );
  }
  const ordenados = [...negocios].sort((a, b) => Number(ehHistorico(a)) - Number(ehHistorico(b)));
  return (
    <ul className="space-y-3">
      {ordenados.map((n) => (
        <li key={n.id} className="rounded-xl border border-border bg-card p-4">
          {ehHistorico(n) ? <NegocioTerminado negocio={n} /> : <NegocioDoMes negocio={n} hoje={hoje} />}
        </li>
      ))}
    </ul>
  );
}
