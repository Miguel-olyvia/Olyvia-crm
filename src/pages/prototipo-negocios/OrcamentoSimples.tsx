// O orçamento na proposta simples: o total e a margem em grande, as linhas
// numa lista (toca-se numa para a mudar), e o que falta resolver antes de
// enviar, cada coisa com o botão que a resolve. Nada de tabelas largas.
import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { alertas, bloqueado, custoUn, eur, linhaCalc, nfmt, partes, pct, r2, tot, type Negocio } from "./motor";
import { numero, type Ctx } from "./pecas";

const DESCONTOS = [0, 3, 5, 10];

export function OrcamentoSimples(ctx: Ctx & { d: Negocio }) {
  const { S, A, go, run, d } = ctx;
  const o = d.orc!, T = tot(d, S), fechado = !!o.enviada;
  const min = S.cfg.min / 100, alvo = S.cfg.alvo / 100;
  const [aberta, setAberta] = useState<number | null>(null);
  const [verCusto, setVerCusto] = useState(false);
  const mudou = () => { o.aprov = null; };
  const AL = o.verif && !fechado ? alertas(d, S) : [];
  const bloqueios = AL.filter((a) => a.k === "x"), avisos = AL.filter((a) => a.k === "w");
  const estado = T.m < min ? "bad" : T.m < alvo - 0.005 ? "warn" : "ok";
  const cor = { ok: "text-success", warn: "text-warning", bad: "text-destructive" }[estado];
  const barra = { ok: "bg-success", warn: "bg-warning", bad: "bg-destructive" }[estado];
  const pt = partes(d, S);
  const escala = (x: number) => `${Math.max(0, Math.min(1, x / 0.5)) * 100}%`; // a barra vai de 0% a 50% de margem

  return (
    <div className="max-w-3xl space-y-8">
      {/* Total e margem */}
      <section aria-label="Total" className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total sem IVA</p>
            <p className="text-4xl font-semibold tracking-tight tabular-nums">{eur(T.pf)} €</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Margem</p>
            <p className={cn("text-2xl font-semibold tabular-nums", cor)}>{pct(T.m)}</p>
          </div>
        </div>
        <div className="relative mt-5 h-2 rounded-full bg-muted" aria-hidden="true">
          <div className={cn("h-full rounded-full transition-[width] duration-500", barra)} style={{ width: escala(T.m) }} />
          <span className="absolute -top-1 h-4 w-0.5 bg-foreground/60" style={{ left: escala(min) }} />
          <span className="absolute -top-1 h-4 w-0.5 bg-foreground/60" style={{ left: escala(alvo) }} />
        </div>
        <div className="relative mt-1 h-5 text-xs text-muted-foreground" aria-hidden="true">
          <span className="absolute -translate-x-1/2" style={{ left: escala(min) }}>mín. {S.cfg.min}%</span>
          <span className="absolute -translate-x-1/2" style={{ left: escala(alvo) }}>alvo {S.cfg.alvo}%</span>
        </div>
        <p className={cn("mt-2 text-[15px]", cor)}>
          {estado === "ok" ? "Margem no alvo." : estado === "warn" ? "Margem abaixo do alvo, mas acima do mínimo." : "Margem abaixo do mínimo: não se envia sem aprovação."}
          <span className="text-muted-foreground"> Custo {eur(T.custo)} € · lucro previsto {eur(T.pf - T.custo)} €.</span>
        </p>
        <button type="button" onClick={() => setVerCusto(!verCusto)} aria-expanded={verCusto}
          className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
          De onde vem o custo <ChevronDown className={cn("h-4 w-4 transition-transform", verCusto && "rotate-180")} aria-hidden="true" />
        </button>
        {verCusto && (
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-3 animate-in fade-in-0">
            {([["Mão de obra", pt.mo], ["Equipamentos", pt.eq], ["Consumíveis", pt.cons], ...(S.cfg.estrutura ? [["Estrutura", pt.estr]] : []), ["Materiais", pt.mat]] as [string, number][]).map(([l, v]) => (
              <div key={l}><dt className="text-sm text-muted-foreground">{l}</dt><dd className="tabular-nums">{eur(v)} €</dd></div>
            ))}
          </dl>
        )}
      </section>

      {/* Antes de enviar */}
      {o.verif && !fechado && (
        <section id="verif" aria-labelledby="verif-t" className="scroll-mt-6">
          <h3 id="verif-t" className="text-base font-semibold">Antes de enviar</h3>
          <ul className="mt-3 space-y-2">
            {bloqueios.map((a, k) => (
              <li key={"x" + k} className="rounded-xl border border-destructive/30 bg-destructive/[0.04] p-4 animate-in fade-in-0">
                <p className="flex items-start gap-2 text-[15px] font-medium text-foreground"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />{a.t}</p>
                <p className="mt-1 pl-7 text-[15px] text-muted-foreground">{a.d}</p>
                <div className="mt-3 flex flex-wrap gap-2 pl-7">
                  {a.sug != null && <Button onClick={go(() => A.sugerido(d.id, a.i!, a.sug!))}>Usar {eur(a.sug)} €</Button>}
                  {a.aprov && o.aprov !== "pedida" && <Button variant="outline" onClick={go(() => A.pedirAprov(d.id))}>Pedir aprovação à Direção</Button>}
                  {o.aprov === "pedida" && <span className="text-[15px] text-muted-foreground">Aprovação pedida à Direção.</span>}
                </div>
              </li>
            ))}
            {avisos.map((a, k) => (
              <li key={"w" + k} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-start gap-2 text-[15px] font-medium"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />{a.t}</p>
                  <p className="mt-1 pl-7 text-[15px] text-muted-foreground">{a.d}</p>
                </div>
                <div className="flex gap-2">
                  {a.go && <Button variant="outline" size="sm" onClick={go(() => A.nav(a.go!))}>Abrir Catálogo</Button>}
                  {a.key && <Button variant="ghost" size="sm" onClick={go(() => A.vistoAviso(d.id, a.key!))}>Visto</Button>}
                </div>
              </li>
            ))}
            {!bloqueios.length && (
              <li className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/[0.06] p-4 text-[15px] animate-in fade-in-0">
                <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                {o.aprov === "ok" ? "Exceção aprovada pela Direção. Pode enviar." : bloqueado(d, S) ? "À espera da Direção." : "Nada a bloquear. Pode enviar a proposta."}
              </li>
            )}
          </ul>
        </section>
      )}

      {/* As linhas */}
      <section aria-labelledby="linhas-t">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="linhas-t" className="text-base font-semibold">Linhas</h3>
          <span className="text-sm text-muted-foreground">{fechado ? `enviado ${o.enviada}` : "toque numa linha para a mudar"}</span>
        </div>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {o.linhas.map((l, i) => {
            const x = linhaCalc(l, S), m = x.preco > 0 ? (x.preco - x.custo) / x.preco : 0;
            const mc = m < min ? "text-destructive" : m < alvo - 0.005 ? "text-warning" : "text-muted-foreground";
            if (l.t === "mat") return (
              <li key={i} className="flex min-h-16 items-center gap-4 py-3">
                <span className="min-w-0 flex-1"><span className="block text-[15px]">Materiais</span><span className="block text-sm text-muted-foreground">{l.d} · do modelo</span></span>
                <span className="text-right"><span className="block text-[15px] tabular-nums">{eur(x.preco)} €</span><span className={cn("block text-sm", mc)}>margem {pct(m)}</span></span>
              </li>
            );
            const s = x.s!, aberto = aberta === i && !fechado, novo = r2(custoUn(s, S)), mud = !fechado && Math.abs(novo - l.cu) > 0.004;
            return (
              <li key={i}>
                <button type="button" disabled={fechado} onClick={() => setAberta(aberto ? null : i)} aria-expanded={aberto}
                  className="flex min-h-16 w-full items-center gap-4 py-3 text-left disabled:cursor-default">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">{s.n}</span>
                    <span className="block text-sm text-muted-foreground">{nfmt(l.q)} {s.un} × {eur(l.pu)} €</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[15px] tabular-nums">{eur(x.preco)} €</span>
                    <span className={cn("block text-sm", mc)}>margem {pct(m)}{m < min ? " · abaixo do mínimo" : ""}</span>
                  </span>
                  {!fechado && <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")} aria-hidden="true" />}
                </button>
                {aberto && (
                  <div className="mb-3 grid gap-4 rounded-xl bg-muted/50 p-4 sm:grid-cols-2 animate-in fade-in-0 slide-in-from-top-1">
                    <div className="grid gap-2">
                      <span className="text-sm font-medium" id={`q-${i}`}>Quantidade ({s.un})</span>
                      <div role="group" aria-labelledby={`q-${i}`} className="inline-flex w-fit items-center rounded-lg border border-input bg-card p-0.5">
                        <button type="button" aria-label="Menos" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted" onClick={() => run(() => { l.q = Math.max(0, r2(l.q - 1)); mudou(); })}><Minus className="h-4 w-4" /></button>
                        <output className="w-16 text-center text-[17px] font-medium tabular-nums">{nfmt(l.q)}</output>
                        <button type="button" aria-label="Mais" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted" onClick={() => run(() => { l.q = r2(l.q + 1); mudou(); })}><Plus className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Preço por {s.un}</span>
                      <span className="flex items-center gap-2">
                        <input key={l.pu} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={l.pu}
                          className="h-11 w-32 rounded-lg border border-input bg-card px-3 text-right text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
                          onBlur={(e) => { const n = numero(e.target.value); if (!isNaN(n) && n >= 0 && n !== l.pu) run(() => { l.pu = n; mudou(); }); }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                        <span className="text-[15px] text-muted-foreground">€</span>
                      </span>
                    </label>
                    <p className="text-sm text-muted-foreground sm:col-span-2">
                      Custo do Catálogo: {eur(l.cu)} €/{s.un} ({s.perfil}, {nfmt(s.h)} h/{s.un}).
                      {" "}Para o alvo de {S.cfg.alvo}%: {eur(r2(l.cu / (1 - alvo)))} €/{s.un}.
                    </p>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button variant="outline" onClick={() => run(() => { l.pu = r2(l.cu / (1 - alvo)); mudou(); })}>Usar o preço do alvo</Button>
                      {mud && <Button variant="outline" onClick={go(() => A.recalc(d.id, i))}>O Catálogo mudou: usar {eur(novo)} €</Button>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Desconto e tipo de venda */}
      <section aria-label="Desconto e venda" className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <span className="text-[15px] font-medium" id={`desc-${d.id}`}>Desconto</span>
          <div role="group" aria-labelledby={`desc-${d.id}`} className="flex flex-wrap gap-2">
            {DESCONTOS.map((p) => (
              <button key={p} type="button" disabled={fechado} aria-pressed={o.desconto === p} onClick={() => run(() => { o.desconto = p; mudou(); })}
                className={cn("min-h-11 min-w-14 rounded-lg border px-4 text-[15px] transition-colors disabled:opacity-60",
                  o.desconto === p ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40")}>
                {p ? p + "%" : "Sem"}
              </button>
            ))}
          </div>
        </div>
        <button type="button" role="switch" aria-checked={o.vendaDireta} disabled={fechado} onClick={() => run(() => A.vendaDireta(d.id, !o.vendaDireta))}
          className="flex w-full items-center justify-between gap-4 text-left disabled:opacity-60">
          <span><span className="block text-[15px] font-medium">Venda direta</span><span className="block text-sm text-muted-foreground">A proposta aceite chega: não há contrato.</span></span>
          <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", o.vendaDireta ? "bg-primary" : "bg-input")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", o.vendaDireta ? "left-[22px]" : "left-0.5")} />
          </span>
        </button>
      </section>
    </div>
  );
}
