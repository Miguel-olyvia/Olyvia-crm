// A secção "Produtos" da etapa "Necessidades do cliente" (13/10/2026).
// Em cima, o que os serviços escolhidos obrigam: a pergunta ("O cliente mantém a sanita?") e, com "Não",
// os produtos do ramo do Catálogo para escolher. A seguir, os produtos escolhidos (quantidade, o serviço
// que trazem, "o cliente fornece"). No fim, juntar outros produtos do Catálogo (os só vendidos, como um espelho).
import { useMemo, useState } from "react";
import { Check, Link2, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATALOGO, normal } from "./catalogo";
import { aValidar } from "./CamposFase";
import { eur, nfmt, servicosVisita, type Negocio, type SvcId } from "./motor";
import { numero, type Ctx } from "./pecas";
import { useCatalogo } from "./v2/catalogoStore";
import { caminho } from "./v2/catalogoModelo";
import { CONSUMIVEIS } from "./equipamentosCliente";
import { ServicosCatalogo } from "./ServicosCatalogo";
import { obrigacoes, precoProduto, produtosDoRamo, qtdSugerida, textoClienteCompra, textoFalta, type Obrigacao } from "./produtosVisita";

const MAX = 8;

export function ProdutosVisita({ S, A, run, d, simples }: Ctx & { d: Negocio; simples?: boolean }) {
  const K = useCatalogo();
  const v = d.visita, ro = v.fechada, prod = v.prod ?? [];
  const clienteFornece = d.f.materiais_cliente === "Sim";
  const sids = servicosVisita(d);
  const obr = obrigacoes(K, sids, v, clienteFornece);
  const [q, setQ] = useState("");
  const t = simples ? "text-[15px]" : "text-sm";
  const titulo = simples ? "text-base font-semibold" : "text-sm font-semibold";
  const nome = (sid: SvcId) => S.svc[sid]?.n ?? CATALOGO.find((c) => c.id === sid)?.n ?? sid;
  const escolhido = (id: string) => prod.some((p) => p.id === id);
  const validar = aValidar(d, "nec");

  const escolher = (pid: string, o?: Obrigacao) => run(() => {
    const p = K.produtos.find((x) => x.id === pid);
    if (!p) return;
    A.produto(d.id, p, qtdSugerida(K, p, sids, v.med));
    // escolher um produto para um serviço com pergunta por responder é dizer "não mantém"
    if (o?.pergunta && !v.manter?.[o.sid]) A.manter(d.id, o.sid, "nao");
  });

  const outros = useMemo(() => {
    const qq = normal(q.trim());
    return K.produtos.filter((p) => !CONSUMIVEIS.has(p.n) && (!qq || normal(p.n).includes(qq) || normal(caminho(K.arvore, p.no)).includes(qq)));
  }, [K, q]);

  return (
    <div className="max-w-3xl space-y-8">
      {/* O que os serviços obrigam */}
      {obr.length > 0 && (
        <section aria-labelledby={`obr-${d.id}`}>
          <h3 id={`obr-${d.id}`} className={titulo}>Os serviços que precisam de produto</h3>
          <ul className="mt-2 space-y-3">
            {obr.map((o) => {
              const resp = v.manter?.[o.sid];
              const mostraProdutos = !ro && (!o.pergunta || resp === "nao");
              return (
                <li key={o.sid} className={cn("rounded-2xl border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5", !o.cumprida && validar ? "border-destructive" : "border-border")}
                  aria-label={`${nome(o.sid)}: ${o.caminho}`}>
                  <p className={cn("font-medium text-foreground", t)}>{nome(o.sid)}</p>
                  <p className="text-sm text-muted-foreground">Produto de {o.caminho}</p>
                  {o.pergunta && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className={t} id={`perg-${o.sid}-${d.id}`}>{o.pergunta}</span>
                      <div role="group" aria-labelledby={`perg-${o.sid}-${d.id}`} className="flex gap-2">
                        {(["sim", "nao"] as const).map((r) => (
                          <button key={r} type="button" disabled={ro} aria-pressed={resp === r} onClick={() => run(() => A.manter(d.id, o.sid, resp === r ? null : r))}
                            className={cn("min-h-10 min-w-14 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-60",
                              resp === r ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40")}>
                            {r === "sim" ? "Sim" : "Não"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className={cn("mt-2 text-sm", o.cumprida ? "text-success" : "font-medium text-destructive")} aria-live="polite">
                    {o.estado === "mantem" ? "Reaproveita-se o que existe: não é preciso produto."
                      : o.estado === "produto" ? `Escolhido: ${o.por.join(", ")}`
                        : o.estado === "cliente" ? `O cliente compra: ${v.clienteCompra?.[o.sid]}`
                          : textoFalta(o, nome(o.sid))}
                  </p>
                  {mostraProdutos && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {produtosDoRamo(K, o.no, CONSUMIVEIS).map((p) => {
                        const ja = escolhido(p.id);
                        return (
                          <button key={p.id} type="button" aria-pressed={ja} onClick={() => (ja ? run(() => A.tirarProduto(d.id, p.id)) : escolher(p.id, o))}
                            className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                              ja ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:border-primary/60")}>
                            {ja && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{p.n}
                            <span className="tabular-nums opacity-80">· {eur(p.custo / (1 - 0.25))} €/{p.un}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* alternativa secundária: só quando o cliente fornece materiais */}
                  {mostraProdutos && clienteFornece && o.estado !== "produto" && (
                    <button type="button" aria-pressed={o.estado === "cliente"}
                      onClick={() => run(() => A.clienteCompra(d.id, o.sid, o.estado === "cliente" ? null : textoClienteCompra(o, nome(o.sid))))}
                      className="mt-2 min-h-10 text-sm font-medium text-primary underline-offset-4 hover:underline">
                      {o.estado === "cliente" ? "Afinal escolher do Catálogo" : "Ou: o cliente compra"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Os escolhidos */}
      <section aria-labelledby={`esc-${d.id}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={`esc-${d.id}`} className={titulo}>Produtos escolhidos</h3>
          <span className="text-sm text-muted-foreground">{prod.length ? `${prod.length} produto${prod.length > 1 ? "s" : ""}` : "nenhum ainda"}</span>
        </div>
        {prod.length > 0 ? (
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
            {prod.map((p) => (
              <li key={p.id} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-foreground", t)}>{p.n}</span>
                  <span className="block text-sm text-muted-foreground">
                    {caminho(K.arvore, p.no)}
                    {p.svc && <> · <Link2 className="inline h-3.5 w-3.5" aria-hidden="true" /> traz {nome(p.svc)} ({nfmt(p.q * (p.fator ?? 1))} {S.svc[p.svc]?.un ?? "un"})</>}
                  </span>
                </span>
                {ro ? <span className={t}>{nfmt(p.q)} {p.un}</span> : (
                  <span className="flex items-center gap-2">
                    <label htmlFor={`pq-${p.id}-${d.id}`} className="sr-only">Quantidade de {p.n}</label>
                    <input id={`pq-${p.id}-${d.id}`} key={p.id + p.q} type="number" min="0" step="any" inputMode="decimal" defaultValue={p.q}
                      className="h-10 w-20 rounded-lg border border-input bg-card px-2 text-right text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
                      onBlur={(e) => { const n = numero(e.target.value); if (!isNaN(n) && n !== p.q) run(() => A.produtoQtd(d.id, p.id, Math.max(0, n))); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                    <span className="w-8 text-sm text-muted-foreground">{p.un}</span>
                  </span>
                )}
                {clienteFornece && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!p.cliente} disabled={ro} className="h-4 w-4 accent-[hsl(var(--primary))]"
                      onChange={(e) => { const c = e.target.checked; run(() => A.produtoCliente(d.id, p.id, c)); }} />
                    o cliente fornece
                  </label>
                )}
                <span className={cn("w-24 text-right tabular-nums", t)}>{p.cliente ? "0,00 €" : eur(precoProduto(p)) + " €"}</span>
                {!ro && (
                  <button type="button" onClick={() => run(() => A.tirarProduto(d.id, p.id))} aria-label={`Retirar ${p.n}`}
                    className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={cn("mt-2 text-muted-foreground", t)}>Escolha acima os produtos que os serviços pedem, ou junte abaixo outros (espelho, acessórios…).</p>
        )}
      </section>

      {/* Outros produtos do Catálogo */}
      {!ro && (
        <section aria-labelledby={`out-${d.id}`} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h3 id={`out-${d.id}`} className={titulo}>Juntar outro produto do Catálogo</h3>
          <label className="relative mt-3 block">
            <span className="sr-only">Procurar produto</span>
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar: espelho, toalheiro, bancada…"
              className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
          </label>
          <ul className="mt-2 divide-y divide-border">
            {outros.slice(0, MAX).map((p) => {
              const ja = escolhido(p.id);
              return (
                <li key={p.id} className="flex min-h-14 items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-foreground", t)}>{p.n}</span>
                    <span className="block text-sm text-muted-foreground">{caminho(K.arvore, p.no)} · {eur(p.custo)} €/{p.un}{p.servico ? ` · traz ${nome(p.servico)}` : " · só o produto"}</span>
                  </span>
                  <button type="button" disabled={ja} onClick={() => escolher(p.id)}
                    className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                      ja ? "border-transparent text-success" : "border-input text-foreground hover:border-primary hover:text-primary")}>
                    {ja ? <><Check className="h-4 w-4" aria-hidden="true" />Escolhido</> : <><Plus className="h-4 w-4" aria-hidden="true" />Juntar</>}
                  </button>
                </li>
              );
            })}
            {!outros.length && <li className="py-3 text-[15px] text-muted-foreground">Nada no Catálogo com esse nome.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A etapa "Necessidades do cliente": os serviços e os produtos, numa só etapa, com as relações à vista. */
export function NecessidadesCliente(ctx: Ctx & { d: Negocio; simples?: boolean }) {
  const h = ctx.simples ? "text-xl font-semibold" : "text-base font-semibold";
  return (
    <div className="space-y-10">
      <section aria-labelledby={`nec-svc-${ctx.d.id}`}>
        <h3 id={`nec-svc-${ctx.d.id}`} className={cn(h, "mb-4")}>Serviços</h3>
        <ServicosCatalogo {...ctx} />
      </section>
      <section aria-labelledby={`nec-prod-${ctx.d.id}`} className="border-t border-border pt-8">
        <h3 id={`nec-prod-${ctx.d.id}`} className={cn(h, "mb-4")}>Produtos</h3>
        <ProdutosVisita {...ctx} />
      </section>
    </div>
  );
}
