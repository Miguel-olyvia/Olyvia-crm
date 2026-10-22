// RH › Agenda (22/10/2026): a agenda da equipa, semana ou mês, uma linha por trabalhador (os técnicos de obra e quem faz visitas). Mostra as
// tarefas das obras (obra, fase, horas), as visitas, as férias e ausências e a viatura da Frota nesse dia; destaca os conflitos (duas obras
// com mais horas do que um dia, obra em dia de férias). Só de leitura: clicar numa tarefa abre a obra, numa visita abre o negócio.
// Clicar no nome de um técnico abre a ficha dele em Pessoas (com o bloco "Obra"). As regras estão em regrasAgenda.ts. Em ecrã pequeno a grelha desliza na horizontal (a primeira coluna fica fixa).
import { useMemo, useState } from "react";
import { AlertTriangle, Car, ChevronLeft, ChevronRight, Palmtree } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useFrota } from "../frota/loja";
import { isoDia } from "../planoObra";
import {
  HORAS_DIA, agendaEquipa, contarConflitos, diasDoPeriodo, fimDeSemana, moverPeriodo, rotuloCurto, tituloPeriodo,
  type CelulaAgenda, type ItemAgenda, type VistaAgenda,
} from "./regrasAgenda";
import type { EquipaCtx } from "./ctx";
import { ausenciasDosTecnicos, pessoaRhDe } from "./pontes";
import { garantirTecnicos } from "./tecnicos";

const BOTAO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[15px] font-medium transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
const horas = (h: number) => String(Math.round(h * 10) / 10).replace(".", ",") + " h";

