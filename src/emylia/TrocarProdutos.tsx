// Os produtos e os materiais da versão nova da proposta (21/10/2026), sem listas de texto:
// · Os produtos escolhidos são cartões com a ilustração, a marca, a quantidade (− 1 +) e o preço; cada um com "Trocar"
//   (abre o Catálogo no mesmo ramo, com a diferença de preço em cada cartão) e "Tirar". O que mudou desde a versão anterior
//   tem selo ("Novo", "Trocado · era …"); o que se tirou fica numa fila discreta com "Repor".
// · A estimativa de materiais do modelo aparece pelas suas partes (móveis e bancada, cerâmico, pavimento…): cada parte com
//   "Escolher no Catálogo" (o produto escolhido cobre a parte e ela desce sozinha) e "Tirar" / "Repor".
// · "Juntar um produto" abre o Catálogo inteiro, com pesquisa e categorias.
// Cada mudança refaz o orçamento (A.refazerOrcamento); o preço mudado à mão da estimativa deixa de valer, porque ela mudou.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRightLeft, Check, Link2, Plus, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { LINHAS, eur, nfmt, type Negocio, type VersaoProposta } from "./motor";
import type { Ctx } from "./pecas";
import { useCatalogo } from "./v2/catalogoStore";
import type { Catalogo, Produto } from "./v2/catalogoModelo";
import { CONSUMIVEIS } from "./equipamentosCliente";
import { ContadorQtd } from "./ContadorQtd";
import { Ilustracao, ilustracaoDe, type IlustracaoKey } from "./ilustracoes";
import { categoriaDe, categorias, filtrarProdutos, ilustracaoDoCatalogo } from "./necessidades";
import { nosAbaixo, partesDoModelo, precoProduto, precoUnitario, qtdSugerida, type ParteEstimativa, type ProdVisita } from "./produtosVisita";
import { MOLA, useReduzir } from "./movimento";
import { servicosVisita } from "./motor";

const PAGINA = 12;
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const imgDe = (K: Catalogo, p: ProdVisita | Produto): IlustracaoKey => {
  const doCat = K.produtos.find((x) => x.id === p.id);
  return doCat ? ilustracaoDoCatalogo(K.arvore, doCat) : ilustracaoDe(p.n);
};

/** Onde procurar o substituto: o ramo da parte do modelo que o produto cobre (uma bancada → móveis e bancada); senão o nó
 *  do produto, subindo um nível só quando ele tem poucos irmãos (uma troca precisa de por onde escolher). */
function raizDaTroca(K: Catalogo, p: ProdVisita, partes: ParteEstimativa[]): string | null {
  if (!p.no) return null;
  const daParte = partes.find((pt) => pt.nos?.has(p.no!));
  if (daParte?.raiz) return daParte.raiz;
  const no = K.arvore.find((x) => x.id === p.no);
  if (!no) return null;
  const n = (id: string) => { const nos = nosAbaixo(K.arvore, id); return K.produtos.filter((x) => x.no && nos.has(x.no)).length; };
  return n(no.id) < 4 && no.pai ? no.pai : no.id;
}

/** O que a janela do Catálogo está a fazer: trocar um produto, escolher para uma parte do modelo, ou juntar. */
type Janela = { k: "trocar"; p: ProdVisita; raiz: string | null } | { k: "parte"; parte: ParteEstimativa } | { k: "juntar" } | null;

