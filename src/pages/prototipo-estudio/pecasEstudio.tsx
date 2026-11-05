// 5/11: as peças do ecrã do Estúdio que mais do que um passo usa (os cartões, as cores, os produtos do catálogo, o orçamento).
import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, CircleDot, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PECAS, areaChaoM2, areaParedesM2, type PecaPlanta } from "@/emylia/planta";
import { ACOMPANHA, CORES, NOME_CATEGORIA, combina, coresPara, produto, produtosDe, type Categoria, type Cor, type Estilo, type Produto } from "./catalogoFake";
import { IVA, alturaFinalCm, estadoDaPeca, totais, type Projeto } from "./necessidadesEstudio";
import { Ilustracao } from "./Ilustracao";

export const eur = (n: number) => n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
export const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
export const CHIP = "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
export const chip = (on: boolean) => cn(CHIP, on ? "border-primary bg-primary/10 font-medium ring-1 ring-primary" : "border-input bg-background hover:bg-accent");
export const INP = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";

/** Um número que conta até ao valor novo (o orçamento a mexer quando se escolhe). Sem movimento para quem o pediu. */
export function useContagem(valor: number): number {
  const [mostrado, setMostrado] = useState(valor);
  const antes = useRef(valor);
  const reduzir = useReducedMotion();
  useEffect(() => {
    if (reduzir) { setMostrado(valor); antes.current = valor; return; }
    const c = animate(antes.current, valor, { duration: 0.5, ease: "easeOut", onUpdate: (v) => setMostrado(v) });
    antes.current = valor;
    return () => c.stop();
  }, [valor, reduzir]);
  return mostrado;
}

// ---------------------------------------------------------------- peças pequenas

