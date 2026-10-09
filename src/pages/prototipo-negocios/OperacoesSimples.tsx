// Operações e Inventário na proposta simples. Cada ecrã diz numa frase em que
// ponto está, mostra só o que é preciso e tem um botão principal, de quem tem
// de agir. Os outros papéis veem o mesmo, com "Mudar para…".
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DIAS, PAPEIS, TECS, aberto, conflitos, nfmt, type Negocio, type Papel } from "./motor";
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
  const obras = aberto(S).filter((x) => x.fase === 5 && x.obra.plano);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Operações</h1>
      <p className="mt-2 text-lg text-muted-foreground">As obras chegam aqui sozinhas quando o Financeiro emite o recibo.</p>
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
                    {nc ? <span className="text-warning"> · {nc} conflito</span> : null}
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {!obras.length && <li className="py-4 text-[15px] text-muted-foreground">Ainda não há obras. Aparecem quando o Financeiro valida um pagamento.</li>}
      </ul>
    </div>
  );
}

function PlanoSimples({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, go } = ctx;
  const p = d.obra.plano!, C = conflitos(p), nd = Math.max(5, ...p.tasks.map((t) => t.dia + t.dur));
  const e = d.obra.enc, matsOk = !e || e.estado === "recebida", pode = S.role === "operacoes";
  const horas = p.tasks.reduce((a, t) => a + t.h, 0);
  const fim = DIAS[Math.max(...p.tasks.map((t) => t.dia + t.dur - 1))];
  let frase = "", botao: React.ReactNode = null;
  if (p.estado === "por aprovar") {
    frase = C.length ? "Há um técnico de férias numa fase. Resolva antes de aprovar." : "O plano está pronto para aprovar.";
    botao = <Button size="lg" disabled={!!C.length} onClick={go(() => A.aprovarPlano(d.id))}>Aprovar o plano</Button>;
  } else if (p.estado === "aprovado") {
    frase = matsOk ? "Plano aprovado e materiais garantidos. Pode arrancar." : "Plano aprovado. A obra só arranca com os materiais garantidos.";
    botao = <Button size="lg" disabled={!matsOk} onClick={go(() => A.arrancar(d.id))}>Arrancar a obra</Button>;
  } else if (p.estado === "em curso") {
    frase = `Obra em curso, no dia ${p.dia + 1}. Acaba a ${fim}.`;
    botao = <Button size="lg" onClick={go(() => A.fimObra(d.id))}>Registar o fim da obra</Button>;
  } else frase = "Obra concluída.";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <button type="button" onClick={go(() => A.nav("operacoes"))} className="inline-flex min-h-11 items-center gap-2 text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Operações
      </button>
      <header className="mt-2">
        <h1 className="text-3xl font-semibold tracking-tight">{d.nome}</h1>
        <p className="mt-1 text-base text-muted-foreground">{d.servico} · {p.tasks.length} fases · {nfmt(horas)} h de equipa · plano {ESTADO_PLANO[p.estado]}</p>
      </header>

      <section aria-label="O que fazer" className="mt-8 rounded-2xl border border-border bg-card p-5">
        <p className="text-lg">{frase}</p>
        {C.map((c) => {
          const ti = p.tasks.indexOf(c.t);
          const alt = TECS.find((x) => x.sk === c.t.sk && x.id !== c.tec.id && !x.ferias.some((k) => k >= c.t.dia && k < c.t.dia + c.t.dur));
          return (
            <div key={ti} className="mt-4 grid gap-3 sm:grid-cols-2">
              {alt && (
                <button type="button" disabled={!pode} onClick={go(() => A.trocar(d.id, ti))}
                  className="rounded-xl border border-border p-4 text-left transition-colors hover:border-primary disabled:opacity-60">
                  <span className="block text-[15px] font-medium">Trocar por {alt.n}</span>
                  <span className="block text-sm text-muted-foreground">{alt.sk}, livre nesses dias, mesmo custo por hora. A obra não atrasa.</span>
                </button>
              )}
              <button type="button" disabled={!pode} onClick={go(() => A.adiar(d.id, ti))}
                className="rounded-xl border border-border p-4 text-left transition-colors hover:border-primary disabled:opacity-60">
                <span className="block text-[15px] font-medium">Adiar {c.t.nome.toLowerCase()}</span>
                <span className="block text-sm text-muted-foreground">{c.tec.n.split(" ")[0]} faz quando voltar de férias. A obra acaba mais tarde.</span>
              </button>
            </div>
          );
        })}
        {p.estado !== "concluída" && (
          <div className="mt-5 flex flex-wrap items-center gap-3">{pode ? botao : <Mudar ctx={ctx} papel="operacoes" />}</div>
        )}
      </section>

      {/* A linha do tempo: uma faixa por fase, um quadrado por dia */}
      <section aria-labelledby="tempo-t" className="mt-10">
        <h2 id="tempo-t" className="text-lg font-semibold">Dias</h2>
        <div className="mt-4 overflow-x-auto">
          <div className="grid min-w-[640px] gap-y-2" style={{ gridTemplateColumns: `180px repeat(${nd}, minmax(52px, 1fr))` }}>
            <span />
            {Array.from({ length: nd }, (_, k) => <span key={k} className="px-1 text-center text-xs text-muted-foreground">{DIAS[k]}</span>)}
            {p.tasks.map((t, i) => {
              const tec = TECS.find((x) => x.id === t.tec), c = C.find((x) => x.t === t);
              const feita = p.estado === "concluída" || (p.estado === "em curso" && t.dia + t.dur <= p.dia);
              return [
                <span key={t.nome + "n"} className="pr-3 text-[15px]" style={{ gridColumn: 1, gridRow: i + 2 }}>{t.nome}<span className="block text-sm text-muted-foreground">{tec ? tec.n : "sem técnico"}</span></span>,
                <span key={t.nome + "b"} className="flex items-center px-0.5" style={{ gridColumn: `${t.dia + 2} / span ${t.dur}`, gridRow: i + 2 }}>
                  <span className={cn("block h-9 w-full rounded-lg px-3 text-sm leading-9 text-foreground/80 transition-colors", c ? "bg-warning/60" : feita ? "bg-success/60" : "bg-primary/40")}
                    title={`${t.nome} · ${DIAS[t.dia]}${t.dur > 1 ? " a " + DIAS[t.dia + t.dur - 1] : ""}${c ? " · técnico de férias" : ""}`}>
                    {c ? "de férias" : feita ? "feito" : `${nfmt(t.h)} h`}
                  </span>
                </span>,
              ];
            })}
          </div>
        </div>
        <p className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-primary/60" />previsto</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-success/70" />feito</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-warning/70" />conflito</span>
        </p>
      </section>

      <section aria-labelledby="mat-op" className="mt-10">
        <h2 id="mat-op" className="text-lg font-semibold">Materiais</h2>
        <p className="mt-1 text-[15px]">{!e ? "Tudo em stock e reservado." : e.estado === "recebida" ? "Encomenda recebida: tudo reservado." : `Encomenda ${e.n} ${e.estado}. O armazém trata no Inventário.`}</p>
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
                    <span className={cn("tabular-nums", x.falta > 0 ? "font-medium text-warning" : "text-muted-foreground")}>
                      {x.falta > 0 ? `faltam ${nfmt(x.falta)} de ${nfmt(x.q)} ${x.un}` : <><Check className="mr-1 inline h-4 w-4 text-success" aria-hidden="true" />{nfmt(x.q)} {x.un} reservados</>}
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
