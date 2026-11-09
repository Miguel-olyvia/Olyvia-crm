// 9/11 (Rúben: «gerar logo o plano da obra com tudo direitinho, técnicos etc., para seguir o fluxo já com o mapa de datas»). O mapa de datas
// da obra, no Estúdio e no fecho da visita: o dia de início (num toque), a duração e as datas, a equipa (quem vem e de que ofício), e as
// tarefas por fase, cada uma com o técnico, os dias e uma barra no calendário. Tocar numa tarefa mostra os materiais e consumíveis da
// receita. O plano vem de planoDaVisita.ts (o mesmo que a obra vai ter).
import { useMemo } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, Package, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { COR_FASE } from "./fasesObra";
import { dataCurta, deIso, iniciosRapidos, isoDia } from "./planoObra";
import { nomeFaseCurto, type PlanoDatas } from "./planoDaVisita";
import type { FaseObra } from "./fasesObra";

const dataLonga = (d: Date) => d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
const nfq = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
const chip = (on: boolean) => cn("inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] transition-colors",
  on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");

export function MapaDatasObra({ P, inicio, mudarInicio, escuro = false }: { P: PlanoDatas; inicio: string; mudarInicio: (iso: string) => void; escuro?: boolean }) {
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
            <p className="flex items-start gap-2 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {P.porAtribuir} {P.porAtribuir === 1 ? "tarefa fica" : "tarefas ficam"} por atribuir: o RH não tem ninguém desse ofício.</p>
          )}
          {ocupadas.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Sem ninguém livre: {ocupadas.map((t) => `${t.tecNome} está ${t.ocupado} (${t.nome})`).join("; ")}. Escolha outro dia ou as Operações acertam no plano.</p>
          )}
        </section>

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
                            <span className={cn("block text-sm", t.tec ? "text-muted-foreground" : "text-warning-foreground")}>{t.tecNome} · {t.oficio}{t.ocupado ? ` (${t.ocupado})` : ""}</span>
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
                          <Package className="h-3.5 w-3.5" aria-hidden="true" />{t.materiais.length ? `${t.materiais.length} ${t.materiais.length === 1 ? "material" : "materiais"} e consumíveis` : "Sem materiais na receita"} · {nfq(t.h)} h
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
                        </span>
                      </summary>
                      <div className="pt-3 text-sm">
                        <p className="text-muted-foreground">De {dataLonga(t.inicio)} a {dataLonga(t.fim)}.</p>
                        {t.materiais.length > 0 && (
                          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                            {t.materiais.map((m) => <li key={m.n} className="flex justify-between gap-3 rounded-lg bg-muted/50 px-3 py-1.5"><span className="min-w-0 truncate">{m.n}</span><span className="shrink-0 tabular-nums text-muted-foreground">{nfq(m.q)} {m.un}</span></li>)}
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

/** O dia de início por omissão: o guardado (se ainda não passou), senão a próxima segunda-feira útil. */
export function inicioPorOmissao(guardado?: string): string {
  const hoje = isoDia(new Date());
  if (guardado && guardado >= hoje && !Number.isNaN(deIso(guardado).getTime())) return guardado;
  return isoDia(iniciosRapidos(new Date())[0].data);
}
