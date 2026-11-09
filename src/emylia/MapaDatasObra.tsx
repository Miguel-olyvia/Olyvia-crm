// 9/11 (Rúben: «gerar logo o plano da obra com tudo direitinho, técnicos etc., para seguir o fluxo já com o mapa de datas»). O mapa de datas
// da obra, no Estúdio e no fecho da visita: o dia de início (num toque), a duração e as datas, a equipa (quem vem e de que ofício), e as
// tarefas por fase, cada uma com o técnico, os dias e uma barra no calendário. Tocar numa tarefa mostra os materiais e consumíveis da
// receita. O plano vem de planoDaVisita.ts (o mesmo que a obra vai ter).
import { useMemo } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, Package, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { COR_FASE } from "./fasesObra";
import { dataCurta, deIso, diasDaObra, iniciosRapidos, isoDia } from "./planoObra";
import { nomeFaseCurto, type PlanoDatas } from "./planoDaVisita";
import { EquipaDaObra, TrocarTecnico, type PropsEquipa } from "./EquipaDaObra";
import type { FaseObra } from "./fasesObra";

const dataLonga = (d: Date) => d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
const nfq = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
const chip = (on: boolean) => cn("inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] transition-colors",
  on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");

/** 9/11: com `equipa`, a equipa é editável (trocar técnicos, ver a agenda, criar equipas, alertas e sugestões: EquipaDaObra.tsx). */
export function MapaDatasObra({ P, inicio, mudarInicio, escuro = false, equipa }: {
  P: PlanoDatas; inicio: string; mudarInicio: (iso: string) => void; escuro?: boolean;
  equipa?: Omit<PropsEquipa, "P" | "mudarInicio">;
}) {
  const rapidos = useMemo(() => iniciosRapidos(new Date()), []);
  const fases = useMemo(() => {
    const m = new Map<FaseObra, PlanoDatas["tarefas"]>();
    for (const t of P.tarefas) m.set(t.fase, [...(m.get(t.fase) ?? []), t]);
    return [...m].sort((a, b) => a[0] - b[0]);
  }, [P]);
  const total = Math.max(1, P.dias);
  const ocupadas = P.tarefas.filter((t) => t.ocupado);
  const hojeIso = isoDia(new Date());

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm font-medium">A obra começa</p>
        <div className="flex flex-wrap gap-2">
          {rapidos.map((r) => {
            const iso = isoDia(r.data);
            return <button key={r.k} type="button" aria-pressed={inicio === iso} className={chip(inicio === iso)} onClick={() => mudarInicio(iso)}>{r.nome}</button>;
          })}
          <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input bg-card px-3 text-[15px]">
            <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="sr-only">Outro dia</span>
            <input type="date" value={inicio} min={hojeIso} onChange={(e) => e.target.value && mudarInicio(e.target.value)} className="bg-transparent outline-none" />
          </label>
        </div>
      </div>

      {!P.tarefas.length ? (
        <p className="text-[15px] text-muted-foreground">Ainda não há serviços com horas no Catálogo para fazer o plano.</p>
      ) : <>
        <dl className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-muted/60 px-4 py-3">
            <dt className="text-xs text-muted-foreground">Duração</dt>
            <dd className="text-lg font-semibold tabular-nums">{P.dias} {P.dias === 1 ? "dia útil" : "dias úteis"}</dd>
          </div>
          <div className="rounded-xl bg-muted/60 px-4 py-3">
            <dt className="text-xs text-muted-foreground">Começa</dt>
            <dd className="text-lg font-semibold">{P.inicio ? dataCurta(P.inicio) : "—"}</dd>
          </div>
          <div className="rounded-xl bg-muted/60 px-4 py-3">
            <dt className="text-xs text-muted-foreground">Fica pronta</dt>
            <dd className="text-lg font-semibold">{P.fim ? dataCurta(P.fim) : "—"}</dd>
          </div>
        </dl>

        <Calendario P={P} />

        {equipa ? <EquipaDaObra P={P} mudarInicio={mudarInicio} {...equipa} /> : (
        <section aria-label="A equipa" className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" aria-hidden="true" />A equipa</h4>
          {P.equipa.length ? (
            <ul className="flex flex-wrap gap-2">
              {P.equipa.map((x) => (
                <li key={x.id} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm"><b className="font-medium">{x.n}</b> <span className="text-muted-foreground">· {x.oficio}</span></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">O RH ainda não tem técnicos dos ofícios desta obra.</p>}
          {P.porAtribuir > 0 && (
            <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {P.porAtribuir} {P.porAtribuir === 1 ? "tarefa fica" : "tarefas ficam"} por atribuir: o RH não tem ninguém desse ofício.</p>
          )}
          {ocupadas.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Sem ninguém livre: {ocupadas.map((t) => `${t.tecNome} está ${t.ocupado} (${t.nome})`).join("; ")}. Escolha outro dia ou as Operações acertam no plano.</p>
          )}
        </section>
        )}

        <section aria-label="O mapa de datas" className="space-y-4">
          {fases.map(([f, ts]) => (
            <div key={f} className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: COR_FASE[f] }} />{nomeFaseCurto(f)}
              </h4>
              <ol className="space-y-2">
                {ts.map((t, i) => (
                  <li key={`${t.nome}-${i}`}>
                    <details className={cn("group rounded-xl border p-3", escuro ? "border-white/15 bg-white/5" : "border-border bg-card")}>
                      <summary className="flex min-h-11 cursor-pointer list-none flex-col gap-2">
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0 text-[15px]">
                            <b className="font-medium">{t.nome}</b>
                            <span className={cn("block text-sm", t.tec ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300")}>{t.tecNome} · {t.oficio}{t.ocupado ? ` (${t.ocupado})` : ""}</span>
                          </span>
                          <span className="shrink-0 text-right text-sm tabular-nums">
                            <b className="font-medium">{t.dur} {t.dur === 1 ? "dia" : "dias"}</b>
                            <span className="block text-muted-foreground">{dataCurta(t.inicio)}{t.dur > 1 ? ` a ${dataCurta(t.fim)}` : ""}</span>
                          </span>
                        </span>
                        {/* a barra no calendário da obra (dias úteis) */}
                        <span aria-hidden="true" className="relative block h-2.5 rounded-full bg-muted">
                          <span className="absolute inset-y-0 rounded-full" style={{ left: `${(t.dia / total) * 100}%`, width: `${Math.max(2, (t.dur / total) * 100)}%`, background: COR_FASE[t.fase] }} />
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Package className="h-3.5 w-3.5" aria-hidden="true" />{t.qtd ? `${nfq(t.qtd.q)} ${t.qtd.un} · ` : ""}{t.materiais.length ? `${t.materiais.length} ${t.materiais.length === 1 ? "material" : "materiais"} e consumíveis` : "Sem materiais na receita"} · {nfq(t.h)} h
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
                        </span>
                      </summary>
                      <div className="pt-3 text-sm">
                        {equipa?.mudar && <div className="mb-3"><TrocarTecnico t={t} P={P} S={equipa.S} negocio={equipa.negocio} escolhas={equipa.escolhas} mudar={equipa.mudar} /></div>}
                        <p className="text-muted-foreground">{t.dur > 1 ? `De ${dataLonga(t.inicio)} a ${dataLonga(t.fim)}.` : `${dataLonga(t.inicio)[0].toUpperCase()}${dataLonga(t.inicio).slice(1)}.`}</p>
                        {t.passos.length > 0 && (
                          <div className="mt-2">
                            <p className="font-medium">O que {t.tec ? t.tecNome.split(" ")[0] : "o técnico"} faz</p>
                            <ol className="mt-1 space-y-1">
                              {t.passos.map((x, k) => (
                                <li key={k} className="flex justify-between gap-3 rounded-lg bg-muted/50 px-3 py-1.5">
                                  <span className="min-w-0">{k + 1}. {x.n}{x.oficio !== t.oficio ? <span className="text-muted-foreground"> · {x.oficio}</span> : null}</span>
                                  <span className="shrink-0 tabular-nums text-muted-foreground">{nfq(x.h)} h</span>
                                </li>
                              ))}
                            </ol>
                            <p className="mt-1 text-xs text-muted-foreground">Os passos vêm da receita do serviço no Catálogo (Catálogo e custos): mudá-los lá muda as horas e o plano.</p>
                          </div>
                        )}
                        {t.qtd && <p className="mt-2"><b className="font-medium">Medida:</b> {nfq(t.qtd.q)} {t.qtd.un}. Os materiais contam-se por {t.qtd.un} (a receita do Catálogo × a medida).</p>}
                        {t.materiais.length > 0 && (
                          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                            {t.materiais.map((m) => <li key={m.n} className="flex justify-between gap-3 rounded-lg bg-muted/50 px-3 py-1.5"><span className="min-w-0 truncate">{m.n}</span><span className="shrink-0 text-right tabular-nums text-muted-foreground">{nfq(m.q)} {m.un}{t.qtd ? <span className="block text-xs">{nfq(m.porUn)} {m.un}/{t.qtd.un} × {nfq(t.qtd.q)} {t.qtd.un}</span> : null}</span></li>)}
                          </ul>
                        )}
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      </>}
    </div>
  );
}

/** O calendário da obra: uma coluna por dia útil (as segundas marcam a semana), uma linha por tarefa com a barra nos seus dias. */
function Calendario({ P }: { P: PlanoDatas }) {
  if (!P.inicio || P.dias < 1) return null;
  const dias = diasDaObra(P.inicio, P.dias);
  const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const colunas = `minmax(9rem, 13rem) repeat(${dias.length}, minmax(2.6rem, 1fr))`;
  const semana = (k: number) => k > 0 && dias[k].getDay() === 1;
  return (
    <section aria-label="O calendário da obra" className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />O calendário: {P.dias} {P.dias === 1 ? "dia útil" : "dias úteis"}, de {dataCurta(P.inicio)} a {P.fim ? dataCurta(P.fim) : ""}</h4>
      <div className="overflow-x-auto rounded-xl border border-border">
        <div role="table" className="grid min-w-max text-xs" style={{ gridTemplateColumns: colunas }}>
          <div role="row" className="contents">
            <div role="columnheader" className="sticky left-0 z-10 border-b border-border bg-card px-3 py-2 font-medium">Tarefa</div>
            {dias.map((d, k) => (
              <div key={k} role="columnheader" className={cn("border-b border-border px-1 py-1.5 text-center tabular-nums", semana(k) && "border-l-2 border-l-foreground/20", k === 0 || d.getDate() === 1 ? "font-semibold" : "text-muted-foreground")}>
                <span className="block">{SEM[d.getDay()]}</span>
                <span className="block text-sm text-foreground">{d.getDate()}</span>
                {(k === 0 || d.getDate() === 1) && <span className="block">{MES[d.getMonth()]}</span>}
              </div>
            ))}
          </div>
          {P.tarefas.map((t, i) => (
            <div key={i} role="row" className="contents">
              <div role="cell" className="sticky left-0 z-10 truncate border-b border-border bg-card px-3 py-2" title={`${t.nome} · ${t.tecNome}`}>
                <span className="block truncate font-medium">{t.nome}</span>
                <span className="block truncate text-muted-foreground">{t.tecNome}</span>
              </div>
              {dias.map((_, k) => {
                const dentro = k >= t.dia && k < t.dia + t.dur;
                return (
                  <div key={k} role="cell" className={cn("relative border-b border-border", semana(k) && "border-l-2 border-l-foreground/20")}>
                    {dentro && <span aria-label={k === t.dia ? `${t.nome}: ${t.dur} ${t.dur === 1 ? "dia" : "dias"}` : undefined}
                      className={cn("absolute inset-y-2.5", k === t.dia ? "left-1 rounded-l-md" : "left-0", k === t.dia + t.dur - 1 ? "right-1 rounded-r-md" : "right-0")}
                      style={{ background: COR_FASE[t.fase] }} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Só dias úteis: sem fins de semana nem feriados. A linha mais grossa marca o início de cada semana.</p>
    </section>
  );
}

/** O dia de início por omissão: o guardado (se ainda não passou), senão a próxima segunda-feira útil. */
export function inicioPorOmissao(guardado?: string): string {
  const hoje = isoDia(new Date());
  if (guardado && guardado >= hoje && !Number.isNaN(deIso(guardado).getTime())) return guardado;
  return isoDia(iniciosRapidos(new Date())[0].data);
}
