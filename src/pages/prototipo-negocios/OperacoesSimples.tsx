// Operações e Inventário na proposta simples. Cada ecrã diz numa frase em que
// ponto está, mostra só o que é preciso e tem um botão principal, de quem tem
// de agir. Os outros papéis veem o mesmo, com "Mudar para…".
import { useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Circle, Minus, PackageCheck, Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LINHAS, PAPEIS, TECS, aberto, conflitos, diaDeFerias, eur, nfmt, r2, type Negocio, type Papel, type StockKey } from "./motor";
import { COR_FASE, dataCurta, iniciosRapidos, isoDia } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { entregaTarde, faltaParaArrancar, inicioDoPlano, rotuloDia, tecnicosPara, totalEf } from "./preparacaoObra";
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
  const tarde = entregaTarde(d);
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
        {/* a entrega do fornecedor calha no arranque (ou depois): propõe começar no dia útil a seguir */}
        {tarde && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between animate-in fade-in-0">
            <p className="flex items-start gap-2 text-[15px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <span>Os materiais chegam a {dataCurta(tarde.entrega)} e a obra começa a {dataCurta(tarde.inicio)}. Sem os materiais, a equipa fica parada.</span></p>
            {pode
              ? <Button variant="outline" className="min-h-11 shrink-0" onClick={go(() => A.inicioPlano(d.id, isoDia(tarde.depois)))}>Começar a {dataCurta(tarde.depois)}</Button>
              : <Mudar ctx={ctx} papel="operacoes" />}
          </div>
        )}
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
          const alt = TECS.find((x) => x.sk === c.t.sk && x.id !== c.tec.id && diaDeFerias(x, p, c.t.dia, c.t.dur) == null);
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
                          {tecnicosPara(t, p).map((x) => (
                            <button key={x.id} type="button" aria-pressed={t.tec === x.id} onClick={() => { run(() => A.trocarTec(d.id, i, x.id)); setTecDe(null); }}
                              className={cn("min-h-11 rounded-xl border px-4 text-left text-[15px] transition-colors", t.tec === x.id ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-foreground/40")}>
                              {x.n}<span className={cn("block text-sm", t.tec === x.id ? "text-primary-foreground/80" : x.livre ? "text-success" : "text-warning")}>{x.livre ? "livre nesses dias" : `de férias a ${x.ferias}`}</span>
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

/** O nome de cada material de stock (pela chave), a partir dos modelos. */
const NOME_STOCK: Record<string, { n: string; un: string }> = Object.fromEntries(
  Object.values(LINHAS).flatMap((L) => L.mats.map(([n, un, , k]) => [k, { n, un }] as const)),
);
const ESTADO_EF: Record<string, { t: string; tom: string }> = {
  "por confirmar": { t: "por validar", tom: "bg-warning/15 text-foreground" },
  encomendada: { t: "encomendada", tom: "bg-primary/10 text-primary" },
  parcial: { t: "entrada parcial", tom: "bg-warning/15 text-foreground" },
  recebida: { t: "recebida", tom: "bg-success/15 text-foreground" },
};
type AbaInvS = "ef" | "ec" | "stock";

/** Mais e menos, com alvos de 44 px. */
function Passos({ v, max, rot, onSet }: { v: number; max: number; rot: string; onSet: (v: number) => void }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-input bg-card p-0.5" role="group" aria-label={rot}>
      <button type="button" aria-label="Menos" disabled={v <= 0} onClick={() => onSet(Math.max(0, v - 1))} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"><Minus className="h-4 w-4" /></button>
      <output className="w-12 text-center tabular-nums">{nfmt(v)}</output>
      <button type="button" aria-label="Mais" disabled={v >= max} onClick={() => onSet(Math.min(max, v + 1))} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"><Plus className="h-4 w-4" /></button>
    </span>
  );
}

/** Uma encomenda a fornecedor: o fornecedor, a entrega, as linhas com o custo e o que já chegou, e a ação de quem tem a vez. */
function CartaoEf({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, go, run } = ctx;
  const e = d.obra.enc!, novo = !!d.obra.ec;
  const [conferir, setConferir] = useState(false);
  const [chegou, setChegou] = useState<number[]>(() => e.linhas.map((x) => r2(x.q - (x.recebido ?? 0))));
  const est = ESTADO_EF[e.estado];
  const acao = (() => {
    if (e.estado === "por confirmar") {
      if (novo) return S.role === "financeiro" ? <Button onClick={go(() => A.validarEf(d.id))}>Validar e encomendar</Button> : <Mudar ctx={ctx} papel="financeiro" />;
      return S.role === "armazem" ? <Button onClick={go(() => A.confirmarEnc(d.id))}>Confirmar e enviar ao fornecedor</Button> : <Mudar ctx={ctx} papel="armazem" />;
    }
    if (e.estado === "encomendada" || e.estado === "parcial") {
      return (
        <div className="flex flex-wrap items-center gap-3">
          {S.role === "armazem"
            ? <Button onClick={() => { setChegou(e.linhas.map((x) => r2(x.q - (x.recebido ?? 0)))); setConferir(!conferir); }} aria-expanded={conferir}>{e.estado === "parcial" ? "Conferir o resto" : "Conferir a entrega"}</Button>
            : <Mudar ctx={ctx} papel="armazem" />}
          {e.estado === "encomendada" && !e.entrega && (
            <button type="button" onClick={go(() => A.confirmarEntrega(d.id))} className="inline-flex min-h-11 items-center text-[15px] font-medium text-primary underline-offset-4 hover:underline">Simular: o fornecedor confirma a entrega</button>
          )}
        </div>
      );
    }
    return null;
  })();
  return (
    <li className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] animate-in fade-in-0 duration-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-base font-semibold"><Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{e.n} · {e.forn ?? "fornecedor por escolher"}</p>
          <button type="button" onClick={go(() => A.abrir(d.id))} className="text-left text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Obra de {d.nome} · {d.servico}{d.obra.ec ? ` · da ${d.obra.ec.n}` : ""}
          </button>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-medium", est.tom)}>{est.t}</span>
      </div>
      <p className="mt-2 text-[15px]">
        {e.estado === "por confirmar" ? (novo ? (d.fin.pago ? "O Financeiro valida (o sinal já entrou)." : "O Financeiro valida. Atenção: o sinal ainda não entrou.") : "O armazém confirma e envia ao fornecedor.")
          : e.estado === "recebida" ? "Tudo recebido e reservado para a obra."
          : e.entrega ? `Entrega confirmada pelo fornecedor para ${e.entrega}.` : "Enviada ao fornecedor, à espera da data de entrega."}
        {e.validada && <span className="text-muted-foreground"> Validada por {e.validada.por} · {e.validada.q}.</span>}
        {entregaTarde(d) && <span className="mt-1 flex items-start gap-2 text-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />Chega no dia em que a obra começa (ou depois). As Operações podem passar o início para o dia útil seguinte.</span>}
      </p>
      <ul className="mt-3 divide-y divide-border">
        {e.linhas.map((x, i) => {
          const rec = x.recebido ?? 0;
          return (
            <li key={x.n} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 text-[15px]">
              <span className="min-w-0 flex-1">{x.n}<span className="block text-sm tabular-nums text-muted-foreground">{nfmt(x.q)} {x.un}{x.custo ? ` × ${eur(x.custo)} € = ${eur(x.custo * x.q)} €` : ""}</span></span>
              {conferir && rec < x.q
                ? <span className="flex items-center gap-2 text-sm text-muted-foreground">chegou <Passos v={chegou[i] ?? 0} max={r2(x.q - rec)} rot={`Quanto chegou de ${x.n}`} onSet={(v) => setChegou((c) => c.map((y, j) => (j === i ? v : y)))} /> {x.un}</span>
                : <span className={cn("inline-flex items-center gap-1.5 text-sm tabular-nums", rec >= x.q ? "text-success" : rec > 0 ? "text-warning" : "text-muted-foreground")}>
                    {rec >= x.q ? <><Check className="h-4 w-4" aria-hidden="true" />recebido</> : rec > 0 ? `${nfmt(rec)} de ${nfmt(x.q)} recebidos` : "por receber"}
                  </span>}
            </li>
          );
        })}
      </ul>
      {e.linhas.some((x) => x.custo) && <p className="mt-1 flex justify-between border-t border-border pt-2 text-[15px]"><span className="text-muted-foreground">Total</span><b className="font-semibold tabular-nums">{eur(totalEf(e))} €</b></p>}
      {conferir && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 p-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <p className="flex-1 text-[15px]">{chegou.every((v, i) => v >= r2(e.linhas[i].q - (e.linhas[i].recebido ?? 0))) ? "Chegou tudo: a encomenda fica recebida." : "Chegou menos do que o pedido: fica uma entrada parcial e o resto continua à espera."}</p>
          <Button variant="ghost" onClick={() => setConferir(false)}>Cancelar</Button>
          <Button onClick={() => { run(() => A.receberLinhas(d.id, chegou)); setConferir(false); }}>Dar entrada</Button>
        </div>
      )}
      {acao && !conferir && <div className="mt-4">{acao}</div>}
    </li>
  );
}

export function InventarioSimples(ctx: Ctx) {
  const { S, A, go } = ctx;
  const [aba, setAba] = useState<AbaInvS>("ef");
  const comEf = aberto(S).filter((d) => d.obra.enc && (d.obra.enc.linhas.length || d.obra.enc.estado !== "recebida"));
  const aReceber = comEf.filter((d) => d.obra.enc!.estado === "encomendada" || d.obra.enc!.estado === "parcial");
  const porValidar = comEf.filter((d) => d.obra.enc!.estado === "por confirmar");
  const recebidas = comEf.filter((d) => d.obra.enc!.estado === "recebida");
  const ecs = aberto(S).filter((d) => d.obra.ec);
  // o stock: em armazém (S.stock já sem o reservado), reservado para obras e a chegar
  const reservado: Record<string, number> = {}, aChegar: Record<string, number> = {};
  for (const d of aberto(S)) {
    if (d.obra.plano?.estado === "concluída") continue;
    const linhas = d.obra.ec ? (d.obra.ec.estado === "aprovada" ? d.obra.ec.linhas : []) : d.obra.mats ?? [];
    for (const x of linhas) if ("k" in x && x.k) reservado[x.k] = r2((reservado[x.k] ?? 0) + x.res);
    const e = d.obra.enc;
    if (e && (e.estado === "encomendada" || e.estado === "parcial"))
      for (const x of e.linhas) { const k = Object.keys(NOME_STOCK).find((c) => NOME_STOCK[c].n === x.n); if (k) aChegar[k] = r2((aChegar[k] ?? 0) + x.q - (x.recebido ?? 0)); }
  }
  const ABAS: [AbaInvS, string, number][] = [["ef", "Encomendas a fornecedor", aReceber.length + porValidar.length], ["ec", "Encomendas de cliente", ecs.filter((d) => d.obra.ec!.estado !== "aprovada").length], ["stock", "Stock", 0]];
  const frase = [
    aReceber.length && `${aReceber.length} a receber`, porValidar.length && `${porValidar.length} por validar`,
    ecs.filter((d) => d.obra.ec!.estado !== "aprovada").length && `${ecs.filter((d) => d.obra.ec!.estado !== "aprovada").length} encomenda de cliente por aprovar`,
  ].filter(Boolean).join(" · ");
  const grupo = (t: string, L: Negocio[], vazio?: string) => (
    <section aria-label={t} className="mt-8">
      <h2 className="text-lg font-semibold">{t} <span className="font-normal text-muted-foreground">· {L.length}</span></h2>
      {L.length ? <ul className="mt-3 space-y-4">{L.map((d) => <CartaoEf key={d.id} ctx={ctx} d={d} />)}</ul> : vazio ? <p className="mt-2 text-[15px] text-muted-foreground">{vazio}</p> : null}
    </section>
  );
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Inventário</h1>
      <p className="mt-2 text-lg text-muted-foreground">{frase ? frase + "." : "Nada pendente."} As encomendas de cliente nascem do contrato; o que falta em stock vai ao fornecedor.</p>
      <div role="tablist" aria-label="Inventário" className="mt-6 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ABAS.map(([k, t, n]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={(ev) => { setAba(k); ev.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }}
            className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[15px] font-medium transition-colors", aba === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}{n > 0 && <span className="rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">{n}</span>}
          </button>
        ))}
      </div>

      {aba === "ef" && (
        <div className="animate-in fade-in-0 duration-200">
          {grupo("A receber", aReceber, "Nada a caminho.")}
          {grupo("Por validar", porValidar, "Nenhuma à espera de validação.")}
          {recebidas.length > 0 && grupo("Recebidas", recebidas)}
        </div>
      )}

      {aba === "ec" && (
        <ul className="mt-8 space-y-4 animate-in fade-in-0 duration-200">
          {ecs.map((d) => {
            const ec = d.obra.ec!;
            return (
              <li key={d.id} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-base font-semibold"><PackageCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{ec.n} · {d.nome}</p>
                    <p className="text-[15px] text-muted-foreground">{d.servico} · do contrato CT 2026/{d.id} · {ec.criada}</p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-medium", ec.estado === "aprovada" ? "bg-success/15" : "bg-warning/15")}>{ec.estado}</span>
                </div>
                <ul className="mt-3 divide-y divide-border">
                  {ec.linhas.map((x) => (
                    <li key={x.n} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-[15px]">
                      <span className="min-w-0 flex-1">{x.n}<span className="block text-sm tabular-nums text-muted-foreground">{nfmt(x.q)} {x.un} × {eur(x.custo ?? 0)} €</span></span>
                      <span className={cn("text-sm", x.falta > 0 ? "text-warning" : "text-success")}>{ec.estado !== "aprovada" ? (x.falta > 0 ? `faltariam ${nfmt(x.falta)}` : "há em stock") : x.falta > 0 ? `${nfmt(x.res)} reservados · ${nfmt(x.falta)} a chegar` : "reservado"}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-[15px]">
                  <span className="text-muted-foreground">Custo {eur(ec.custo ?? 0)} € · na proposta {eur(ec.valor)} €</span>
                  {ec.estado !== "aprovada" && (S.role === "comercial" ? <Button size="sm" onClick={go(() => A.aprovarEc(d.id))}>Aprovar a encomenda</Button> : <Mudar ctx={ctx} papel="comercial" />)}
                </p>
              </li>
            );
          })}
          {!ecs.length && <li className="text-[15px] text-muted-foreground">Ainda não há encomendas de cliente. Nascem quando o cliente assina o contrato.</li>}
        </ul>
      )}

      {aba === "stock" && (
        <div className="mt-8 animate-in fade-in-0 duration-200">
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
            {(Object.keys(S.stock) as StockKey[]).map((k) => {
              const m = NOME_STOCK[k] ?? { n: k, un: "" }, v = S.stock[k];
              return (
                <li key={k} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-[15px]">
                  <span className="min-w-0 flex-1 font-medium">{m.n}</span>
                  <span className="flex flex-wrap gap-x-4 text-sm tabular-nums">
                    <span className={cn(v <= 0 ? "text-warning" : "")}>{nfmt(Math.max(0, v))} {m.un} livres</span>
                    {reservado[k] ? <span className="text-muted-foreground">{nfmt(reservado[k])} {reservado[k] === 1 ? "reservado" : "reservados"}</span> : null}
                    {aChegar[k] ? <span className="text-primary">{nfmt(aChegar[k])} a chegar</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[15px] text-muted-foreground">Livres: em armazém e sem obra. Reservados: para obras com a encomenda de cliente aprovada. A chegar: encomendados ao fornecedor.</p>
        </div>
      )}
    </div>
  );
}
