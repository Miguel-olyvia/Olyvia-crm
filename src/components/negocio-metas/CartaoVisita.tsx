import { Ban, CheckCircle2, ChevronRight, Circle, Trash2, XCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CamposVisita } from "./CamposVisita";
import { N } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import type { EstadoVisitaNegocio, VisitaNegocio } from "./negocioMetas";
import { formatarData } from "./negocioPainel";
import { chaveOpcao } from "./respostasVisita";
import { estadosPermitidos, resumoDaVisita, visitaSoLeitura } from "./visitasNegocio";

const ICONE_ESTADO: Record<EstadoVisitaNegocio, typeof Circle> = { porFazer: Circle, feita: CheckCircle2, cancelada: XCircle };

interface Props {
  /** A base dos ids do painel; os da visita são `<id>-<visita.id>-<campo>`. */
  id: string;
  /** A posição por ordem cronológica, a partir de 1. */
  numero: number;
  visita: VisitaNegocio;
  /** A visita já existe na base: não se remove, cancela-se (com confirmação), e uma já feita ou cancelada só se lê. */
  gravada: boolean;
  /** O código postal da morada da visita está fora do formato (depois de tentar guardar). */
  erroCodigoPostal: boolean;
  aberta: boolean;
  aoAlternar: () => void;
  aoMudar: (parcial: Partial<VisitaNegocio>) => void;
  aoMarcarFeita: () => void;
  aoRemover: () => void;
  /** Pede para cancelar uma visita que já existe na base (quem monta pede a confirmação). */
  aoCancelar: () => void;
}

/** «Marcar como feita» (só numa visita por fazer) e «Remover» (ou «Cancelar visita», se a visita já existe na base; uma já fechada não tem nenhum). */
function AcoesDaVisita({ visita, gravada, dia, aoMarcarFeita, aoRemover, aoCancelar }: Pick<Props, "visita" | "gravada" | "aoMarcarFeita" | "aoRemover" | "aoCancelar"> & { dia: string }) {
  const { t } = useTranslation();
  if (visitaSoLeitura(gravada, visita.estado)) return null;
  return (
    <>
      {visita.estado === "porFazer" && (
        <Button
          type="button" variant="outline" onClick={aoMarcarFeita} aria-label={t(`${N}visits.markDone.label`, { data: dia })}
          className={cn("min-h-11 gap-2", FOCO)}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {t(`${N}visits.markDone`)}
        </Button>
      )}
      {gravada ? (
        <Button
          type="button" variant="outline" onClick={aoCancelar} aria-label={t(`${N}visits.cancel.label`, { data: dia })}
          className={cn("min-h-11 gap-2", FOCO)}
        >
          <Ban className="h-4 w-4" aria-hidden="true" />
          {t(`${N}visits.cancel`)}
        </Button>
      ) : (
        <Button
          type="button" variant="outline" onClick={aoRemover} aria-label={t(`${N}visits.remove.label`, { data: dia })}
          className={cn("min-h-11 min-w-11 gap-2", FOCO)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t(`${N}visits.remove`)}
        </Button>
      )}
    </>
  );
}

/**
 * Uma visita como cartão compacto: o resumo («Feita · 15/10/2026 · 10:00 · Bruno Costa · Levantamento») é o botão que abre e
 * fecha os campos. «Marcar como feita» e «Remover» (ou «Cancelar visita») ficam ao lado (nunca dentro do botão).
 */
export function CartaoVisita({ id, numero, visita, gravada, erroCodigoPostal, aberta, aoAlternar, aoMudar, aoMarcarFeita, aoRemover, aoCancelar }: Props) {
  const { t } = useTranslation();
  const base = `${id}-${visita.id}`;
  const dia = formatarData(visita.data) || t(`${N}visits.noDate`);
  const resumo = resumoDaVisita(visita, {
    estado: t(`${N}visits.status.${visita.estado}`), tipo: t(`${N}${chaveOpcao("tipoVisita", visita.tipo)}`),
  });
  const Icone = ICONE_ESTADO[visita.estado];
  const soLeitura = visitaSoLeitura(gravada, visita.estado);
  return (
    <li className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <button
          id={`${base}-toggle`} type="button" aria-expanded={aberta} aria-controls={`${base}-corpo`} onClick={aoAlternar}
          className={cn("flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50 motion-reduce:transition-none", FOCO)}
        >
          <ChevronRight className={cn("mt-0.5 h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none", aberta && "rotate-90")} aria-hidden="true" />
          <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">{t(`${N}visits.nth`, { n: numero })}</span>
            <span className="block break-words text-sm tabular-nums text-muted-foreground">{resumo}</span>
          </span>
        </button>
        <AcoesDaVisita visita={visita} gravada={gravada} dia={dia} aoMarcarFeita={aoMarcarFeita} aoRemover={aoRemover} aoCancelar={aoCancelar} />
      </div>
      {aberta && (
        <div id={`${base}-corpo`} className="space-y-4 border-t border-border p-3">
          {soLeitura && <p className="text-sm text-muted-foreground">{t(`${N}visits.readonly.${visita.estado}`)}</p>}
          <CamposVisita
            base={base} visita={visita} aoMudar={aoMudar} estados={estadosPermitidos(gravada, visita.estado)} erroCodigoPostal={erroCodigoPostal}
            somenteLeitura={soLeitura}
          />
        </div>
      )}
    </li>
  );
}
