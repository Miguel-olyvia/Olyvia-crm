import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BotaoPdf } from "./BotaoPdf";
import { FOCO } from "./estilos";
import { formatarMeta } from "./formatoMetas";
import type { DetalheNegocio } from "./negocioDetalhes";
import type { NegocioMes, OrcamentoNegocio } from "./negocioMetas";
import { formatarData } from "./negocioPainel";

interface LinhaOrcamentoProps {
  orcamento: OrcamentoNegocio;
  negocio: NegocioMes;
  detalheNegocio: DetalheNegocio | null;
}

/** Um orçamento: valor, estado e data em texto, "Escolhido" num selo com texto, e os botões Descarregar PDF e expandir (irmãos) com as linhas. */
function LinhaOrcamento({ orcamento, negocio, detalheNegocio }: LinhaOrcamentoProps) {
  const { t } = useTranslation();
  const detalhe = detalheNegocio?.orcamentos?.[orcamento.id];
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const valor = formatarMeta("euro", orcamento.valor);
  return (
    <li className="rounded-md border border-border">
      <div className="flex items-center justify-between gap-2 pl-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
          <span className="font-mono font-semibold tabular-nums text-foreground">{valor}</span>
          {detalhe && <span className="text-foreground">{t(`businessGoals.painel.quotes.state.${detalhe.estado}`)}</span>}
          {detalhe && <span className="text-muted-foreground">{formatarData(detalhe.data)}</span>}
          {orcamento.escolhido && <Badge variant="default">{t("businessGoals.chain.chosen")}</Badge>}
        </div>
        {/* O PDF e o botão de expandir são irmãos, nunca um dentro do outro. */}
        <div className="flex shrink-0 items-center gap-1">
          <BotaoPdf documento={{ tipo: "orcamento", orcamento }} negocio={negocio} detalhe={detalheNegocio} />
          {detalhe?.linhas && (
            <Button
              type="button" variant="ghost" className={cn("h-11 w-11 shrink-0 p-0", FOCO)} aria-expanded={aberto} aria-controls={id}
              aria-label={t("businessGoals.painel.quotes.toggle", { valor })}
              onClick={() => setAberto(!aberto)}
            >
              <ChevronDown aria-hidden="true" className={cn("transition-transform motion-reduce:transition-none", aberto && "rotate-180")} />
            </Button>
          )}
        </div>
      </div>
      {detalhe?.linhas && (
        <ul id={id} hidden={!aberto} aria-label={t("businessGoals.painel.quotes.lines")} className="space-y-1 border-t border-border px-3 py-2 text-sm">
          {detalhe.linhas.map((l, i) => (
            <li key={`${i}-${l.descricao}`} className="flex items-center justify-between gap-2">
              <span className="text-foreground">{t("businessGoals.painel.quotes.line", { descricao: l.descricao })}</span>
              <span className="font-mono tabular-nums text-foreground">{formatarMeta("euro", l.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** O separador Orçamentos: a lista dos orçamentos do negócio; sem nenhum, um estado vazio. */
export function OrcamentosPainel({ negocio, detalhe }: { negocio: NegocioMes; detalhe: DetalheNegocio | null }) {
  const { t } = useTranslation();
  if (negocio.orcamentos.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("businessGoals.painel.quotes.empty")}</p>;
  }
  return (
    <div className="space-y-2">
      <ul aria-label={t("businessGoals.painel.tabs.orcamentos")} className="space-y-2">
        {negocio.orcamentos.map((o) => <LinhaOrcamento key={o.id} orcamento={o} negocio={negocio} detalheNegocio={detalhe} />)}
      </ul>
      <p className="text-xs text-muted-foreground">{t("businessGoals.painel.quotes.example")}</p>
    </div>
  );
}
