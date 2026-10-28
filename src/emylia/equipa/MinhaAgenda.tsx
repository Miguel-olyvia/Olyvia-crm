// "A minha agenda" (22/10/2026): a semana de quem está a ver o protótipo, no Hoje de cada papel. É a linha dessa pessoa na agenda do RH
// (RH › Agenda): as tarefas de obra (técnico), as visitas (comercial), as férias e ausências aprovadas no RH e os feriados. Semana anterior e
// seguinte, hoje destacado; clicar numa tarefa abre a obra, numa visita abre o negócio. Um dia por linha, para caber no telemóvel.
// 23/10: é o único bloco de agenda do Hoje (o HojeSimples tinha outro, de outra fonte, que mostrava outra coisa). Sai da mesma função da
// RH › Agenda (pontes.ts: agendaVista): numa conta real, os membros da organização; sem ela, as pessoas de exemplo do RH. Quem tem equipa
// (a Direção, as Operações) escolhe "A minha" ou "A equipa" (a grelha da RH › Agenda). `tecnico`: o Hoje do técnico mostra o técnico que se vê.
import { useEffect, useState } from "react";
import { AlertTriangle, Car, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRhDaAgenda } from "./rhDaAgenda";
import { useFrota } from "../frota/loja";
import { isoDia } from "../planoObra";
import { HORAS_DIA, diasDoPeriodo, fimDeSemana, moverPeriodo, rotuloCurto, tituloPeriodo } from "./regrasAgenda";
import { agendaVista, garantirTecnicosNoRh, type AmbitoAgenda } from "./pontes";
import { garantirTecnicos } from "./tecnicos";
import AgendaEquipa, { AgendaACarregar, Item } from "./AgendaEquipa";
import { useEquipaReal } from "./membros";
import type { EquipaCtx } from "./ctx";

const BOTAO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[15px] font-medium transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
const horas = (h: number) => String(Math.round(h * 10) / 10).replace(".", ",") + " h";

interface Props extends Pick<EquipaCtx, "S" | "irObra" | "irNegocio"> {
  /** 23/10: a agenda deste técnico (S.tecnicos[].id), em vez da de quem vê. */
  tecnico?: string;
  /** O id do título (para o aria-labelledby da secção). */
  id?: string;
  className?: string;
  /** 27/10: quem mostra a agenda pode guardar a escolha "A minha" ou "A equipa" (o Hoje do computador põe a da equipa a toda a largura). */
  ambito?: AmbitoAgenda;
  aoMudarAmbito?: (a: AmbitoAgenda) => void;
  /** 27/10: numa coluna estreita (o Hoje do computador), os botões da semana só com a seta e o período numa linha sua. */
  estreita?: boolean;
  /** 27/10: dentro de um cartão (o Hoje do computador): a lista dos dias sem caixa própria. */
  plana?: boolean;
}

export default function MinhaAgenda({ S, irObra, irNegocio, tecnico, id = "minha-agenda", className, ambito: ambitoFora, aoMudarAmbito, estreita, plana }: Props) {
  garantirTecnicos(S);
  // 23/10: as pessoas dos papéis e dos técnicos entram no RH de exemplo (só as que faltam) fora do render, como deve ser
  useEffect(() => { garantirTecnicosNoRh(); }, [S.tecnicos?.length]);
  const hoje = isoDia(new Date());
  const [ref, setRef] = useState(hoje);
  const [ambitoDentro, setAmbitoDentro] = useState<AmbitoAgenda>("minha");
  const ambito = ambitoFora ?? ambitoDentro;
  const setAmbito = (a: AmbitoAgenda): void => { setAmbitoDentro(a); aoMudarAmbito?.(a); };
  const F = useFrota();
  // 28/10: o RH da base numa organização real (rhDaAgenda.ts); a loja de exemplo no protótipo
  const rh = useRhDaAgenda();
  const R = useEquipaReal();
  const dias = diasDoPeriodo("semana", ref);
  if (R?.carregando) {
    return <section aria-labelledby={id} className={className}><h2 id={id} className="text-xl font-semibold tracking-tight">A minha agenda</h2><div className="mt-3"><AgendaACarregar /></div></section>;
  }
  const v = agendaVista({ deals: S.deals, tecnicos: S.tecnicos!, frota: F, rh }, S, R, "minha", dias, tecnico);
  const linha = v.linhas[0];
  const equipa = v.comEquipa && ambito === "equipa";
  const n = linha ? linha.celulas.reduce((a, c) => a + c.itens.filter((x) => x.tipo === "tarefa" || x.tipo === "visita").length, 0) : 0;
  const periodo = tituloPeriodo("semana", dias);

  return (
    <section aria-labelledby={id} className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-xl font-semibold tracking-tight">{equipa ? "A agenda da equipa" : "A minha agenda"}</h2>
        {v.comEquipa && (
          <div role="group" aria-label="Que agenda ver" className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {(["minha", "equipa"] as const).map((a) => (
              <button key={a} type="button" aria-pressed={ambito === a} onClick={() => setAmbito(a)}
                className={cn("min-h-10 rounded-md px-3 text-[15px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary", ambito === a ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {a === "minha" ? "A minha" : "A equipa"}
              </button>
            ))}
          </div>
        )}
      </div>
      {equipa ? (
        <div className="mt-3"><AgendaEquipa S={S} irObra={irObra} irNegocio={irNegocio} ambito="equipa" embutida /></div>
      ) : !linha ? (
        <p className="mt-1 text-[15px] text-muted-foreground" role="note">A sua conta não é membro desta organização: não tem agenda aqui.</p>
      ) : (
        <>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {linha.nome}{linha.papel ? ` · ${linha.papel}` : ""} · {n === 0 ? "nada marcado nesta semana" : `${n} ${n === 1 ? "marcação" : "marcações"} nesta semana`}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={BOTAO} onClick={() => setRef(moverPeriodo("semana", ref, -1))} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" aria-hidden="true" /><span className={estreita ? "hidden" : "hidden sm:inline"}>Anterior</span></button>
            <button type="button" className={BOTAO} onClick={() => setRef(hoje)} aria-pressed={dias.includes(hoje)}>Esta semana</button>
            <button type="button" className={BOTAO} onClick={() => setRef(moverPeriodo("semana", ref, 1))} aria-label="Semana seguinte"><span className={estreita ? "hidden" : "hidden sm:inline"}>Seguinte</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
            <p className={cn("w-full text-[15px] font-medium first-letter:uppercase", !estreita && "sm:ml-auto sm:w-auto")} aria-live="polite">{periodo}</p>
          </div>
          <ol className={cn("mt-3 divide-y divide-border", plana ? "-mx-2 overflow-hidden rounded-xl" : "rounded-2xl border border-border bg-card")} aria-label={`A minha agenda: ${periodo}`}>
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
        </>
      )}
    </section>
  );
}
