// As linhas do orçamento (13/10/2026), nos dois modos: cada linha com o ícone do ofício, o nome, a quantidade,
// o preço (toca-se para o mudar: margem e total mudam logo), a margem numa pastilha colorida, uma barra fina
// com o peso da linha no custo e a origem (do modelo, do levantamento, produto, fornecido pelo cliente).
// Os serviços abrem o detalhe do custo, com a quantidade e o preço para mudar. Só antes de a proposta seguir.
import { useState } from "react";
import {
  Armchair, Boxes, ChevronDown, ChevronRight, Search, ClipboardList, PenLine, Trash2, Droplets, Flame, Grid3x3, Hammer, Minus, Package, Paintbrush, Plus, RotateCcw, UserRound, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATALOGO } from "./catalogo";
import { custoUnLinha, eur, ivaDaLinha, linhaCalc, nfmt, pct, r2, type LinhaOrc, type Negocio } from "./motor";
import { LinhaLivre } from "./LinhaLivre";
import { ZonaDaLinha, ZonasDaObra } from "./ZonasDaObra";
import { numero, type Ctx } from "./pecas";
import { CustoServico } from "./CustoServico";
import { abrirFichaDepois } from "./fichaNav";
import { PREFIXO_LEV } from "./efeitosLevantamento";
import { PREFIXO_CLIENTE, PREFIXO_PROD, catalogoLigado } from "./produtosVisita";
import { LINHA_DEMOLICAO, resumoDemolicao } from "./entulho";
import { DemolicaoOrcamento } from "./DemolicaoOrcamento";
import { custosDe, receitaDe, subempreitadaSemCusto } from "./v2/custosModelo";
import { useLargura } from "./largura";

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
export type Origem = "modelo" | "levantamento" | "produto" | "cliente" | "servico" | "demolicao" | "livre";
export function origemLinha(l: LinhaOrc): Origem {
  if (l.t === "svc") return "servico";
  if (l.livre) return "livre";
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
  livre: { t: "linha livre", ic: PenLine, cls: "bg-muted text-foreground" },
};

/** 27/10: a caixa para mudar o preço de uma linha, numa só fila (não empurra a lista): o "€/m²" ao lado diz o que se escreve
 *  ("Preço por m²" ou "Valor da linha" fica no aria-label) e o total da linha com o valor escrito vai no title.
 *  Grava ao sair (Enter ou Tab); Escape fecha sem gravar. */
function EditarPreco({ nome, un, q, valor, gravar, fechar }: { nome: string; un: string | null; q: number; valor: number; gravar: (n: number) => void; fechar: () => void }) {
  const [txt, setTxt] = useState(String(valor));
  const n = numero(txt), ok = !isNaN(n) && n >= 0;
  return (
    <span className="flex items-center gap-1">
      <input autoFocus type="number" inputMode="decimal" step="0.01" min="0" value={txt} onChange={(e) => setTxt(e.target.value)}
        aria-label={`${un ? `Preço por ${un}` : "Valor da linha"} de ${nome}`}
        title={un ? `${nfmt(q)} ${un} = ${ok ? eur(r2(n * q)) : "…"} €` : undefined}
        className="h-10 w-28 rounded-lg border border-primary bg-card px-2 text-right text-[15px] outline-none ring-2 ring-primary/25"
        onBlur={() => { fechar(); if (ok && n !== valor) gravar(n); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setTxt(String(valor)); fechar(); } }} />
      <span className="text-sm text-muted-foreground" aria-hidden="true">{un ? `€/${un}` : "€"}</span>
    </span>
  );
}

