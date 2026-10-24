// As linhas do orçamento (13/10/2026), nos dois modos: cada linha com o ícone do ofício, o nome, a quantidade,
// o preço (toca-se para o mudar: margem e total mudam logo), a margem numa pastilha colorida, uma barra fina
// com o peso da linha no custo e a origem (do modelo, do levantamento, produto, fornecido pelo cliente).
// Os serviços abrem o detalhe do custo, com a quantidade e o preço para mudar. Só antes de a proposta seguir.
import { useState } from "react";
import {
  Armchair, Boxes, ChevronRight, ClipboardList, Droplets, Flame, Grid3x3, Hammer, Minus, Package, Paintbrush, Plus, RotateCcw, UserRound, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATALOGO } from "./catalogo";
import { custoUnLinha, eur, linhaCalc, nfmt, pct, r2, type LinhaOrc, type Negocio } from "./motor";
import { numero, type Ctx } from "./pecas";
import { CustoServico } from "./CustoServico";
import { abrirFichaDepois } from "./fichaNav";
import { PREFIXO_LEV } from "./efeitosLevantamento";
import { PREFIXO_CLIENTE, PREFIXO_PROD, catalogoLigado } from "./produtosVisita";
import { LINHA_DEMOLICAO, resumoDemolicao } from "./entulho";
import { DemolicaoOrcamento } from "./DemolicaoOrcamento";

/** O ícone do ofício de um serviço (pelo ofício do Catálogo ou pelo perfil do técnico). */
export function iconeOficio(txt: string): LucideIcon {
  const t = txt.toLowerCase();
  if (/demol/.test(t)) return Hammer;
  if (/canaliz/.test(t)) return Droplets;
  if (/eletric/.test(t)) return Zap;
  if (/pint/.test(t)) return Paintbrush;
  if (/revest|ladrilh|pavim/.test(t)) return Grid3x3;
  if (/carpint|montador|móve|move/.test(t)) return Armchair;
  if (/gás|gas/.test(t)) return Flame;
  return Wrench;
}
export type Origem = "modelo" | "levantamento" | "produto" | "cliente" | "servico" | "demolicao";
export function origemLinha(l: LinhaOrc): Origem {
  if (l.t === "svc") return "servico";
  if (l.d === LINHA_DEMOLICAO) return "demolicao";
  if (l.d.startsWith(PREFIXO_PROD)) return "produto";
  if (l.d.startsWith(PREFIXO_CLIENTE)) return "cliente";
  if (l.d.startsWith(PREFIXO_LEV)) return "levantamento";
  return "modelo";
}
const ORIGEM: Record<Origem, { t: string; ic: LucideIcon; cls: string }> = {
  servico: { t: "serviço", ic: Wrench, cls: "bg-primary/10 text-primary" },
  modelo: { t: "do modelo", ic: Boxes, cls: "bg-muted text-muted-foreground" },
  levantamento: { t: "do levantamento", ic: ClipboardList, cls: "bg-info/10 text-info" },
  produto: { t: "produto", ic: Package, cls: "bg-accent/15 text-foreground" },
  cliente: { t: "fornecido pelo cliente", ic: UserRound, cls: "bg-success/10 text-success" },
  demolicao: { t: "demolição e entulho", ic: Hammer, cls: "bg-warning/15 text-warning" },
};

