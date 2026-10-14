// Operações e Inventário na proposta simples. Cada ecrã diz numa frase em que
// ponto está, mostra só o que é preciso e tem um botão principal, de quem tem
// de agir. Os outros papéis veem o mesmo, com "Mudar para…".
import { useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPEIS, TECS, aberto, conflitos, nfmt, type Negocio, type Papel } from "./motor";
import { COR_FASE, dataCurta, iniciosRapidos, isoDia } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { faltaParaArrancar, inicioDoPlano, rotuloDia, tecnicosPara } from "./preparacaoObra";
import type { Ctx } from "./pecas";

const ESTADO_PLANO: Record<string, string> = {
  "por aprovar": "à espera de aprovação", aprovado: "aprovado, falta arrancar", "em curso": "em curso", "concluída": "concluída",
};

function Mudar({ ctx, papel }: { ctx: Ctx; papel: Papel }) {
  return (
    <p className="text-[15px] text-muted-foreground">
      Este passo é de {PAPEIS[papel].n}.{" "}
      <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={ctx.go(() => ctx.A.role(papel))}>Mudar para {PAPEIS[papel].n.split(" · ")[0]}</button>
    </p>
  );
}

export function OperacoesSimples(ctx: Ctx) {
  const { S, A, go } = ctx;
  const d = S.op ? S.deals.find((x) => x.id === S.op) : null;
  if (d && d.obra.plano) return <PlanoSimples ctx={ctx} d={d} />;
  // as obras do contrato à obra entram logo com o contrato (o plano por aprovar); as antigas, com o recibo
  const obras = aberto(S).filter((x) => x.obra.plano && (x.fase === 5 || (x.fase === 4 && x.obra.ec)));
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Operações</h1>
      <p className="mt-2 text-lg text-muted-foreground">As obras chegam aqui sozinhas quando o contrato é assinado, com o plano do orçamento por aprovar.</p>
      <ul className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
        {obras.map((o) => {
          const p = o.obra.plano!, nc = conflitos(p).length;
          return (
            <li key={o.id}>
              <button type="button" onClick={go(() => A.abrirPlano(o.id))} className="group flex min-h-16 w-full items-center gap-4 py-3 text-left hover:bg-muted/50 sm:px-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium">{o.nome} · {o.servico}</span>
                  <span className="block text-[15px] text-muted-foreground">
                    Plano {ESTADO_PLANO[p.estado]} · {nfmt(p.tasks.reduce((a, t) => a + t.h, 0))} h
                    {nc ? <span className="inline-flex items-center gap-1"> · <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />{nc} conflito</span> : null}
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {!obras.length && <li className="py-4 text-[15px] text-muted-foreground">Ainda não há obras. Aparecem quando o cliente assina o contrato.</li>}
      </ul>
    </div>
  );
}

function PlanoSimples({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, go, run } = ctx;
  const p = d.obra.plano!, C = conflitos(p), nd = Math.max(5, ...p.tasks.map((t) => t.dia + t.dur));
  const novo = p.origem === "orcamento";
  const e = d.obra.enc, pode = S.role === "operacoes";
  const horas = p.tasks.reduce((a, t) => a + t.h, 0);
  const ultimo = Math.max(...p.tasks.map((t) => t.dia + t.dur - 1));
  // do contrato à obra: as quatro condições; nos planos antigos, só os materiais
  const F = d.obra.ec ? faltaParaArrancar(d).filter((f) => !/plano/.test(f)) : (!e || e.estado === "recebida" ? [] : ["receber os materiais"]);
  const [tecDe, setTecDe] = useState<number | null>(null);
  let frase = "", botao: React.ReactNode = null;
  if (p.estado === "por aprovar") {
    frase = C.length ? "Há um técnico de férias numa tarefa. Troque-o ou adie a tarefa antes de aprovar." : "O plano está pronto para aprovar. Confirme as datas e os técnicos.";
    botao = <Button size="lg" disabled={!!C.length} onClick={go(() => A.aprovarPlano(d.id))}>Aprovar o plano</Button>;
  } else if (p.estado === "aprovado") {
    frase = F.length ? `Plano aprovado. Para arrancar, falta ${F.join(", ")}.` : "Plano aprovado e tudo pronto. Pode arrancar.";
    botao = <Button size="lg" disabled={!!F.length} onClick={go(() => A.arrancar(d.id))}>Arrancar a obra</Button>;
  } else if (p.estado === "em curso") {
    frase = `Obra em curso, no dia ${p.dia + 1}. Acaba a ${rotuloDia(p, ultimo)}.`;
    botao = <Button size="lg" onClick={go(() => A.fimObra(d.id))}>Registar o fim da obra</Button>;
  } else frase = "Obra concluída.";
  const muda = novo && pode && (p.estado === "por aprovar" || p.estado === "aprovado");
  const rapidos = iniciosRapidos(new Date());
  const inicio = inicioDoPlano(p);
  // as tarefas pela fase da obra (os planos antigos ficam numa só lista)
  const grupos = novo ? [...new Set(p.tasks.map((t) => t.fase ?? 0))].sort() : [0];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <button type="button" onClick={go(() => A.nav("operacoes"))} className="inline-flex min-h-11 items-center gap-2 text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Operações
      </button>
      <header className="mt-2">
        <h1 className="text-3xl font-semibold tracking-tight">{d.nome}</h1>
        <p className="mt-1 text-base text-muted-foreground">
          {d.servico} · {p.tasks.length} {p.tasks.length === 1 ? "tarefa" : "tarefas"} · {nfmt(horas)} h de equipa · plano {ESTADO_PLANO[p.estado]}
          {novo && <> · {rotuloDia(p, 0)} a {rotuloDia(p, ultimo)}</>}
        </p>
        {novo && <p className="mt-1 text-[15px] text-muted-foreground">Gerado do plano do orçamento, aceite pelo cliente no contrato.</p>}
      </header>

      <section aria-label="O que fazer" className="mt-8 border-t border-border pt-6">
        <p className="text-lg">{frase}</p>
        {d.obra.ec && p.estado !== "em curso" && p.estado !== "concluída" && (
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px]" aria-label="Condições para arrancar">
            {([["Encomenda aprovada", d.obra.ec.estado === "aprovada"], ["Materiais recebidos", d.obra.ec.estado === "aprovada" && (!e || e.estado === "recebida")], ["Plano aprovado", p.estado !== "por aprovar"], ["Sinal pago", d.fin.pago]] as [string, boolean][]).map(([t, ok]) => (
              <li key={t} className={cn("inline-flex items-center gap-1.5", !ok && "text-muted-foreground")}>
                {ok ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}{t}<span className="sr-only">{ok ? " (feito)" : " (por fazer)"}</span>
              </li>
            ))}
          </ul>
        )}
        {C.map((c) => {
          const ti = p.tasks.indexOf(c.t);
          const alt = TECS.find((x) => x.sk === c.t.sk && x.id !== c.tec.id && !x.ferias.some((k) => k >= c.t.dia && k < c.t.dia + c.t.dur));
          return (
            <div key={ti} className="mt-4 grid gap-3 sm:grid-cols-2">
              {alt && (
                <button type="button" disabled={!pode} onClick={go(() => A.trocar(d.id, ti))}
                  className="min-h-11 rounded-xl border border-border p-4 text-left transition-colors hover:border-foreground disabled:opacity-60">
                  <span className="block text-[15px] font-medium">Trocar por {alt.n}</span>
                  <span className="block text-[15px] text-muted-foreground">{alt.sk}, livre nesses dias, mesmo custo por hora. A obra não atrasa.</span>
                </button>
              )}
              <button type="button" disabled={!pode} onClick={go(() => A.adiar(d.id, ti))}
                className="min-h-11 rounded-xl border border-border p-4 text-left transition-colors hover:border-foreground disabled:opacity-60">
                <span className="block text-[15px] font-medium">Adiar {c.t.nome.toLowerCase()}</span>
                <span className="block text-[15px] text-muted-foreground">{c.tec.n.split(" ")[0]} faz quando voltar de férias. A obra acaba mais tarde.</span>
              </button>
            </div>
          );
        })}
        {p.estado !== "concluída" && (
          <div className="mt-5 flex flex-wrap items-center gap-3">{pode ? botao : <Mudar ctx={ctx} papel="operacoes" />}</div>
        )}
      </section>

      {/* o início: a data do orçamento, confirmada ou mudada pelas Operações */}
      {novo && inicio && (
        <section aria-labelledby="inicio-op" className="mt-10">
          <h2 id="inicio-op" className="text-lg font-semibold">Começa</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">{dataCurta(inicio)}{p.inicio ? "" : " (a próxima segunda-feira; o orçamento não fixou data)"}. Os dias úteis saltam fins de semana e feriados.</p>
          {muda && (
            <div role="group" aria-label="Início da obra" className="mt-3 flex flex-wrap gap-2">
              {rapidos.map((r) => {
                const on = isoDia(r.data) === isoDia(inicio);
                return (
                  <button key={r.k} type="button" aria-pressed={on} onClick={() => run(() => A.inicioPlano(d.id, isoDia(r.data)))}
                    className={cn("min-h-11 rounded-xl border px-4 text-left text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40")}>
                    {r.nome}<span className={cn("block text-sm", on ? "text-primary-foreground/80" : "text-muted-foreground")}>{dataCurta(r.data)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* A linha do tempo: uma faixa por tarefa, um quadrado por dia; nos planos do orçamento, por fase e com a cor da fase */}
      <section aria-labelledby="tempo-t" className="mt-10">
        <h2 id="tempo-t" className="text-lg font-semibold">Dias</h2>
        {muda && <p className="mt-1 text-[15px] text-muted-foreground">Toque no técnico de uma tarefa para o trocar.</p>}
        <div className="mt-4 overflow-x-auto">
          <div className="grid min-w-[760px] gap-y-2" style={{ gridTemplateColumns: `200px repeat(${nd}, minmax(76px, 1fr))` }}>
            <span />
            {Array.from({ length: nd }, (_, k) => <span key={k} className="whitespace-nowrap px-1 text-center text-[13px] text-muted-foreground">{rotuloDia(p, k)}</span>)}
            {grupos.flatMap((g) => {
              const L = p.tasks.map((t, i) => ({ t, i })).filter(({ t }) => !novo || (t.fase ?? 0) === g);
              return [
                ...(novo && g ? [<span key={"f" + g} className="inline-flex items-center gap-2 pt-2 text-[15px] font-semibold" style={{ gridColumn: `1 / span ${nd + 1}` }}><span className="h-3 w-3 rounded" style={{ background: COR_FASE[g] }} aria-hidden="true" />Fase {g} · {FASES_OBRA[g - 1].curto}</span>] : []),
                ...L.flatMap(({ t, i }) => {
                  const tec = TECS.find((x) => x.id === t.tec), c = C.find((x) => x.t === t);
                  const feita = p.estado === "concluída" || (p.estado === "em curso" && t.dia + t.dur <= p.dia);
                  const I = c ? AlertTriangle : feita ? Check : Circle;
                  const cor = novo && t.fase ? COR_FASE[t.fase] : null;
                  return [
                    <span key={i + "n"} className="pr-3 text-[15px]" style={{ gridColumn: 1 }}>
                      {t.nome}
                      {muda
                        ? <button type="button" aria-expanded={tecDe === i} onClick={() => setTecDe(tecDe === i ? null : i)}
                            className={cn("block text-left text-[15px] underline decoration-dotted underline-offset-4", c ? "text-warning" : "text-muted-foreground hover:text-foreground")}>{tec ? tec.n : "escolher técnico"}</button>
                        : <span className="block text-[15px] text-muted-foreground">{tec ? tec.n : "sem técnico"}</span>}
                    </span>,
                    <span key={i + "b"} className="flex items-center px-0.5" style={{ gridColumn: `${t.dia + 2} / span ${t.dur}` }}>
                      <span className={cn("flex h-11 w-full items-center gap-1.5 rounded-lg px-3 text-[15px] transition-colors duration-300", cor ? (t.fase === 1 ? "text-foreground" : "text-white") : feita ? "bg-muted-foreground/25 text-foreground" : "bg-muted text-foreground", c && "ring-2 ring-warning")}
                        style={cor ? { background: cor, opacity: feita ? 0.6 : 1 } : undefined}
                        title={`${t.nome} · ${rotuloDia(p, t.dia)}${t.dur > 1 ? " a " + rotuloDia(p, t.dia + t.dur - 1) : ""}${c ? " · técnico de férias" : ""}`}>
                        <I className={cn("h-4 w-4 shrink-0", cor ? (t.fase === 1 ? "text-foreground" : "text-white") : c ? "text-warning" : feita ? "text-success" : "text-muted-foreground")} aria-hidden="true" />
                        {c ? "de férias" : feita ? "feito" : `${nfmt(t.h)} h`}
                      </span>
                    </span>,
                    // trocar o técnico: os do mesmo ofício, com quem está livre nesses dias
                    ...(tecDe === i ? [
                      <div key={i + "t"} className="pb-2 animate-in fade-in-0 slide-in-from-top-1 duration-200" style={{ gridColumn: `1 / span ${nd + 1}` }}>
                        <div role="group" aria-label={`Técnico de ${t.nome}`} className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3">
                          {tecnicosPara(t).map((x) => (
                            <button key={x.id} type="button" aria-pressed={t.tec === x.id} onClick={() => { run(() => A.trocarTec(d.id, i, x.id)); setTecDe(null); }}
                              className={cn("min-h-11 rounded-xl border px-4 text-left text-[15px] transition-colors", t.tec === x.id ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-foreground/40")}>
                              {x.n}<span className={cn("block text-sm", t.tec === x.id ? "text-primary-foreground/80" : x.livre ? "text-success" : "text-warning")}>{x.livre ? "livre nesses dias" : "de férias nesses dias"}</span>
                            </button>
                          ))}
                        </div>
                      </div>,
                    ] : []),
                  ];
                }),
              ];
            })}
          </div>
        </div>
        <p className="mt-3 flex flex-wrap gap-4 text-[15px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Circle className="h-4 w-4" aria-hidden="true" />previsto</span>
          <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-success" aria-hidden="true" />feito</span>
          <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />conflito</span>
        </p>
      </section>

      <section aria-labelledby="mat-op" className="mt-10">
        <h2 id="mat-op" className="text-lg font-semibold">Materiais</h2>
        <p className="mt-1 text-[15px]">
          {d.obra.ec && d.obra.ec.estado !== "aprovada" ? `Encomenda de cliente ${d.obra.ec.n} à espera do comercial.`
            : !e ? "Tudo em stock e reservado."
            : e.estado === "recebida" ? `Encomenda ${e.n} recebida: tudo reservado.`
            : e.estado === "por confirmar" ? `Encomenda ${e.n} a ${e.forn ?? "fornecedor"}, à espera da validação do Financeiro.`
            : `Encomenda ${e.n} enviada a ${e.forn ?? "fornecedor"}. O Armazém dá entrada quando chegar.`}
        </p>
        <button type="button" onClick={go(() => A.abrir(d.id))} className="mt-1 inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
          Ver o negócio, do contrato à obra<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}

export function InventarioSimples(ctx: Ctx) {
  const { S, A, go } = ctx;
  const obras = aberto(S).filter((d) => d.fase === 5 && d.obra.mats);
  const pode = S.role === "armazem";
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Inventário</h1>
      <p className="mt-2 text-lg text-muted-foreground">Os materiais de cada obra vêm do orçamento. Aparecem aqui quando o recibo é emitido.</p>
      <div className="mt-8 space-y-10">
        {obras.map((d) => {
          const e = d.obra.enc;
          return (
            <section key={d.id} aria-labelledby={`inv-${d.id}`}>
              <h2 id={`inv-${d.id}`} className="text-lg font-semibold">{d.nome} · {d.servico}</h2>
              <p className="mt-1 text-[15px] text-muted-foreground">{!e ? "Tudo em stock e reservado." : e.estado === "recebida" ? `Encomenda ${e.n} recebida.` : `Encomenda ${e.n} ${e.estado}.`}</p>
              <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
                {d.obra.mats!.map((x) => (
                  <li key={x.n} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2.5 text-[15px]">
                    <span>{x.n}</span>
                    <span className={cn("tabular-nums", x.falta > 0 ? "font-medium" : "text-muted-foreground")}>
                      {x.falta > 0
                        ? <><AlertTriangle className="mr-1 inline h-4 w-4 text-warning" aria-hidden="true" />faltam {nfmt(x.falta)} de {nfmt(x.q)} {x.un}</>
                        : <><Check className="mr-1 inline h-4 w-4 text-success" aria-hidden="true" />{nfmt(x.q)} {x.un} reservados</>}
                    </span>
                  </li>
                ))}
              </ul>
              {e && e.estado !== "recebida" && (
                <div className="mt-4 rounded-2xl border border-border bg-card p-5">
                  <p className="text-[15px] font-medium">Encomenda {e.n} a {e.forn}</p>
                  <p className="mt-1 text-[15px] text-muted-foreground">{e.linhas.map((l) => `${nfmt(l.q)} ${l.un} de ${l.n.toLowerCase()}`).join(", ")}. Entrega pedida até 12/10.</p>
                  <div className="mt-4">
                    {!pode ? <Mudar ctx={ctx} papel="armazem" />
                      : e.estado === "por confirmar"
                        ? <Button size="lg" onClick={go(() => A.confirmarEnc(d.id))}>Confirmar e enviar ao fornecedor</Button>
                        : <Button size="lg" onClick={go(() => A.receberEnc(d.id))}>Marcar como recebida</Button>}
                  </div>
                </div>
              )}
            </section>
          );
        })}
        {!obras.length && <p className="text-[15px] text-muted-foreground">Ainda não há obras com materiais.</p>}
      </div>
    </div>
  );
}