/** aoAbrirPessoa: abre a ficha da pessoa do RH (id) em Pessoas; sem ele, o nome fica só texto. */
export default function AgendaEquipa({ S, irObra, irNegocio, aoAbrirPessoa }: EquipaCtx & { aoAbrirPessoa?: (pessoaRhId: string) => void }) {
  garantirTecnicos(S);
  const hoje = isoDia(new Date());
  const [vista, setVista] = useState<VistaAgenda>("semana");
  const [ref, setRef] = useState(hoje);
  const F = useFrota();
  const rh = useEstadoRh((e) => e);
  const aus = useMemo(() => ausenciasDosTecnicos(rh, S.tecnicos), [rh, S.tecnicos]);
  const dias = diasDoPeriodo(vista, ref);
  const linhas = agendaEquipa({ deals: S.deals, tecnicos: S.tecnicos!, frota: F, ausencias: aus }, dias);
  const nConf = contarConflitos(linhas);
  const mes = vista === "mes";
  const conflitos = linhas.flatMap((l) => l.celulas.flatMap((c) => c.conflitos.map((x, i) => ({ k: `${l.id}-${c.data}-${i}`, quem: l.nome, data: c.data, texto: x.texto }))));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Agenda da equipa</h1>
        <p className="mt-1 max-w-3xl text-[15px] text-muted-foreground">
          Quem está em que obra em cada dia, as visitas, as férias e a viatura da Frota. Só para consultar: as tarefas mudam-se no plano da obra.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Vista" className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {(["semana", "mes"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}
              className={cn("min-h-10 rounded-md px-3 text-[15px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary", vista === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {v === "semana" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
        <button type="button" className={BOTAO} onClick={() => setRef(moverPeriodo(vista, ref, -1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" />{mes ? "Mês anterior" : "Semana anterior"}</button>
        <button type="button" className={BOTAO} onClick={() => setRef(hoje)}>Hoje</button>
        <button type="button" className={BOTAO} onClick={() => setRef(moverPeriodo(vista, ref, 1))}>{mes ? "Mês seguinte" : "Semana seguinte"}<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        <p className="ml-auto text-[15px] font-medium first-letter:uppercase" aria-live="polite">{tituloPeriodo(vista, dias)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-primary bg-primary/15" aria-hidden="true" />Tarefa de obra</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-dashed border-primary bg-card" aria-hidden="true" />Plano por aprovar</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-sky-600 bg-sky-50" aria-hidden="true" />Visita</span>
        <span className="inline-flex items-center gap-1.5"><Palmtree className="h-3.5 w-3.5" aria-hidden="true" />Férias ou ausência</span>
        <span className="inline-flex items-center gap-1.5"><Car className="h-3.5 w-3.5" aria-hidden="true" />Viatura da Frota</span>
        <span className={cn("inline-flex items-center gap-1.5 font-medium", nConf ? "text-destructive" : "")} role="status">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{nConf ? `${nConf} ${nConf === 1 ? "conflito" : "conflitos"} neste período` : "Sem conflitos neste período"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card" tabIndex={0} role="region" aria-label={`Agenda: ${tituloPeriodo(vista, dias)}`}>
        <table className={cn("w-full border-collapse text-left text-sm", mes ? "min-w-[1400px]" : "min-w-[980px]")}>
          <caption className="sr-only">Agenda da equipa de {tituloPeriodo(vista, dias)}: uma linha por pessoa, uma coluna por dia</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-28 min-w-[7rem] border-b border-r border-border bg-card px-2 py-2 font-medium sm:w-44 sm:min-w-[11rem] sm:px-3">Pessoa</th>
              {dias.map((d) => (
                <th key={d} scope="col" className={cn("border-b border-border px-1.5 py-2 text-center font-medium", fimDeSemana(d) && "bg-muted/50 text-muted-foreground", d === hoje && "bg-primary/10 text-primary")}>
                  {mes ? <><span className="block text-xs">{rotuloCurto(d).slice(0, 3)}</span>{Number(d.slice(8))}</> : <>{rotuloCurto(d)}{d === hoje ? " · hoje" : ""}</>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="align-top">
                <th scope="row" className="sticky left-0 z-10 border-b border-r border-border bg-card px-2 py-2 text-left font-normal sm:px-3">
                  {(() => {
                    const t = l.tipo === "tecnico" && aoAbrirPessoa ? S.tecnicos!.find((x) => x.id === l.id) : undefined;
                    return t ? (
                      <button type="button" onClick={() => aoAbrirPessoa!(pessoaRhDe(t))} aria-label={`Abrir a ficha de ${l.nome} em Pessoas`}
                        className="block min-h-6 text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                        {l.nome}
                      </button>
                    ) : <span className="block font-medium">{l.nome}</span>;
                  })()}
                  <span className="block text-xs text-muted-foreground">{l.papel}</span>
                </th>
                {l.celulas.map((c) => <Celula key={c.data} c={c} mes={mes} hoje={c.data === hoje} quem={l.nome} irObra={irObra} irNegocio={irNegocio} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {conflitos.length > 0 && (
        <section aria-labelledby="agenda-conflitos" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <h2 id="agenda-conflitos" className="flex items-center gap-2 text-[15px] font-semibold text-destructive"><AlertTriangle className="h-4 w-4" aria-hidden="true" />Conflitos</h2>
          <ul className="mt-2 flex flex-col gap-1 text-[15px]">
            {conflitos.map((x) => <li key={x.k}><b className="font-medium">{x.quem}</b>, {rotuloCurto(x.data)}: {x.texto}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

function Celula({ c, mes, hoje, quem, irObra, irNegocio }: { c: CelulaAgenda; mes: boolean; hoje: boolean; quem: string } & Pick<EquipaCtx, "irObra" | "irNegocio">) {
  const conflito = c.conflitos.length > 0;
  // o total do dia só quando soma mais do que uma marcação (ou passa do dia de trabalho); a tarefa sozinha já diz as horas
  const total = c.horas > HORAS_DIA || c.itens.filter((x) => x.horas).length > 1;
  return (
    <td data-testid={`agenda-${quem}-${c.data}`} className={cn("border-b border-border p-1", mes ? "min-w-[2.75rem]" : "min-w-[8.5rem]", fimDeSemana(c.data) && "bg-muted/40", hoje && "bg-primary/[0.04]",
      conflito && "bg-destructive/5 outline outline-2 -outline-offset-2 outline-destructive")}
      title={conflito ? c.conflitos.map((x) => x.texto).join(" ") : undefined}>
      <div className="flex flex-col gap-1">
        {c.itens.map((x, i) => <Item key={i} x={x} mes={mes} irObra={irObra} irNegocio={irNegocio} />)}
        {!mes && (total || c.viatura) && (
          <p className="flex flex-wrap items-center gap-x-2 px-0.5 text-xs text-muted-foreground">
            {total && <span className={cn("tabular-nums", c.horas > HORAS_DIA && "font-semibold text-destructive")}>{horas(c.horas)} no dia</span>}
            {c.viatura && <span className="inline-flex items-center gap-1"><Car className="h-3 w-3" aria-hidden="true" /><span className="sr-only">Viatura:</span>{c.viatura}</span>}
          </p>
        )}
        {conflito && (mes
          ? <span className="sr-only">Conflito: {c.conflitos.map((x) => x.texto).join(" ")}</span>
          : <p className="flex items-start gap-1 px-0.5 text-xs font-medium text-destructive"><AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />{c.conflitos.map((x) => x.texto).join(" ")}</p>)}
      </div>
    </td>
  );
}

function Item({ x, mes, irObra, irNegocio }: { x: ItemAgenda; mes: boolean } & Pick<EquipaCtx, "irObra" | "irNegocio">) {
  const texto = `${x.hora ? `${x.hora} · ` : ""}${x.titulo} · ${x.sub}${x.previsto ? " · plano por aprovar" : ""}${x.feito ? (x.tipo === "visita" ? " · feita" : " · validada") : ""}`;
  if (x.tipo === "ferias" || x.tipo === "ausencia") {
    return (
      <span title={`${x.titulo} · ${x.sub}`} className="inline-flex min-h-6 items-center gap-1 rounded-md bg-muted px-1.5 text-xs text-muted-foreground">
        <Palmtree className="h-3 w-3 shrink-0" aria-hidden="true" />{mes ? <span className="sr-only">{x.titulo}</span> : x.titulo}
      </span>
    );
  }
  const obra = x.tipo === "tarefa";
  const abrir = () => (obra ? x.obra != null && irObra(x.obra) : x.negocio != null && irNegocio(x.negocio));
  return (
    <button type="button" onClick={abrir} title={texto} aria-label={`${obra ? "Abrir a obra" : "Abrir o negócio"}: ${texto}`}
      className={cn("min-h-6 w-full rounded-md border px-1.5 py-1 text-left text-xs leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        obra ? "border-primary/60 bg-primary/10 hover:bg-primary/20" : "border-sky-600/60 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40",
        x.previsto && "border-dashed bg-card", x.feito && "opacity-70")}>
      {mes ? <span className="block text-center font-semibold">{obra ? `#${x.obra}` : x.hora ?? "V"}</span> : (
        <>
          <span className="block font-semibold">{x.hora ? `${x.hora} · ` : ""}{x.titulo}</span>
          <span className="block text-muted-foreground">{x.sub}</span>
        </>
      )}
    </button>
  );
}
