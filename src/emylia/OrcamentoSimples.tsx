// O orçamento na proposta simples: o total e a margem em grande, as linhas
// numa lista (toca-se numa para a mudar), e o que falta resolver antes de
// enviar, cada coisa com o botão que a resolve. Nada de tabelas largas.
import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { alertas, bloqueado, eur, partes, pct, tot, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { totais } from "./DocsCliente";
import { ProdutosOrcamento } from "./ProdutosOrcamento";
import { LinhasOrcamento } from "./LinhasOrcamento";
import { PlanoObra } from "./PlanoObraOrcamento";
import { CaminhoOrcamento, VersoesProposta } from "./VoltarAtras";
import { useLargura } from "./largura";

const DESCONTOS = [0, 3, 5, 10];

export function OrcamentoSimples(ctx: Ctx & { d: Negocio }) {
  const { S, A, go, run, d } = ctx;
  const o = d.orc!, T = tot(d, S), TI = totais(d, S), fechado = !!o.enviada;
  const min = S.cfg.min / 100, alvo = S.cfg.alvo / 100;
  const [verCusto, setVerCusto] = useState(false);
  const [verMais, setVerMais] = useState(false), [verAvisos, setVerAvisos] = useState(false);
  const mudou = () => { o.aprov = null; };
  const AL = o.verif && !fechado ? alertas(d, S) : [];
  const bloqueios = AL.filter((a) => a.k === "x"), avisos = AL.filter((a) => a.k === "w");
  const estado = T.m < min ? "bad" : T.m < alvo - 0.005 ? "warn" : "ok";
  const cor = { ok: "text-success", warn: "text-warning", bad: "text-destructive" }[estado];
  const barra = { ok: "bg-success", warn: "bg-warning", bad: "bg-destructive" }[estado];
  const pt = partes(d, S);
  const [caixa, largura] = useLargura<HTMLDivElement>(0);
  const lado = largura >= 1080;
  const escala = (x: number) => `${Math.max(0, Math.min(1, x / 0.5)) * 100}%`; // a barra vai de 0% a 50% de margem

  // 27/10: num ecrã largo, o total, a margem, o desconto e o "Antes de enviar" ficam numa coluna à direita, sempre à vista, enquanto
  // se mexe nas linhas e no plano (antes, uma coluna só: para ver a margem depois de mudar uma linha era preciso subir a página)
  const totalEl = (<>
      {/* Total e margem */}
      <section aria-label="Total" className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total sem IVA</p>
            <p className="text-4xl font-semibold tracking-tight tabular-nums">{eur(T.pf)} €</p>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">{eur(TI.total)} € com IVA</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Margem</p>
            <p className={cn("text-2xl font-semibold tabular-nums", cor)}>{pct(T.m)}</p>
          </div>
        </div>
        <div className="relative mt-5 h-2 rounded-full bg-muted" aria-hidden="true">
          <div className={cn("h-full rounded-full motion-safe:transition-[width] duration-500", barra)} style={{ width: escala(T.m) }} />
          <span className="absolute -top-1 h-4 w-0.5 bg-foreground/60" style={{ left: escala(min) }} />
          <span className="absolute -top-1 h-4 w-0.5 bg-foreground/60" style={{ left: escala(alvo) }} />
        </div>
        <div className="relative mt-1 h-5 text-xs text-muted-foreground" aria-hidden="true">
          <span className="absolute -translate-x-full whitespace-nowrap pr-1" style={{ left: escala(min) }}>mín. {S.cfg.min}%</span>
          <span className="absolute whitespace-nowrap pl-1" style={{ left: escala(alvo) }}>alvo {S.cfg.alvo}%</span>
        </div>
        {/* 27/10: no alvo, a barra e a cor já o dizem: sem frase */}
        <p className="mt-2 text-[15px] text-muted-foreground">
          {estado !== "ok" && <span className={cor}>{estado === "warn" ? "Abaixo do alvo" : "Abaixo do mínimo: precisa de aprovação"}. </span>}
          Custo {eur(T.custo)} € · lucro previsto {eur(T.pf - T.custo)} €
        </p>
        <button type="button" onClick={() => setVerCusto(!verCusto)} aria-expanded={verCusto}
          className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
          De onde vem o custo <ChevronDown className={cn("h-4 w-4 transition-transform", verCusto && "rotate-180")} aria-hidden="true" />
        </button>
        {verCusto && (
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
            {([["Mão de obra", pt.mo], ["Equipamentos", pt.eq], ["Consumíveis", pt.cons], ...(S.cfg.estrutura ? [["Estrutura", pt.estr]] : []), ["Materiais", pt.mat]] as [string, number][]).map(([l, v]) => (
              <div key={l}><dt className="text-sm text-muted-foreground">{l}</dt><dd className="tabular-nums">{eur(v)} €</dd></div>
            ))}
          </dl>
        )}
      </section>

  </>);
  const verifEl = (<>
      {/* Antes de enviar */}
      {o.verif && !fechado && (
        <section id="verif" aria-labelledby="verif-t" className="scroll-mt-6">
          <h3 id="verif-t" className="text-[17px] font-semibold tracking-tight">Antes de enviar</h3>
          {/* 27/10: no máximo três blocos: o que corrigir (um cartão, uma linha por problema), os avisos (fechados) e o "pode enviar" */}
          <div className="mt-3 space-y-2">
            {bloqueios.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/[0.04] p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                <p className="flex items-center gap-2 text-[15px] font-medium"><AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />A corrigir ({bloqueios.length})</p>
                <ul className="mt-2 divide-y divide-destructive/15">
                  {(verMais ? bloqueios : bloqueios.slice(0, 3)).map((a, k) => (
                    <li key={"x" + k} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-[15px]">
                      <span className="min-w-0 flex-1"><b className="font-medium">{a.t}</b><span className="text-muted-foreground"> · {a.d}</span></span>
                      {a.sug != null && <Button variant="outline" size="sm" onClick={go(() => A.sugerido(d.id, a.i!, a.sug!))}>Usar {eur(a.sug)} €</Button>}
                    </li>
                  ))}
                </ul>
                {bloqueios.length > 3 && (
                  <button type="button" onClick={() => setVerMais(!verMais)} aria-expanded={verMais} className="mt-1 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
                    {verMais ? "Ver menos" : `Ver mais ${bloqueios.length - 3}`}<ChevronDown className={cn("h-4 w-4 transition-transform", verMais && "rotate-180")} aria-hidden="true" />
                  </button>
                )}
                {bloqueios.some((a) => a.aprov) && (o.aprov === "pedida"
                  ? <p className="mt-2 text-[15px] text-muted-foreground">Aprovação pedida à Direção.</p>
                  : <Button variant="outline" className="mt-2" onClick={go(() => A.pedirAprov(d.id))}>Pedir aprovação à Direção</Button>)}
              </div>
            )}
            {avisos.length > 0 && (
              <div className="rounded-xl border border-border bg-card px-4 py-2">
                <button type="button" onClick={() => setVerAvisos(!verAvisos)} aria-expanded={verAvisos} className="flex min-h-10 w-full items-center justify-between gap-2 text-left text-[15px] font-medium">
                  <span className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />Avisos ({avisos.length})</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", verAvisos && "rotate-180")} aria-hidden="true" />
                </button>
                {verAvisos && (
                  <ul className="divide-y divide-border motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                    {avisos.map((a, k) => (
                      <li key={"w" + k} className="flex flex-wrap items-start justify-between gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          {/* o título do motor é o mesmo para todos os preços desatualizados: aqui diz de que serviço é */}
                          <p className="text-[15px] font-medium">{a.key?.startsWith("st") && S.svc[a.key.slice(2)] ? `${S.svc[a.key.slice(2)].n}: preço desatualizado` : a.t}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">{a.d}</p>
                        </div>
                        <div className="flex gap-2">
                          {a.go && <Button variant="outline" size="sm" onClick={go(() => A.nav(a.go!))}>Abrir Catálogo</Button>}
                          {a.key && <Button variant="ghost" size="sm" onClick={go(() => A.vistoAviso(d.id, a.key!))}>Visto</Button>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {!bloqueios.length && (
              <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/[0.06] p-4 text-[15px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                {o.aprov === "ok" ? "Exceção aprovada pela Direção. Pode enviar." : bloqueado(d, S) ? "À espera da Direção." : "Nada a bloquear. Pode enviar a proposta."}
              </p>
            )}
          </div>
        </section>
      )}

  </>);
  const meioEl = (<>
      {/* As linhas */}
      <section aria-labelledby="linhas-t">
        <h3 id="linhas-t" className="text-[17px] font-semibold tracking-tight">Linhas</h3>
        <div className="mt-2"><LinhasOrcamento ctx={ctx} d={d} simples /></div>
        <div className="mt-6"><ProdutosOrcamento {...ctx} d={d} simples /></div>
      </section>

      <VersoesProposta ctx={ctx} d={d} />

      {/* O plano da obra: as fases, o Gantt em datas (arrasta-se para mudar os dias) e a curva do custo */}
      <PlanoObra ctx={ctx} d={d} />

  </>);
  const descontoEl = (<>
      {/* Desconto e tipo de venda */}
      <section aria-label="Desconto e venda" className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <span className="text-[15px] font-medium" id={`desc-${d.id}`}>Desconto</span>
          <div role="group" aria-labelledby={`desc-${d.id}`} className="flex flex-wrap gap-2">
            {DESCONTOS.map((p) => (
              <button key={p} type="button" disabled={fechado} aria-pressed={o.desconto === p} onClick={() => run(() => { o.desconto = p; mudou(); })}
                className={cn("min-h-11 min-w-14 rounded-lg border px-4 text-[15px] transition-colors disabled:opacity-60",
                  o.desconto === p ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-card hover:border-foreground/40")}>
                {p ? p + "%" : "Sem"}
              </button>
            ))}
          </div>
        </div>
        <button type="button" role="switch" aria-checked={o.vendaDireta} disabled={fechado} onClick={() => run(() => A.vendaDireta(d.id, !o.vendaDireta))}
          className="flex w-full items-center justify-between gap-4 text-left disabled:opacity-60">
          <span><span className="block text-[15px] font-medium">Venda direta</span><span className="block text-sm text-muted-foreground">A proposta aceite chega: não há contrato.</span></span>
          <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", o.vendaDireta ? "bg-primary" : "bg-input")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]", o.vendaDireta ? "left-[22px]" : "left-0.5")} />
          </span>
        </button>
      </section>
  </>);
  return (
    // a medida é a da coluna toda (o bloco de dentro tem o limite de largura quando não há coluna à direita)
    <div ref={caixa}>
    <div className={cn("space-y-8", !lado && "max-w-5xl")}>
      {/* Em que ponto está a proposta, e como voltar atrás (à visita, ou uma nova versão se já foi enviada) */}
      <CaminhoOrcamento ctx={ctx} d={d} />
      {lado ? (
        <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-8">
          <div className="min-w-0 space-y-8">
            {meioEl}
          </div>
          {/* 27/10: só o total fica preso ao topo; o desconto e o "Antes de enviar" seguem o scroll da página (uma só barra) */}
          <aside aria-label="Total, margem e envio" className="space-y-6 self-stretch">
            <div className="sticky top-4 z-10">{totalEl}</div>
            {descontoEl}
            {verifEl}
          </aside>
        </div>
      ) : (<>
        {totalEl}
        {verifEl}
        {meioEl}
        {descontoEl}
      </>)}
    </div>
    </div>
  );
}
