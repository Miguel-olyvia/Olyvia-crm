import { useMemo, type ComponentType } from "react";
import { Calculator, FileSignature, FileText, MapPin, Phone, Ruler, XCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { registosDoNegocio } from "./acoesRegistos";
import { formatarMeta } from "./formatoMetas";
import type { DetalheNegocio } from "./negocioDetalhes";
import type { NegocioMes } from "./negocioMetas";
import { formatarData } from "./negocioPainel";
import { perdaDoNegocio, useAlteracoesNegocios } from "./negociosAlterados";
import { eventosDoPercurso, type EventoPercurso } from "./percursoEventos";
import { useRegistosPessoa } from "./registosPessoa";
import type { Traduzir } from "./saudeNegocio";

const ICONES: Record<EventoPercurso["tipo"], ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>> = {
  contacto: Phone, visita: MapPin, levantamento: Ruler, orcamento: Calculator, proposta: FileText, contrato: FileSignature, perda: XCircle,
};

const J = "businessGoals.journey.";

/** Os pormenores de um acontecimento, em texto (o estado, o resultado, a nota, o valor...), sem os que estão vazios. */
function pormenores(t: Traduzir, e: EventoPercurso): string[] {
  switch (e.tipo) {
    case "contacto": return [t(`businessGoals.new.link.result.${e.resultado}`), e.nota];
    case "visita": return [
      t(`businessGoals.new.link.visitState.${e.estado}`), e.hora, e.resultado ? t(`${J}visitResult.${e.resultado}`) : "",
    ];
    case "levantamento": return [t(`${J}survey.lines.${e.linhas === 0 ? "zero" : e.linhas === 1 ? "one" : "many"}`, { who: e.feitoPor, n: e.linhas })];
    case "orcamento": return [
      formatarMeta("euro", e.valor), e.escolhido ? t("businessGoals.chain.chosen") : "", e.estado ? t(`businessGoals.painel.quotes.state.${e.estado}`) : "",
    ];
    case "proposta": return [t(`businessGoals.proposal.${e.estado}`)];
    case "contrato": return [t(`businessGoals.contract.${e.estado}`)];
    case "perda": return [t("businessGoals.lose.lostIn", { phase: t(`businessGoals.lose.phase.${e.fase}`), reason: e.motivo })];
  }
}

/**
 * O percurso do negócio por ordem cronológica: os contactos, visitas e levantamento que estão LIGADOS a ele, os orçamentos, a proposta e o
 * contrato, e a perda (se perdeu). Tudo deriva do que o negócio tem; não se guarda nada à parte. Cada acontecimento diz o tipo em texto.
 */
export function PercursoNegocio({ negocio, detalhe }: { negocio: NegocioMes; detalhe: DetalheNegocio | null }) {
  const { t } = useTranslation();
  const registos = useRegistosPessoa();
  const alteracoes = useAlteracoesNegocios();
  const perda = perdaDoNegocio(negocio.id, alteracoes);
  const eventos = useMemo(
    () => eventosDoPercurso(negocio, registosDoNegocio(registos, negocio.id), detalhe, perda),
    [negocio, registos, detalhe, perda],
  );
  const titulo = t(`${J}title`);
  return (
    <section aria-labelledby={`percurso-${negocio.id}`} className="mt-6 space-y-3">
      <h3 id={`percurso-${negocio.id}`} className="text-sm font-medium text-foreground">{titulo}</h3>
      {eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t(`${J}empty`)}</p>
      ) : (
        <ol aria-label={titulo} className="space-y-3 border-l border-border pl-4">
          {eventos.map((e) => {
            const Icone = ICONES[e.tipo];
            return (
              <li key={e.chave} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <Icone className="h-4 w-4 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
                <span className="font-mono tabular-nums text-muted-foreground">{e.data ? formatarData(e.data) : t(`${J}noDate`)}</span>
                <span className="font-medium text-foreground">{t(`${J}type.${e.tipo}`)}</span>
                <span className="text-foreground">{pormenores(t, e).filter(Boolean).join(" · ")}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
