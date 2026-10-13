import { Link } from "react-router-dom";
import { useId } from "react";
import { Copy, ExternalLink, FilePlus2, UserRound } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AcoesNegocio } from "./AcoesNegocio";
import { CadeiaNegocio } from "./CadeiaNegocio";
import { ResumoNegocio } from "./ResumoNegocio";
import { FOCO } from "./estilos";
import type { NegocioMes } from "./negocioMetas";

interface PainelNegocioProps {
  negocio: NegocioMes | null;
  hoje: string;
  acoes: AcoesNegocio;
  aoFechar: () => void;
}

/** As quatro ações do painel: abrir negócio e pessoa são ligações; criar orçamento e copiar contacto vêm de `acoes`. */
function FaixaAcoes({ negocio, acoes }: { negocio: NegocioMes; acoes: AcoesNegocio }) {
  const { t } = useTranslation();
  const idMotivo = useId();
  const semContacto = negocio.contacto.telefone === null && negocio.contacto.email === null;
  const botao = cn("min-h-11 gap-2", FOCO);
  return (
    <div role="group" aria-label={t("businessGoals.panel.actions")} className="flex flex-wrap gap-2 border-b border-border px-6 py-3">
      <Button asChild className={botao}>
        <Link to={`/deals?open=${encodeURIComponent(negocio.id)}`}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t("businessGoals.panel.open")}
        </Link>
      </Button>
      <Button asChild variant="outline" className={botao}>
        <Link to={`/pessoas?open=${encodeURIComponent(negocio.pessoaId)}`}>
          <UserRound className="h-4 w-4" aria-hidden="true" />
          {t("businessGoals.panel.openPerson")}
        </Link>
      </Button>
      <Button type="button" variant="outline" className={botao} onClick={() => acoes.criarOrcamento(negocio)}>
        <FilePlus2 className="h-4 w-4" aria-hidden="true" />
        {t("businessGoals.actions.createQuote")}
      </Button>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button" variant="outline" aria-disabled={semContacto || undefined}
              aria-describedby={semContacto ? idMotivo : undefined}
              className={cn(botao, "aria-disabled:cursor-not-allowed aria-disabled:opacity-50")}
              onClick={() => { if (!semContacto) acoes.copiarContacto(negocio); }}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              {t("businessGoals.actions.copyContact")}
            </Button>
          </TooltipTrigger>
          {semContacto && <TooltipContent>{t("businessGoals.actions.noContact")}</TooltipContent>}
        </Tooltip>
      </TooltipProvider>
      {semContacto && <span id={idMotivo} className="sr-only">{t("businessGoals.actions.noContact")}</span>}
    </div>
  );
}

/**
 * Painel lateral. Em cima, fixos: o resumo do negócio (o mesmo do cartão, mais fase e
 * parado) e a faixa de ações. Só a cadeia (orçamentos, proposta, contrato) rola.
 */
export function PainelNegocio({ negocio, hoje, acoes, aoFechar }: PainelNegocioProps) {
  const { t } = useTranslation();
  return (
    <Sheet open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg motion-reduce:!animate-none">
        {negocio && (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>{negocio.pessoa}</SheetTitle>
              <SheetDescription>{negocio.servico} · {negocio.comercial}</SheetDescription>
            </SheetHeader>
            <div className="border-b border-border p-6 pr-12">
              <ResumoNegocio negocio={negocio} hoje={hoje} detalhado />
            </div>
            <FaixaAcoes negocio={negocio} acoes={acoes} />
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              <CadeiaNegocio negocio={negocio} id={`cadeia-${negocio.id}`} />
              <p className="text-xs text-muted-foreground">{t("businessGoals.panel.note")}</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