export function ProdutosDaVersao({ ctx, d, ant }: { ctx: Ctx; d: Negocio; ant: VersaoProposta }) {
  const { A, run } = ctx;
  const K = useCatalogo();
  const o = d.orc!, v = d.visita, prods = v.prod ?? [], L = LINHAS[d.linha];
  const [janela, setJanela] = useState<Janela>(null);
  const mudar = (fn: () => void) => run(() => { fn(); if (o.precosMan) delete o.precosMan[L.mat.d]; A.refazerOrcamento(d.id); });

  // o que mudou desde a versão anterior (as versões de antes de 21/10 não guardam os produtos: sem selos)
  const antes = ant.prod;
  const idsAgora = new Set(prods.map((p) => p.id)), idsAntes = new Set((antes ?? []).map((p) => p.id));
  const saidos = (antes ?? []).filter((p) => !idsAgora.has(p.id));
  const trocadoDe = new Map<string, ProdVisita>();
  for (const p of prods) {
    if (!antes || idsAntes.has(p.id)) continue;
    const era = saidos.find((s) => s.no && s.no === p.no && ![...trocadoDe.values()].includes(s));
    if (era) trocadoDe.set(p.id, era);
  }
  const retirados = saidos.filter((s) => ![...trocadoDe.values()].includes(s));

  // as partes da estimativa do modelo, com o preço na escala da linha que está no orçamento (o preço pode ter sido mudado)
  const partes = partesDoModelo(L.mat, prods, v.manter, v.semParte, K.arvore);
  const linhaMat = o.linhas.find((l) => l.t === "mat" && l.d === L.mat.d);
  const somaPartes = partes.reduce((a, p) => a + p.preco, 0);
  const escala = linhaMat && linhaMat.t === "mat" && somaPartes > 0 ? linhaMat.preco / somaPartes : 1;

  const escolher = (p: Produto) => {
    const j = janela;
    if (!j) return;
    if (j.k === "trocar") mudar(() => A.trocarProduto(d.id, j.p.id, p));
    else mudar(() => A.produto(d.id, p, qtdSugerida(K, p, servicosVisita(d), v.med)));
    setJanela(null);
  };

  return (
    <div className="space-y-6">
      {/* os produtos escolhidos */}
      {prods.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Produtos · {prods.length}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence initial={false}>
              {prods.map((p) => (
                <CartaoEscolhido key={p.id} K={K} p={p} novo={!!antes && !idsAntes.has(p.id) && !trocadoDe.has(p.id)} era={trocadoDe.get(p.id)}
                  qtd={(n) => mudar(() => A.produtoQtd(d.id, p.id, n))} trocar={() => setJanela({ k: "trocar", p, raiz: raizDaTroca(K, p, partes) })} tirar={() => mudar(() => A.tirarProduto(d.id, p.id))} />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}

      {/* a estimativa do modelo, pelas partes */}
      {partes.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">Materiais do modelo · estimativa</p>
            <p className="text-sm text-muted-foreground">Escolha um produto e a estimativa dessa parte desce sozinha</p>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {partes.map((pt) => (
              <LinhaParte key={pt.d} pt={pt} preco={pt.preco * escala}
                escolher={pt.raiz ? () => setJanela({ k: "parte", parte: pt }) : undefined}
                tirar={() => mudar(() => A.parteModelo(d.id, pt.d, true))} repor={() => mudar(() => A.parteModelo(d.id, pt.d, false))} />
            ))}
          </ul>
        </div>
      )}

      {/* o que se tirou desde a versão anterior */}
      {retirados.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Tirados desde a v{ant.n}</p>
          <ul className="flex flex-wrap gap-2">
            {retirados.map((p) => {
              const doCat = K.produtos.find((x) => x.id === p.id);
              return (
                <li key={p.id} className="flex items-center gap-2 rounded-full border border-dashed border-input bg-card py-1 pl-1 pr-1.5">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-muted/70 opacity-60"><Ilustracao k={imgDe(K, p)} className="h-6 w-6" /></span>
                  <span className="text-sm text-muted-foreground line-through decoration-muted-foreground/50">{p.n}</span>
                  {doCat && (
                    <button type="button" onClick={() => mudar(() => A.produto(d.id, doCat, p.q))}
                      className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-primary hover:bg-primary/[0.08]">
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Repor
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button type="button" onClick={() => setJanela({ k: "juntar" })}
        className="group flex min-h-16 w-full items-center gap-3 rounded-2xl border border-dashed border-input bg-card px-4 text-left transition-colors hover:border-primary hover:bg-primary/[0.03]">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105"><Plus className="h-5 w-5" aria-hidden="true" /></span>
        <span className="flex-1">
          <span className="block text-[15px] font-medium text-foreground">Juntar um produto</span>
          <span className="block text-sm text-muted-foreground">Do Catálogo: espelho, eletrodomésticos, acessórios…</span>
        </span>
      </button>

      <JanelaCatalogo K={K} alvo={ctx.S.cfg.alvo} janela={janela} fechar={() => setJanela(null)} escolher={escolher} jaTem={idsAgora} />
    </div>
  );
}

/* ------------------------------------------------------------------ um produto escolhido */
function CartaoEscolhido({ K, p, novo, era, qtd, trocar, tirar }: {
  K: Catalogo; p: ProdVisita; novo: boolean; era?: ProdVisita; qtd: (n: number) => void; trocar: () => void; tirar: () => void;
}) {
  const reduzir = useReduzir();
  const doCat = K.produtos.find((x) => x.id === p.id);
  return (
    <motion.li layout={!reduzir} initial={reduzir ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={reduzir ? undefined : { opacity: 0, scale: 0.96 }} transition={MOLA}
      className={cn("relative flex flex-col rounded-2xl border bg-card p-3 shadow-[0_1px_2px_hsl(var(--foreground)/0.05)]", novo || era ? "border-primary/40" : "border-border")}>
      <div className="flex gap-3">
        <span className="relative grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-muted/70">
          <Ilustracao k={imgDe(K, p)} className="h-14 w-14" />
        </span>
        <span className="min-w-0 flex-1">
          {(novo || era) && (
            <span className="mb-1 inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{era ? `Trocado · era ${era.n}` : "Novo nesta versão"}</span>
            </span>
          )}
          <span className="line-clamp-2 block text-[15px] font-medium leading-snug">{p.n}</span>
          <span className="block truncate text-sm text-muted-foreground">{[doCat?.marca, p.cliente ? "o cliente fornece" : `${eur(p.pvp ?? precoUnitario(p))} € / ${p.un}`].filter(Boolean).join(" · ")}</span>
          {p.svc && <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground"><Link2 className="h-3 w-3" aria-hidden="true" />com a instalação</span>}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <ContadorQtd id={`vq-${p.id}`} valor={p.q} un={p.un} nome={p.n} min={p.q < 1 ? p.q : 1} onMudar={qtd} />
        <span className="text-base font-semibold tabular-nums">{p.cliente ? "0,00" : eur(precoProduto(p))} €</span>
      </div>
      <div className="mt-3 flex gap-2 border-t border-border pt-3">
        <button type="button" onClick={trocar}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary/[0.08] px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/[0.14]">
          <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />Trocar
        </button>
        <button type="button" onClick={tirar} aria-label={`Tirar ${p.n}`}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-4 w-4" aria-hidden="true" />Tirar
        </button>
      </div>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ uma parte da estimativa do modelo */
function LinhaParte({ pt, preco, escolher, tirar, repor }: { pt: ParteEstimativa; preco: number; escolher?: () => void; tirar: () => void; repor: () => void }) {
  const coberta = !pt.fora && !pt.mantida && pt.por.length > 0 && pt.custo <= 0.004;
  const parcial = !pt.fora && !pt.mantida && pt.por.length > 0 && !coberta;
  const apagada = pt.fora || pt.mantida || coberta;
  const estado = pt.fora ? "Tirada desta versão"
    : pt.mantida ? "O cliente mantém o que tem"
    : pt.por.length ? `${coberta ? "Coberta" : "Em parte"} por ${pt.por.map((p) => p.n).join(", ")}`
    : "Estimativa · ainda sem produto escolhido";
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap">
      <span className={cn("relative grid h-12 w-12 shrink-0 place-items-center rounded-xl", coberta ? "bg-success/10" : "bg-muted/70", pt.fora && "opacity-50")}>
        <Ilustracao k={ilustracaoDe(pt.d)} className="h-9 w-9" />
        {coberta && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-success text-white"><Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /></span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[15px] font-medium", pt.fora && "text-muted-foreground line-through decoration-muted-foreground/50")}>{maiuscula(pt.d)}</span>
        <span className={cn("block truncate text-sm", coberta ? "text-success" : parcial ? "text-foreground" : "text-muted-foreground")}>{estado}</span>
      </span>
      <span className={cn("w-24 text-right text-[15px] tabular-nums", apagada ? "text-muted-foreground" : "font-semibold")}>{apagada ? "—" : `${eur(preco)} €`}</span>
      <span className="flex w-full justify-end gap-1.5 sm:w-auto">
        {pt.fora ? (
          <button type="button" onClick={repor} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-primary hover:bg-primary/[0.08]">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />Repor
          </button>
        ) : (
          <>
            {escolher && !pt.mantida && (
              <button type="button" onClick={escolher}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary/[0.08] px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/[0.14]">
                {pt.por.length ? <><Plus className="h-4 w-4" aria-hidden="true" />Juntar</> : <><Search className="h-4 w-4" aria-hidden="true" />Escolher</>}
              </button>
            )}
            {!pt.mantida && !coberta && (
              <button type="button" onClick={tirar} aria-label={`Tirar ${pt.d} da estimativa`}
                className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ a janela do Catálogo */
// 29/10: alvo = margem-alvo do Catálogo (S.cfg.alvo): os produtos sem PVP com o mesmo preço do Catálogo; o atual é fotografia (já tem o preço)
function JanelaCatalogo({ K, alvo, janela, fechar, escolher, jaTem }: {
  K: Catalogo; alvo: number; janela: Janela; fechar: () => void; escolher: (p: Produto) => void; jaTem: Set<string>;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [n, setN] = useState(PAGINA);
  const atual = janela?.k === "trocar" ? janela.p : null;

  // o universo: na troca, o ramo da parte do modelo ou do produto (raizDaTroca);
  // numa parte do modelo, o ramo da parte; ao juntar, o Catálogo todo
  const base = useMemo(() => {
    const todos = K.produtos.filter((p) => !CONSUMIVEIS.has(p.n));
    if (!janela || janela.k === "juntar") return todos;
    const raiz = janela.k === "parte" ? janela.parte.raiz : janela.raiz;
    if (!raiz) return todos;
    const nos = nosAbaixo(K.arvore, raiz);
    return todos.filter((p) => p.no && nos.has(p.no));
  }, [K, janela]);
  const cats = useMemo(() => categorias(base, K.arvore), [base, K.arvore]);

  // ao abrir: na troca, começa na categoria do produto atual
  useEffect(() => {
    setQ(""); setN(PAGINA);
    const doCat = atual ? K.produtos.find((x) => x.id === atual.id) : undefined;
    setCat(doCat && cats.length > 1 ? categoriaDe(doCat, K.arvore) : null);
  }, [janela]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const L = filtrarProdutos(base, K.arvore, { q, cat });
    // na troca, os de preço mais perto do atual primeiro; nos outros, do mais barato ao mais caro
    const pa = atual ? precoUnitario(atual) : 0;
    return [...L].sort((a, b) => (atual ? Math.abs(precoUnitario(a, alvo) - pa) - Math.abs(precoUnitario(b, alvo) - pa) : precoUnitario(a, alvo) - precoUnitario(b, alvo)));
  }, [base, K.arvore, q, cat, atual, alvo]);

  const titulo = !janela ? "" : janela.k === "trocar" ? `Trocar ${janela.p.n}` : janela.k === "parte" ? maiuscula(janela.parte.d) : "Juntar um produto";
  const sub = !janela ? "" : janela.k === "trocar" ? "Toque no produto que fica no lugar dele: a quantidade mantém-se."
    : janela.k === "parte" ? "O produto escolhido entra na proposta e a estimativa desta parte desce." : "Procure ou escolha a categoria.";
  const chip = (on: boolean) => cn("inline-flex min-h-10 shrink-0 items-center rounded-full border px-3.5 text-sm transition-colors",
    on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:border-foreground/40");

  return (
    <Dialog open={!!janela} onOpenChange={(a) => { if (!a) fechar(); }}>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <div className="border-b border-border p-5 pb-4">
          <DialogTitle className="pr-8 text-lg">{titulo}</DialogTitle>
          <DialogDescription className="mt-1">{sub}</DialogDescription>
          {atual && (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/60 p-2.5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-card"><Ilustracao k={imgDe(K, atual)} className="h-9 w-9" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">Agora</span>
                <span className="block truncate text-[15px] font-medium">{atual.n}</span>
              </span>
              <span className="text-right text-[15px] tabular-nums">{eur(precoUnitario(atual))} €<span className="block text-xs text-muted-foreground">× {nfmt(atual.q)} {atual.un}</span></span>
            </div>
          )}
          <label className="relative mt-3 block">
            <span className="sr-only">Procurar no Catálogo</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setN(PAGINA); }} placeholder="Procurar: nome, marca…"
              className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
          </label>
          {cats.length > 1 && (
            <div role="group" aria-label="Categoria" className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
              <button type="button" aria-pressed={!cat} onClick={() => { setCat(null); setN(PAGINA); }} className={chip(!cat)}>Todas</button>
              {cats.map((c) => (
                <button key={c.n} type="button" aria-pressed={cat === c.n} ref={cat === c.n ? (el) => el?.scrollIntoView({ block: "nearest", inline: "center" }) : undefined} onClick={() => { setCat(cat === c.n ? null : c.n); setN(PAGINA); }} className={chip(cat === c.n)}>
                  {c.n}<span className={cn("ml-1.5 text-xs", cat === c.n ? "text-primary-foreground/80" : "text-muted-foreground")}>{c.q}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-5">
          <p className="sr-only" aria-live="polite">{lista.length} produtos</p>
          {lista.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {lista.slice(0, n).map((p) => {
                const eAtual = atual?.id === p.id, ja = !atual && jaTem.has(p.id);
                const dif = atual ? (precoUnitario(p, alvo) - precoUnitario(atual)) * atual.q : 0;
                return (
                  <li key={p.id}>
                    <button type="button" disabled={eAtual || ja} onClick={() => escolher(p)}
                      className={cn("group relative flex h-full w-full flex-col rounded-2xl border bg-card p-2.5 text-left transition-all duration-150",
                        eAtual || ja ? "cursor-default border-primary/50 ring-1 ring-primary/40" : "border-border hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_10px_24px_-14px_hsl(var(--primary)/0.6)]")}>
                      <span className="grid h-24 place-items-center rounded-xl bg-muted/70 transition-colors group-hover:bg-primary/[0.08]">
                        <Ilustracao k={ilustracaoDoCatalogo(K.arvore, p)} className="h-16 w-16 transition-transform duration-200 group-hover:scale-105" />
                      </span>
                      {(eAtual || ja) && <span className="absolute left-4 top-4 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{eAtual ? "Atual" : "Já está"}</span>}
                      <span className="mt-2 line-clamp-2 text-[15px] font-medium leading-snug">{p.n}</span>
                      {p.marca && <span className="truncate text-sm text-muted-foreground">{p.marca}</span>}
                      <span className="mt-auto flex items-end justify-between gap-1 pt-2">
                        <span className="text-[15px] tabular-nums">{eur(precoUnitario(p, alvo))} €<span className="text-xs text-muted-foreground"> / {p.un}</span></span>
                        {atual && !eAtual && (
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                            Math.abs(dif) < 0.005 ? "bg-muted text-muted-foreground" : dif < 0 ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                            {Math.abs(dif) < 0.005 ? "igual" : `${dif < 0 ? "−" : "+"}${eur(Math.abs(dif))} €`}
                          </span>
                        )}
                        {!atual && !ja && <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /></span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-10 text-center text-[15px] text-muted-foreground">Nada no Catálogo{q.trim() ? ` com «${q.trim()}»` : ""}.</p>
          )}
          {lista.length > n && (
            <button type="button" onClick={() => setN((x) => x + PAGINA)}
              className="mx-auto mt-4 flex min-h-11 items-center rounded-xl border border-input bg-card px-4 text-[15px] font-medium hover:border-foreground/40">
              Mostrar mais {Math.min(PAGINA, lista.length - n)}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