export function LinhasOrcamento({ ctx, d, simples }: { ctx: Pick<Ctx, "S" | "A" | "run" | "go">; d: Negocio; simples?: boolean }) {
  const { S, A, run, go } = ctx;
  const o = d.orc!, fechado = !!o.enviada;
  const min = S.cfg.min / 100, alvo = S.cfg.alvo / 100;
  const [aberta, setAberta] = useState<number | null>(null);
  const [editar, setEditar] = useState<number | null>(null);
  const custoTotal = o.linhas.reduce((a, l) => a + linhaCalc(l, S).custo, 0) || 1;
  const direcao = S.role === "direcao";
  const t = simples ? "text-[15px]" : "text-sm";
  // 27/10: com muitas linhas a lista não acabava. No computador (largura de tabela) cada linha ocupa uma fila: o nome, a quantidade,
  // a zona, o preço, a margem e o custo lado a lado. Com mais de 8 linhas há procura, filtros e os grupos (serviços, materiais)
  // fecham-se, com o subtotal à vista.
  const [caixa, largura] = useLargura<HTMLDivElement>(0);
  const tabela = largura >= 760;
  const [procura, setProcura] = useState("");
  const [filtro, setFiltro] = useState<string>("todas");
  const [fechado_, setFechado] = useState<Record<string, boolean>>({});
  const muitas = o.linhas.length > 8;
  const nomeDe = (l: LinhaOrc) => (l.t === "svc" ? S.svc[l.sid]?.n ?? l.sid : l.d.replace(/^(Produto · |Fornecido pelo cliente · |Levantamento · )/, ""));
  const margemBaixa = (l: LinhaOrc) => { const x = linhaCalc(l, S); return x.preco > 0 && (x.preco - x.custo) / x.preco < min; };
  const semAcento = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const zonas = o.zonas ?? [];
  const FILTROS: { k: string; t: string; vale: (l: LinhaOrc) => boolean }[] = [
    { k: "todas", t: "Todas", vale: () => true },
    { k: "svc", t: "Serviços", vale: (l) => l.t === "svc" },
    { k: "mat", t: "Materiais e produtos", vale: (l) => l.t === "mat" },
    { k: "margem", t: "Margem abaixo do mínimo", vale: margemBaixa },
    ...zonas.map((z) => ({ k: "zona:" + z, t: z, vale: (l: LinhaOrc) => !!l.zonas?.some((x) => x.z === z) })),
  ];
  const vale = (FILTROS.find((f) => f.k === filtro) ?? FILTROS[0]).vale;
  const q = semAcento(procura.trim());
  const visiveis = o.linhas.map((l, i) => ({ l, i })).filter(({ l }) => vale(l) && (!q || semAcento(nomeDe(l)).includes(q))).map(({ i }) => i);
  const GRUPOS = muitas
    ? [{ k: "svc", t: "Serviços", idx: visiveis.filter((i) => o.linhas[i].t === "svc") }, { k: "mat", t: "Materiais e produtos", idx: visiveis.filter((i) => o.linhas[i].t === "mat") }].filter((g) => g.idx.length)
    : [{ k: "todas", t: "", idx: visiveis }];

  return (
    <>
    <ZonasDaObra ctx={ctx} d={d} />
    <div ref={caixa} className="space-y-3">
    {muitas && (
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-52 flex-1 sm:max-w-xs">
          <span className="sr-only">Procurar uma linha</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={procura} onChange={(e) => setProcura(e.target.value)} placeholder="Procurar uma linha"
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </label>
        <div role="group" aria-label="Mostrar" className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const n = o.linhas.filter(f.vale).length;
            if (f.k !== "todas" && !n) return null;
            const on = filtro === f.k;
            return (
              <button key={f.k} type="button" aria-pressed={on} onClick={() => setFiltro(on && f.k !== "todas" ? "todas" : f.k)}
                className={cn("min-h-9 whitespace-nowrap rounded-full border px-3 text-sm transition-colors",
                  on ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-card hover:border-foreground/40",
                  f.k === "margem" && !on && "text-destructive")}>
                {f.t} <span className="tabular-nums text-muted-foreground">{n}</span>
              </button>
            );
          })}
        </div>
      </div>
    )}
    {!visiveis.length && (
      <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-[15px] text-muted-foreground">
        Nenhuma linha com {procura.trim() ? `"${procura.trim()}"` : "este filtro"}.{" "}
        <button type="button" onClick={() => { setProcura(""); setFiltro("todas"); }} className="font-medium text-primary underline-offset-4 hover:underline">Ver todas</button>
      </p>
    )}
    {GRUPOS.map((g) => {
      const fechadoG = !!fechado_[g.k] && !q && filtro === "todas";
      const soma = g.idx.reduce((a, i) => a + linhaCalc(o.linhas[i], S).preco, 0);
      return (
      <section key={g.k} id={`grupo-${d.id}-${g.k}`} aria-label={g.t || "Linhas do orçamento"} className={cn(g.t && "scroll-mt-2 pt-3 first:pt-0")}>
        {/* 27/10 (Rúben): o título do grupo destacado: faixa roxa clara, nome maior, o número de linhas numa pastilha e o total à direita.
            Fica fixo no cimo enquanto se percorre o grupo (só dentro do seu grupo), para se fechar sem voltar para cima; ao fechar a meio,
            a página volta ao título. O fundo opaco por baixo da faixa não deixa ver as linhas que passam por trás. */}
        {g.t && (
          <h3 className="sticky top-0 z-10 -mx-1 mb-2 bg-background px-1 py-1">
            <button type="button" aria-expanded={!fechadoG}
              onClick={(e) => {
                const sec = e.currentTarget.closest("section");
                setFechado((x) => ({ ...x, [g.k]: !fechadoG }));
                // fechou com o título fixo (o início do grupo ficou para cima): volta ao título, para não ficar a meio do nada
                if (!fechadoG && sec && sec.getBoundingClientRect().top < 0) {
                  const suave = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
                  requestAnimationFrame(() => sec.scrollIntoView({ block: "start", behavior: suave ? "smooth" : "auto" }));
                }
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl border-l-4 border-primary bg-primary/[0.07] px-3 py-2 text-left shadow-[var(--shadow-sm)] transition-colors hover:bg-primary/[0.11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <ChevronDown className={cn("h-5 w-5 shrink-0 text-primary motion-safe:transition-transform", fechadoG && "-rotate-90")} aria-hidden="true" />
              <span className="text-lg font-semibold tracking-tight text-foreground">{g.t}</span>
              <span className="rounded-full bg-card px-2 py-0.5 text-sm font-medium tabular-nums text-muted-foreground">{g.idx.length} {g.idx.length === 1 ? "linha" : "linhas"}</span>
              <span className="ml-auto text-lg font-semibold tabular-nums text-foreground">{eur(soma)} €</span>
            </button>
          </h3>
        )}
        {!fechadoG && (
        // 27/10 (Rúben): cada linha num cartão, com um pequeno espaço entre eles (antes, uma caixa só com divisórias)
        <ul className={tabela ? "space-y-1.5" : "space-y-2"} aria-label={g.t ? `Linhas: ${g.t}` : "Linhas do orçamento"}>
          {tabela && (
            <li aria-hidden="true" className="flex items-center gap-3 px-4 pb-0.5 pt-1 text-xs font-medium text-muted-foreground">
              <span className="w-8 shrink-0" />
              <span className="min-w-0 flex-1">Linha e quantidade</span>
              {zonas.length > 0 && <span className="w-40 shrink-0">Zona</span>}
              <span className="w-28 shrink-0 text-right">Total da linha</span>
              <span className="w-20 shrink-0 text-center">Margem</span>
              <span className="w-32 shrink-0 text-right">Custo</span>
              <span className="w-8 shrink-0" />
            </li>
          )}
      {g.idx.map((i) => {
        const l = o.linhas[i];
        const x = linhaCalc(l, S), m = x.preco > 0 ? (x.preco - x.custo) / x.preco : 0;
        const cor = x.preco <= 0 ? "bg-muted text-muted-foreground" : m < min ? "bg-destructive/10 text-destructive" : m < alvo - 0.005 ? "bg-warning/15 text-warning" : "bg-success/10 text-success";
        const origem = origemLinha(l), O = ORIGEM[origem];
        const nome = l.t === "svc" ? x.s!.n : l.d.replace(/^(Produto · |Fornecido pelo cliente · |Levantamento · )/, "");
        const Ic = l.t === "svc" ? iconeOficio(CATALOGO.find((c) => c.id === l.sid)?.cat ?? x.s!.perfil) : O.ic;
        const dem = origem === "demolicao", veCusto = !dem || direcao; // o custo da demolição só a Direção o vê
        const sub = l.t === "svc" ? `${nfmt(l.q)} ${x.s!.un} × ${eur(l.pu)} €` : l.livre ? `${nfmt(l.livre.q)} ${l.livre.un} × ${eur(l.livre.pu)} €` : origem === "modelo" ? "estimativa dos materiais do modelo" : dem && o.demolicao?.r ? resumoDemolicao(o.demolicao.r) : "";
        const ajustado = l.t === "mat" && o.precosMan?.[l.d] != null;
        const zonaTxt = !tabela && fechado && l.zonas?.length ? (l.zonas.length === 1 ? l.zonas[0].z : l.zonas.map((z) => `${z.z} ${nfmt(z.q)}`).join(", ")) : "";
        // 27/10 (Rúben): a caixa dizia o preço por unidade por baixo de um valor que é o total da linha (2 121,00 € abria 106,05).
        // Agora diz o que é: o preço por unidade (com a unidade) nos serviços e nas linhas livres; o valor da linha nas outras.
        const unEditar = l.t === "svc" ? x.s!.un : l.t === "mat" && l.livre ? l.livre.un : null;
        const qEditar = l.t === "svc" ? l.q : l.t === "mat" && l.livre ? l.livre.q : 1;
        const valorEditar = l.t === "svc" ? l.pu : l.t === "mat" && l.livre ? l.livre.pu : l.preco;
        const s = l.t === "svc" ? x.s! : null, novo = s && l.t === "svc" ? custoUnLinha(s, S) : 0, mud = !!s && !fechado && l.t === "svc" && !l.cuMan && Math.abs(novo - l.cu) > 0.004;
        // 26/10: uma subempreitada (receita sem passos, a 0 €) tem o custo escrito na linha: o que o subempreiteiro pediu para esta obra
        const subemp = !!s && l.t === "svc" && (!!l.cuMan || subempreitadaSemCusto(receitaDe(custosDe(S), l.sid, s, S.cfg.alvo) ?? { origem: "estimada", mo: [], equip: [], cons: [] }));
        return (
          <li key={i} className={cn("rounded-xl border border-border bg-card px-3 shadow-[var(--shadow-sm)] transition-colors hover:border-primary/40 sm:px-4", tabela ? "py-2" : "py-3")}>
            <div className={cn("flex gap-3", tabela ? "flex-wrap items-center" : "items-start")}>
              <span className={cn("grid shrink-0 place-items-center rounded-xl", tabela ? "h-8 w-8" : "h-10 w-10", l.t === "svc" ? "bg-primary/10 text-primary" : O.cls)} aria-hidden="true"><Ic className={tabela ? "h-4 w-4" : "h-5 w-5"} /></span>
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium leading-snug text-foreground", t)}>{nome}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {/* 27/10: a zona no mesmo texto da quantidade (era uma linha à parte); uma zona só diz o nome, várias dizem as quantidades */}
                  {(sub || zonaTxt) && <span className="tabular-nums">{[sub, zonaTxt].filter(Boolean).join(" · ")}</span>}
                  {l.t === "mat" && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", O.cls)}>{O.t}</span>}
                  {ajustado && !(l.t === "mat" && l.livre) && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">preço ajustado</span>}
                  {/* 26/10: a taxa de IVA à vista quando não é a de sempre (ou numa linha livre) */}
                  {(l.iva || (l.t === "mat" && l.livre) || ivaDaLinha(l, S) !== (l.t === "mat" ? 23 : 6)) && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">IVA {ivaDaLinha(l, S)}%</span>}
                </p>
              </div>
              {tabela && zonas.length > 0 && <ZonaDaLinha ctx={ctx} d={d} i={i} nome={nome} compacto />}
              <div className={cn("flex shrink-0", tabela ? "items-center gap-3" : "flex-col items-end gap-1")}>
                {editar === i && !fechado ? (
                  <EditarPreco nome={nome} un={unEditar} q={qEditar} valor={valorEditar} fechar={() => setEditar(null)}
                    gravar={(n) => run(() => A.precoLinha(d.id, i, l.t === "mat" && l.livre ? r2(n * l.livre.q) : n))} />
                ) : (
                  <button type="button" disabled={fechado} onClick={() => setEditar(i)} title={fechado ? undefined : "Mudar o preço"}
                    aria-label={`${nome}: ${eur(x.preco)} €. ${fechado ? "" : "Mudar o preço"}`}
                    className={cn("rounded-lg px-1.5 py-0.5 text-right font-semibold tabular-nums transition-colors", t, tabela && "w-28", !fechado && "underline decoration-dotted underline-offset-4 hover:bg-muted")}>
                    {eur(x.preco)} €
                  </button>
                )}
                {/* 27/10: uma subempreitada sem o custo do subempreiteiro não tem margem (dizia 100%) */}
                {veCusto ? <span title={`custo ${eur(x.custo)} €`} className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", tabela && "w-20 text-center", subemp && !(x.custo > 0) ? "bg-warning/15 text-warning" : cor)}>{x.preco > 0 ? (subemp && !(x.custo > 0) ? "sem custo" : `${tabela ? "" : "margem "}${pct(m)}`) : "sem preço"}</span>
                  : tabela && <span className="w-20" />}
              </div>
              {tabela && (
                <span className="flex w-32 shrink-0 items-center justify-end gap-2" title={veCusto ? `custo ${eur(x.custo)} €` : undefined}>
                  {veCusto && <>
                    <span className="h-1 w-8 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <span className="block h-full rounded-full bg-primary/50" style={{ width: `${Math.min(100, (x.custo / custoTotal) * 100 * 3)}%` }} />
                    </span>
                    <span className="text-sm tabular-nums text-muted-foreground">{eur(x.custo)} €</span>
                  </>}
                </span>
              )}
              {tabela && !(l.t === "svc" || dem) && <span className="w-8 shrink-0" />}
              {(l.t === "svc" || dem) && (
                <button type="button" onClick={() => setAberta(aberta === i && dem ? null : i)} aria-haspopup={dem ? undefined : "dialog"} aria-expanded={dem ? aberta === i : undefined} aria-label={`Detalhe de ${nome}`}
                  className="grid h-10 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            {dem && aberta === i && <DemolicaoOrcamento S={S} A={A} run={run} d={d} />}
            {/* com a proposta enviada, a zona vai na linha da quantidade (acima); antes, a escolha da zona */}
            {!tabela && !fechado && <ZonaDaLinha ctx={ctx} d={d} i={i} nome={nome} />}
            {l.t === "mat" && l.livre && !fechado && (
              <button type="button" onClick={() => run(() => A.tirarLinha(d.id, i))} aria-label={`Tirar a linha ${nome}`} className="ml-[52px] mt-1 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-destructive">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Tirar a linha
              </button>
            )}
            {ajustado && !fechado && !(l.t === "mat" && l.livre) && (
              <button type="button" onClick={() => run(() => A.reporPreco(d.id, i))} className="ml-[52px] mt-1 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Repor o preço calculado
              </button>
            )}
            {aberta === i && l.t === "svc" && s && (
              <CustoServico S={S} sid={l.sid} s={s} q={l.q} pu={l.pu} det={l.det} onClose={() => setAberta(null)}>
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
                  {subemp && (
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Custo do subempreiteiro por {s.un}</span>
                      <span className="flex items-center gap-2">
                        <input key={l.cu} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={l.cu || ""} placeholder="0,00"
                          className="h-11 w-32 rounded-lg border border-input bg-card px-3 text-right text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
                          onBlur={(e) => { const n = numero(e.target.value); if (!isNaN(n) && n >= 0 && n !== l.cu) run(() => A.custoLinha(d.id, i, n)); }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                        <span className="text-[15px] text-muted-foreground">€</span>
                      </span>
                    </label>
                  )}
                  <fieldset className="sm:col-span-2">
                    <legend className="text-sm font-medium">IVA desta linha</legend>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {([6, 23] as const).map((v) => (
                        <button key={v} type="button" aria-pressed={ivaDaLinha(l, S) === v} onClick={() => run(() => A.ivaLinha(d.id, i, v))}
                          className={cn("min-h-11 rounded-lg border px-3 text-[15px]", ivaDaLinha(l, S) === v ? "border-primary bg-primary/10 font-medium" : "border-input bg-card hover:bg-muted")}>{v}%</button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    {l.cu > 0 && <Button variant="outline" onClick={() => run(() => A.precoLinha(d.id, i, r2(l.cu / (1 - alvo))))}>Usar {eur(r2(l.cu / (1 - alvo)))} € (alvo {S.cfg.alvo}%)</Button>}
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
        )}
      </section>
      );
    })}
    </div>
    <LinhaLivre ctx={ctx} d={d} />
    {/* a demolição e entulho: nos orçamentos novos já vem ligada; nos outros liga-se aqui */}
    {!fechado && catalogoLigado() && (
      // um interruptor com o estado à vista (antes era uma ligação que trocava de texto)
      <button type="button" role="switch" aria-checked={!!o.demolicao} onClick={() => run(() => A.demolicaoLigar(d.id, !o.demolicao))}
        className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary">
        <Hammer className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">Calcular a demolição e o entulho</span>
          {o.demolicao && <span className="block text-sm text-muted-foreground">Numa só linha, com o custo do Catálogo</span>}
        </span>
        <span aria-hidden="true" className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", o.demolicao ? "bg-primary" : "bg-input")}>
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]", o.demolicao ? "left-[22px]" : "left-0.5")} />
        </span>
      </button>
    )}
    </>
  );
}