export function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
      <h3 className="text-[17px] font-semibold tracking-tight">{titulo}</h3>
      {children}
    </section>
  );
}
export function Seguinte({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" className="min-h-12 w-full text-base" onClick={onClick}>{children}<ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></Button>;
}
export function Amostra({ hex, grande = false }: { hex?: string; grande?: boolean }) {
  return <span aria-hidden="true" className={cn("inline-block shrink-0 rounded-lg border border-black/10 shadow-inner", grande ? "h-14 w-14" : "h-8 w-8")} style={{ background: hex ?? "repeating-linear-gradient(45deg,#eee,#eee 4px,#ddd 4px,#ddd 8px)" }} />;
}
export function Numero({ rotulo, un, valor, onMudar }: { rotulo: string; un: string; valor: number; onMudar: (n: number) => void }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">{rotulo}
      <span className="flex items-center gap-2">
        <input key={valor} type="number" inputMode="numeric" min={150} max={500} defaultValue={valor} className={cn(INP, "w-32")}
          onBlur={(e) => { const n = Math.round(Number(e.target.value) || 0); if (n >= 150 && n !== valor) onMudar(n); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <span className="text-muted-foreground">{un}</span>
      </span>
    </label>
  );
}
export function Cores({ escolhidas, onMudar, pequeno = false }: { escolhidas: Cor[]; onMudar: (c: Cor[]) => void; pequeno?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Cores">
      {(Object.keys(CORES) as Cor[]).map((c) => {
        const on = escolhidas.includes(c);
        return (
          <button key={c} type="button" aria-pressed={on} className={cn(chip(on), pequeno && "px-3")}
            onClick={() => onMudar(on ? escolhidas.filter((x) => x !== c) : [...escolhidas, c])}>
            <span aria-hidden="true" className="h-5 w-5 rounded-full border border-black/15" style={{ background: CORES[c].hex }} />{CORES[c].n}
            {on && escolhidas.length > 1 && escolhidas[0] === c && <span className="text-xs text-muted-foreground">1.ª</span>}
          </button>
        );
      })}
    </div>
  );
}
export function Areas({ p }: { p: Projeto }) {
  const chao = areaChaoM2(p.antes.paredes), altura = alturaFinalCm(p.alturas) / 100;
  const paredes = areaParedesM2(p.depois, altura);
  return chao === null ? <p className="text-sm text-muted-foreground">Feche a planta para ver os m².</p> : (
    <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-[15px]">
      <div><dt className="text-xs text-muted-foreground">Chão</dt><dd className="font-semibold">{nf(chao)} m²</dd></div>
      <div><dt className="text-xs text-muted-foreground">Paredes até {p.alturas.tetoFalso ? "ao teto falso" : "ao teto"}</dt><dd className="font-semibold">{paredes === null ? "—" : `${nf(paredes)} m²`}</dd></div>
    </dl>
  );
}
export function Resumo({ t, porEscolher, grande = false }: { t: ReturnType<typeof totais>; porEscolher: number; grande?: boolean }) {
  const comIva = useContagem(t.comIva);
  return (
    <section aria-label="Orçamento" className={cn("rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]", grande && "bg-foreground text-background")}>
      <p className={cn("text-sm", grande ? "text-background/70" : "text-muted-foreground")}>Orçamento, com IVA a {Math.round(IVA * 100)}%</p>
      <p className={cn("font-semibold tabular-nums tracking-tight", grande ? "text-4xl" : "text-3xl")}>{eur(comIva)}</p>
      <p className={cn("text-sm", grande ? "text-background/70" : "text-muted-foreground")}>{eur(t.semIva)} sem IVA{porEscolher ? ` · ${porEscolher} por escolher` : ""}</p>
      {grande && <p className="mt-3 text-xs text-background/60">Com IVA a 6% se a casa estiver numa área de reabilitação urbana: por confirmar.</p>}
    </section>
  );
}

// ---------------------------------------------------------------- o catálogo de uma peça

export function CartaoProduto({ prod, estilo, escolhido, onEscolher, recomendado = false, acao }: { prod: Produto; estilo: Estilo; escolhido: boolean; onEscolher: () => void; recomendado?: boolean; acao?: string }) {
  const c = combina(prod, estilo);
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <button type="button" aria-pressed={escolhido} onClick={onEscolher}
        className={cn("flex w-full gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          escolhido ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "border-border bg-background hover:border-primary/50")}>
        <Ilustracao cat={prod.cat} hex={prod.hex} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug">{prod.n}</span>
          {prod.destaque && <span className="block text-xs text-muted-foreground">{prod.destaque}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <b>{eur(prod.preco)}{prod.un === "m²" ? "/m²" : ""}</b>
            <span className="text-muted-foreground">+ {eur(prod.inst)}{prod.un === "m²" ? "/m²" : ""} de mão de obra</span>
            {c === 2 && <span className="rounded-full bg-success/15 px-2 text-xs font-medium text-success">combina</span>}
            {c === 1 && <span className="rounded-full bg-muted px-2 text-xs">também combina</span>}
            {recomendado && <span className="rounded-full bg-primary px-2 text-xs font-medium text-primary-foreground">recomendado</span>}
          </span>
        </span>
        {acao ? <span className="h-fit shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{acao}</span>
          : escolhido && <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
      </button>
    </motion.li>
  );
}

export function ListaProdutos({ cat, estilo, escolhido, onEscolher, limite, acao }: { cat: Categoria; estilo: Estilo; escolhido?: string; onEscolher: (id: string) => void; limite?: number; acao?: string }) {
  const [todos, setTodos] = useState(false);
  const [mais, setMais] = useState(false);
  const completa = produtosDe(cat, estilo, todos);
  const lista = limite && !mais ? completa.slice(0, limite) : completa;
  const recomendado = produtosDe(cat, estilo)[0]?.id;
  const fora = produtosDe(cat, estilo, true).length - produtosDe(cat, estilo).length;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Filtrado por {coresPara(estilo, cat).map((c) => CORES[c].n.toLowerCase()).join(" e ") || "todas as cores"}.</p>
      {lista.length === 0 && <p className="text-sm">Nenhum produto combina com o estilo.</p>}
      <ul className="space-y-2">{lista.map((prod) => <CartaoProduto key={prod.id} prod={prod} estilo={estilo} escolhido={escolhido === prod.id} recomendado={prod.id === recomendado} acao={acao} onEscolher={() => onEscolher(prod.id)} />)}</ul>
      {limite && completa.length > limite && <button type="button" className="min-h-11 text-sm text-primary underline-offset-4 hover:underline" onClick={() => setMais((x) => !x)}>{mais ? "Ver menos" : `Ver mais ${completa.length - limite}`}</button>}
      {fora > 0 && <button type="button" className="min-h-11 text-sm text-primary underline-offset-4 hover:underline" onClick={() => setTodos((x) => !x)}>{todos ? "Só os que combinam" : `Ver também os outros ${fora}`}</button>}
    </div>
  );
}

export function PainelPeca({ p, pc, setP, fechar }: { p: Projeto; pc: PecaPlanta; setP: React.Dispatch<React.SetStateAction<Projeto>>; fechar: () => void }) {
  const estado = estadoDaPeca(p, pc), doAntes = estado !== "nova";
  const escolher = (id: string) => setP((x) => {
    const prod = produto(id);
    // a peça fica com o tamanho do produto, na mesma orientação
    const deitada = pc.w < pc.h;
    const pecas = x.depois.pecas.map((y) => (y.id === pc.id && prod?.w && prod.h ? { ...y, w: deitada ? prod.h : prod.w, h: deitada ? prod.w : prod.h } : y));
    return { ...x, escolhas: { ...x.escolhas, [pc.id]: id }, depois: { ...x.depois, pecas } };
  });
  return (
    <section aria-labelledby="t-peca" className="space-y-4 rounded-2xl border border-primary/30 bg-card p-5 shadow-[var(--shadow-md)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{estado === "nova" ? "Peça nova" : estado === "troca" ? "Troca" : "Fica como está"}</p>
          <h3 id="t-peca" className="text-[17px] font-semibold tracking-tight">{PECAS[pc.tipo].n}</h3>
        </div>
        <Button type="button" variant="ghost" className="min-h-11" aria-label="Fechar o catálogo" onClick={fechar}><X className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
      {doAntes && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip(estado === "fica")} aria-pressed={estado === "fica"}
            onClick={() => setP((x) => { const e = { ...x.escolhas }; delete e[pc.id]; return { ...x, escolhas: e }; })}><CircleDot className="h-4 w-4" aria-hidden="true" />Fica como está</button>
          <button type="button" className={chip(false)} onClick={() => { setP((x) => ({ ...x, depois: { ...x.depois, pecas: x.depois.pecas.filter((y) => y.id !== pc.id) } })); fechar(); }}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />Sai
          </button>
        </div>
      )}
      <ListaProdutos cat={pc.tipo} estilo={p.estilo} escolhido={p.escolhas[pc.id]} onEscolher={escolher} />
      {(ACOMPANHA[pc.tipo] ?? []).map((cat) => (
        <div key={cat} className="space-y-2 border-t border-border pt-4">
          <h4 className="text-[15px] font-semibold">{NOME_CATEGORIA[cat]}</h4>
          <ListaProdutos cat={cat} estilo={p.estilo} escolhido={p.acompanha[pc.id]?.[cat]}
            onEscolher={(id) => setP((x) => ({ ...x, acompanha: { ...x.acompanha, [pc.id]: { ...(x.acompanha[pc.id] ?? {}), [cat]: id } } }))} />
        </div>
      ))}
    </section>
  );
}

export function PainelMateriais({ p, setP }: { p: Projeto; setP: React.Dispatch<React.SetStateAction<Projeto>> }) {
  return (
    <Cartao titulo="Paredes e chão">
      <p className="text-sm text-muted-foreground">Ou toque numa peça da planta para a trocar.</p>
      <div className="space-y-2">
        <h4 className="text-[15px] font-semibold">Revestimento{p.alturas.tetoFalso ? " (até ao teto falso)" : ""}</h4>
        <ListaProdutos cat="revestimento" estilo={p.estilo} escolhido={p.revestimento} onEscolher={(id) => setP((x) => ({ ...x, revestimento: id }))} />
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <h4 className="text-[15px] font-semibold">Pavimento</h4>
        <ListaProdutos cat="pavimento" estilo={p.estilo} escolhido={p.pavimento} onEscolher={(id) => setP((x) => ({ ...x, pavimento: id }))} />
      </div>
    </Cartao>
  );
}

