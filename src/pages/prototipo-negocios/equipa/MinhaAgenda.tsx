// "A minha agenda" (22/10/2026): a semana de quem está a ver o protótipo, no Hoje de cada papel. É a linha dessa pessoa na agenda do RH
// (RH › Agenda): as tarefas de obra (técnico), as visitas (comercial), as férias e ausências aprovadas no RH e os feriados. Semana anterior e
// seguinte, hoje destacado; clicar numa tarefa abre a obra, numa visita abre o negócio. Um dia por linha, para caber no telemóvel.
// A pessoa é a do papel (pessoaRhDoPapel em pontes.ts) ou a que se passar em `pessoaId` (o Hoje do técnico passa a dele).
import { useState } from "react";
import { AlertTriangle, Car, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useFrota } from "../frota/loja";
import { isoDia } from "../planoObra";
import { HORAS_DIA, diasDoPeriodo, fimDeSemana, moverPeriodo, rotuloCurto, tituloPeriodo } from "./regrasAgenda";
import { agendaDaPessoa, garantirTecnicosNoRh, pessoaRhDoPapel } from "./pontes";
import { garantirTecnicos } from "./tecnicos";
import { Item } from "./AgendaEquipa";
import type { EquipaCtx } from "./ctx";

const BOTAO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[15px] font-medium transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
const horas = (h: number) => String(Math.round(h * 10) / 10).replace(".", ",") + " h";

interface Props extends Pick<EquipaCtx, "S" | "irObra" | "irNegocio"> {
  /** A pessoa do RH (sem ela, a do papel que se está a ver). */
  pessoaId?: string;
  /** O id do título (para o aria-labelledby da secção). */
  id?: string;
  className?: string;
}

export default function MinhaAgenda({ S, irObra, irNegocio, pessoaId, id = "minha-agenda", className }: Props) {
  garantirTecnicos(S);
  // as pessoas dos papéis e dos técnicos entram no RH de exemplo (só as que faltam; sem mudança não avisa ninguém), como no RhPagina
  garantirTecnicosNoRh();
  const hoje = isoDia(new Date());
  const [ref, setRef] = useState(hoje);
  const F = useFrota();
  const rh = useEstadoRh((e) => e);
  const pid = pessoaId ?? pessoaRhDoPapel(S);
  const dias = diasDoPeriodo("semana", ref);
  const linha = agendaDaPessoa({ deals: S.deals, tecnicos: S.tecnicos!, frota: F, rh }, pid, dias);
  const n = linha.celulas.reduce((a, c) => a + c.itens.filter((x) => x.tipo === "tarefa" || x.tipo === "visita").length, 0);
  const periodo = tituloPeriodo("semana", dias);

  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className="text-lg font-semibold">A minha agenda</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">
        {linha.nome}{linha.papel ? ` · ${linha.papel}` : ""} · {n === 0 ? "nada marcado nesta semana" : `${n} ${n === 1 ? "marcação" : "marcações"} nesta semana`}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={BOTAO} onClick={() => setRef(moverPeriodo("semana", ref, -1))} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Anterior</span></button>
        <button type="button" className={BOTAO} onClick={() => setRef(hoje)} aria-pressed={dias.includes(hoje)}>Esta semana</button>
        <button type="button" className={BOTAO} onClick={() => setRef(moverPeriodo("semana", ref, 1))} aria-label="Semana seguinte"><span className="hidden sm:inline">Seguinte</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        <p className="w-full text-[15px] font-medium first-letter:uppercase sm:ml-auto sm:w-auto" aria-live="polite">{periodo}</p>
      </div>
      <ol className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card" aria-label={`A minha agenda: ${periodo}`}>
        {linha.celulas.map((c) => {
          const eHoje = c.data === hoje, total = c.horas > HORAS_DIA || c.itens.filter((x) => x.horas).length > 1;
          return (
            <li key={c.data} data-testid={`minha-agenda-${c.data}`} aria-current={eHoje ? "date" : undefined}
              className={cn("grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 px-3 py-2.5 first:rounded-t-2xl last:rounded-b-2xl", fimDeSemana(c.data) && "bg-muted/40", eHoje && "bg-primary/[0.06]",
                c.conflitos.length > 0 && "bg-destructive/5")}>
              <span className={cn("pt-1 text-sm font-medium tabular-nums", eHoje ? "text-primary" : fimDeSemana(c.data) && "text-muted-foreground")}>
                {rotuloCurto(c.data)}{eHoje && <span className="block text-xs font-semibold">hoje</span>}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                {c.itens.length === 0
                  ? <span className="pt-1 text-sm text-muted-foreground">—<span className="sr-only">Nada marcado</span></span>
                  : c.itens.map((x, i) => <Item key={i} x={x} mes={false} irObra={irObra} irNegocio={irNegocio} />)}
                {(total || c.viatura) && (
                  <p className="flex flex-wrap items-center gap-x-2 px-0.5 text-xs text-muted-foreground">
                    {total && <span className={cn("tabular-nums", c.horas > HORAS_DIA && "font-semibold text-destructive")}>{horas(c.horas)} no dia</span>}
                    {c.viatura && <span className="inline-flex items-center gap-1"><Car className="h-3 w-3" aria-hidden="true" /><span className="sr-only">Viatura:</span>{c.viatura}</span>}
                  </p>
                )}
                {c.conflitos.length > 0 && (
                  <p className="flex items-start gap-1 px-0.5 text-xs font-medium text-destructive"><AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />{c.conflitos.map((x) => x.texto).join(" ")}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
