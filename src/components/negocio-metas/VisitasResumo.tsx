import { useId } from "react";
import { CalendarClock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { TituloPainel } from "./CamposPainel";
import { N } from "./PecasNovoNegocio";
import type { VisitaNegocio } from "./negocioMetas";
import { chaveOpcao } from "./respostasVisita";
import { ordenarVisitas, proximaVisitaDoNegocio, resumoDaVisita } from "./visitasNegocio";

function useResumo(): (v: VisitaNegocio) => string {
  const { t } = useTranslation();
  return (v) => resumoDaVisita(v, { estado: t(`${N}visits.status.${v.estado}`), tipo: t(`${N}${chaveOpcao("tipoVisita", v.tipo)}`) });
}

/** A morada da visita numa linha: rua, código postal e localidade, e o andar. */
function moradaEmTexto(v: VisitaNegocio): string {
  const { rua, codigoPostal, localidade, andar } = v.morada;
  return [rua, [codigoPostal, localidade].filter(Boolean).join(" "), andar].filter(Boolean).join(", ");
}

/** Destaca a próxima visita (a primeira Por fazer): ícone e título dizem-no, a cor é só reforço. */
function ProximaVisita({ visita, numero }: { visita: VisitaNegocio; numero: number }) {
  const { t } = useTranslation();
  const resumo = useResumo();
  return (
    <div className="space-y-0.5 rounded-md border border-primary bg-primary/5 p-2.5">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-primary dark:text-violet-300">
        <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t(`${N}visits.resumo.next`)}</span>
      </p>
      <p className="text-sm tabular-nums text-foreground">{t(`${N}visits.nth`, { n: numero })} · {resumo(visita)}</p>
    </div>
  );
}

/**
 * As visitas do negócio, só para ler: a lista por ordem cronológica, cada uma com o seu estado em texto, e, se houver uma
 * Por fazer, o bloco «Próxima visita» por cima.
 */
export function VisitasResumo({ visitas }: { visitas: readonly VisitaNegocio[] }) {
  const { t } = useTranslation();
  const id = useId();
  const resumo = useResumo();
  const ordenadas = ordenarVisitas(visitas);
  const proxima = proximaVisitaDoNegocio(visitas);
  return (
    <section aria-labelledby={id} className="space-y-2">
      <TituloPainel id={id}>{t(`${N}visits.resumo.title`)}</TituloPainel>
      {proxima && <ProximaVisita visita={proxima} numero={ordenadas.indexOf(proxima) + 1} />}
      <ol className="space-y-1.5 text-sm text-foreground">
        {ordenadas.map((v, i) => (
          <li key={v.id}>
            <span className="tabular-nums">{t(`${N}visits.nth`, { n: i + 1 })} · {resumo(v)}</span>
            {moradaEmTexto(v) && <span className="block text-muted-foreground">{t(`${N}visits.resumo.address`, { morada: moradaEmTexto(v) })}</span>}
            {v.nota.trim() && <span className="block text-muted-foreground">{t(`${N}visits.resumo.note`, { nota: v.nota.trim() })}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