export function LinhasOrcamento({ ctx, d, simples }: { ctx: Pick<Ctx, "S" | "A" | "run" | "go">; d: Negocio; simples?: boolean }) {
  const { S, A, run, go } = ctx;
  const o = d.orc!, fechado = !!o.enviada;
  const min = S.cfg.min / 100, alvo = S.cfg.alvo / 100;
  const [aberta, setAberta] = useState<number | null>(null);
  const [editar, setEditar] = useState<number | null>(null);
  const custoTotal = o.linhas.reduce((a, l) => a + linhaCalc(l, S).custo, 0) || 1;
  const direcao = S.role === "direcao";
  const t = simples ? "text-[15px]" : "text-sm";

  return (
    <>
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]" aria-label="Linhas do orçamento">
      {o.linhas.map((l, i) => {
        const x = linhaCalc(l, S), m = x.preco > 0 ? (x.preco - x.custo) / x.preco : 0;
        const cor = x.preco <= 0 ? "bg-muted text-muted-foreground" : m < min ? "bg-destructive/10 text-destructive" : m < alvo - 0.005 ? "bg-warning/15 text-warning" : "bg-success/10 text-success";
        const origem = origemLinha(l), O = ORIGEM[origem];
        const nome = l.t === "svc" ? x.s!.n : l.d.replace(/^(Produto · |Fornecido pelo cliente · |Levantamento · )/, "");
        const Ic = l.t === "svc" ? iconeOficio(CATALOGO.find((c) => c.id === l.sid)?.cat ?? x.s!.perfil) : O.ic;
        const dem = origem === "demolicao", veCusto = !dem || direcao; // o custo da demolição só a Direção o vê
        const sub = l.t === "svc" ? `${nfmt(l.q)} ${x.s!.un} × ${eur(l.pu)} €` : origem === "modelo" ? "estimativa dos materiais do modelo" : dem && o.demolicao?.r ? resumoDemolicao(o.demolicao.r) : "";
        const ajustado = l.t === "mat" && o.precosMan?.[l.d] != null;
        const valorEditar = l.t === "svc" ? l.pu : l.preco;
        const s = l.t === "svc" ? x.s! : null, novo = s && l.t === "svc" ? custoUnLinha(s, S) : 0, mud = !!s && !fechado && l.t === "svc" && Math.abs(novo - l.cu) > 0.004;
        return (
          <li key={i} className="px-3 py-3 sm:px-4">
            <div className="flex items-start gap-3">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", l.t === "svc" ? "bg-primary/10 text-primary" : O.cls)} aria-hidden="true"><Ic className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium leading-snug text-foreground", t)}>{nome}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {sub && <span className="tabular-nums">{sub}</span>}
                  {l.t === "mat" && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", O.cls)}>{O.t}</span>}
                  {ajustado && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">preço ajustado</span>}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {editar === i && !fechado ? (
                  <label className="flex items-center gap-1">
                    <span className="sr-only">{l.t === "svc" ? `Preço por ${s!.un} de ${nome}` : `Preço de ${nome}`}</span>
                    <input autoFocus type="number" inputMode="decimal" step="0.01" min="0" defaultValue={valorEditar}
                      className="h-10 w-28 rounded-lg border border-primary bg-card px-2 text-right text-[15px] outline-none ring-2 ring-primary/25"
                      onBlur={(e) => { const n = numero(e.target.value); setEditar(null); if (!isNaN(n) && n >= 0 && n !== valorEditar) run(() => A.precoLinha(d.id, i, n)); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditar(null); }} />
                    <span className="text-sm text-muted-foreground">€{l.t === "svc" ? `/${s!.un}` : ""}</span>
                  </label>
                ) : (
                  <button type="button" disabled={fechado} onClick={() => setEditar(i)} title={fechado ? undefined : "Mudar o preço"}
                    aria-label={`${nome}: ${eur(x.preco)} €. ${fechado ? "" : "Mudar o preço"}`}
                    className={cn("rounded-lg px-1.5 py-0.5 text-right font-semibold tabular-nums transition-colors", t, !fechado && "underline decoration-dotted underline-offset-4 hover:bg-muted")}>
                    {eur(x.preco)} €
                  </button>
                )}
                {veCusto && <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", cor)}>{x.preco > 0 ? `margem ${pct(m)}` : "sem preço"}</span>}
              </div>
              {(l.t === "svc" || dem) && (
                <button type="button" onClick={() => setAberta(aberta === i && dem ? null : i)} aria-haspopup={dem ? undefined : "dialog"} aria-expanded={dem ? aberta === i : undefined} aria-label={`Detalhe de ${nome}`}
                  className="grid h-10 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            {/* o peso da linha no custo total */}
            {veCusto && <div className="ml-[52px] mt-2 flex items-center gap-2">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="block h-full rounded-full bg-primary/50" style={{ width: `${Math.min(100, (x.custo / custoTotal) * 100)}%` }} />
              </span>
              <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">custo {eur(x.custo)} €</span>
            </div>}
            {dem && aberta === i && <DemolicaoOrcamento S={S} A={A} run={run} d={d} />}
            {ajustado && !fechado && (
              <button type="button" onClick={() => run(() => A.reporPreco(d.id, i))} className="ml-[52px] mt-1 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Repor o preço calculado
              </button>
            )}
            {aberta === i && l.t === "svc" && s && (
              <CustoServico S={S} sid={l.sid} s={s} q={l.q} pu={l.pu} onClose={() => setAberta(null)}>
                {!fechado && <section className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
                  <h3 className="text-[15px] font-semibold sm:col-span-2">Mudar nesta linha</h3>
                  <div className="grid gap-2">
                    <span className="text-sm font-medium" id={`q-${d.id}-${i}`}>Quantidade ({s.un})</span>
                    <div role="group" aria-labelledby={`q-${d.id}-${i}`} className="inline-flex w-fit items-center rounded-lg border border-input bg-card p-0.5">
                      <button type="button" aria-label="Menos" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted" onClick={() => run(() => A.qtdLinha(d.id, i, Math.max(0, r2(l.q - 1))))}><Minus className="h-4 w-4" /></button>
                      <output className="w-16 text-center text-[17px] font-medium tabular-nums">{nfmt(l.q)}</output>
                      <button type="button" aria-label="Mais" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted" onClick={() => run(() => A.qtdLinha(d.id, i, r2(l.q + 1)))}><Plus className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Preço por {s.un}</span>
                    <span className="flex items-center gap-2">
                      <input key={l.pu} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={l.pu}
                        className="h-11 w-32 rounded-lg border border-input bg-card px-3 text-right text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
                        onBlur={(e) => { const n = numero(e.target.value); if (!isNaN(n) && n >= 0 && n !== l.pu) run(() => A.precoLinha(d.id, i, n)); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                      <span className="text-[15px] text-muted-foreground">€</span>
                    </span>
                  </label>
                  <p className="text-sm text-muted-foreground sm:col-span-2">
                    Custo do Catálogo: {eur(l.cu)} €/{s.un} ({s.perfil}, {nfmt(s.h)} h/{s.un}). Para o alvo de {S.cfg.alvo}%: {eur(r2(l.cu / (1 - alvo)))} €/{s.un}.
                  </p>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <Button variant="outline" onClick={() => run(() => A.precoLinha(d.id, i, r2(l.cu / (1 - alvo))))}>Usar o preço do alvo</Button>
                    {mud && <Button variant="outline" onClick={go(() => A.recalc(d.id, i))}>O Catálogo mudou: usar {eur(novo)} €</Button>}
                  </div>
                </section>}
                {/* a ficha do serviço (Catálogo): medida, quem faz, equipamentos, consumíveis e preço */}
                <Button variant="outline" className="min-h-11 justify-self-start text-[15px]" onClick={() => { abrirFichaDepois(l.sid); setAberta(null); run(() => A.nav("catalogo")); }}>
                  Abrir a ficha do serviço
                </Button>
              </CustoServico>
            )}
          </li>
        );
      })}
    </ul>
    {/* a demolição e entulho: nos orçamentos novos já vem ligada; nos outros liga-se aqui */}
    {!fechado && catalogoLigado() && (
      // um interruptor com o estado à vista (antes era uma ligação que trocava de texto)
      <button type="button" role="switch" aria-checked={!!o.demolicao} onClick={() => run(() => A.demolicaoLigar(d.id, !o.demolicao))}
        className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary">
        <Hammer className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">Calcular a demolição e o entulho</span>
          <span className="block text-sm text-muted-foreground">{o.demolicao ? "Numa só linha, com o custo do Catálogo" : "Desligado: a demolição não entra no orçamento"}</span>
        </span>
        <span aria-hidden="true" className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", o.demolicao ? "bg-primary" : "bg-input")}>
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", o.demolicao ? "left-[22px]" : "left-0.5")} />
        </span>
      </button>
    )}
    </>
  );
}
