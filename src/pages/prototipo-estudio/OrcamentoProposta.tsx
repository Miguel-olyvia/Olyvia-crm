// 12/11 (Rúben: «esta parte do orçamento pode estar muito mais bonita»). O passo «Proposta» do Estúdio:
//  · em cima, para onde vai o dinheiro (peças, materiais, trabalhos), numa barra só;
//  · cada grupo com o total dele; cada linha com o desenho do produto na cor dele (o material com a amostra), o porquê, a quantidade
//    num campo discreto e o total; tirar e repor sem sair da linha;
//  · ao lado, o orçamento com o IVA e as três partes.
import { motion, useReducedMotion } from "framer-motion";
import { Hammer, Package, Paintbrush, RotateCcw, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATALOGO, type Produto } from "./catalogoFake";
import { IVA, type Grupo, type Linha, type Projeto, totais } from "./necessidadesEstudio";
import { Ilustracao } from "./Ilustracao";
import { eur, nf, useContagem } from "./pecasEstudio";

const GRUPOS: { g: Grupo; icone: typeof Package; cor: string; texto: string }[] = [
  { g: "Peças", icone: Package, cor: "bg-primary", texto: "O que se compra e se instala." },
  { g: "Materiais", icone: Paintbrush, cor: "bg-primary/55", texto: "Paredes e chão, por m², com as quebras." },
  { g: "Trabalhos", icone: Wrench, cor: "bg-primary/25", texto: "Mão de obra que sai das plantas." },
];

const produtoDaLinha = (l: Linha): Produto | undefined => CATALOGO.find((x) => x.n === l.n);
const somaDe = (ls: readonly Linha[]) => ls.filter((l) => !l.fora).reduce((s, l) => s + l.total, 0);

/** Para onde vai o dinheiro: uma barra com as três partes e a legenda com o valor de cada uma. */
function ParaOndeVai({ linhas }: { linhas: Linha[] }) {
  const reduzir = useReducedMotion();
  const partes = GRUPOS.map((x) => ({ ...x, v: somaDe(linhas.filter((l) => l.grupo === x.g)) })).filter((x) => x.v > 0);
  const total = partes.reduce((s, x) => s + x.v, 0);
  if (!total) return null;
  return (
    <section aria-label="Para onde vai o orçamento" className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm text-muted-foreground">Para onde vai o orçamento, sem IVA</p>
      <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {partes.map((x) => (
          <motion.span key={x.g} className={cn("h-full first:rounded-l-full last:rounded-r-full", x.cor)}
            initial={reduzir ? false : { width: 0 }} animate={{ width: `${(x.v / total) * 100}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {partes.map((x) => (
          <div key={x.g} className="flex items-start gap-2.5">
            <span aria-hidden="true" className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", x.cor)} />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground sm:text-sm">{x.g} · {Math.round((x.v / total) * 100)}%</dt>
              <dd className="text-[15px] font-semibold tabular-nums sm:text-[17px]">{eur(x.v)}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** O desenho à esquerda da linha: o produto na cor dele, a amostra do material, ou o trabalho. */
function Miniatura({ l }: { l: Linha }) {
  const prod = produtoDaLinha(l);
  if (l.grupo === "Materiais") {
    return <span aria-hidden="true" className="block h-12 w-12 shrink-0 rounded-xl border border-black/15 shadow-inner" style={{ background: prod?.hex ? `linear-gradient(135deg, ${prod.hex} 0 48%, rgba(255,255,255,0.35) 49% 51%, ${prod.hex} 52%)` : undefined }} />;
  }
  if (l.grupo === "Peças" && prod) return <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted/70"><Ilustracao cat={prod.cat} hex={prod.hex} tamanho={40} /></span>;
  const Icone = /^retirar|sai|demoli/i.test(l.n) ? Hammer : l.grupo === "Peças" ? Package : Wrench;
  return <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted/70 text-muted-foreground"><Icone className="h-5 w-5" /></span>;
}

export function LinhasProposta({ linhas, setP, irParaPeca }: { linhas: Linha[]; setP: React.Dispatch<React.SetStateAction<Projeto>>; irParaPeca: (pecaId: string) => void }) {
  const ajustar = (id: string, a: { q?: number; fora?: boolean }) => setP((x) => ({ ...x, ajustes: { ...x.ajustes, [id]: { ...(x.ajustes[id] ?? {}), ...a } } }));
  if (!linhas.length) return <p className="rounded-2xl border border-dashed border-border p-6 text-[15px] text-muted-foreground">Sem necessidades: a planta do depois ainda é igual à do antes. Troque, tire ou junte peças, ou escolha o revestimento e o pavimento.</p>;
  return (
    <div className="space-y-6">
      <ParaOndeVai linhas={linhas} />
      {GRUPOS.map(({ g, icone: Icone, cor, texto }) => {
        const ls = linhas.filter((l) => l.grupo === g);
        if (!ls.length) return null;
        return (
          <section key={g} aria-label={g} className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
            <header className="flex items-center gap-3 border-b border-border bg-muted/30 px-5 py-3.5">
              <span aria-hidden="true" className={cn("grid h-8 w-8 place-items-center rounded-lg text-primary-foreground", cor === "bg-primary" ? "bg-primary" : "bg-primary/80")}><Icone className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold leading-tight">{g} <span className="font-normal text-muted-foreground">· {ls.filter((l) => !l.fora).length}</span></h3>
                <p className="truncate text-xs text-muted-foreground">{texto}</p>
              </div>
              <span className="text-[15px] font-semibold tabular-nums">{eur(somaDe(ls))}</span>
            </header>
            <ul className="divide-y divide-border">
              {ls.map((l) => (
                <li key={l.id} className={cn("group grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-muted/30 sm:grid-cols-[auto_1fr_auto_auto_auto]", l.fora && "bg-muted/20")}>
                  <span className={cn("block", l.fora && "opacity-40 grayscale")}><Miniatura l={l} /></span>
                  <div className={cn("min-w-0", l.fora && "opacity-50")}>
                    <p className={cn("text-[15px] font-medium leading-snug", l.fora && "line-through")}>
                      {l.n}{l.ajustada && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 align-middle text-xs font-normal text-primary">ajustado</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">{l.porque}</p>
                    {l.porEscolher && <button type="button" className="min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => irParaPeca(l.id.replace(/^prod-/, ""))}>Escolher no catálogo</button>}
                  </div>
                  {/* no telemóvel, a quantidade e o total passam para a linha de baixo */}
                  <label className="col-start-2 row-start-2 flex w-fit items-center rounded-full bg-muted/60 pr-3 text-sm focus-within:ring-2 focus-within:ring-primary/30 sm:col-start-auto sm:row-start-auto">
                    <span className="sr-only">Quantidade de {l.n}</span>
                    <input key={`${l.id}-${l.q}`} type="number" step="any" min={0} defaultValue={l.q} disabled={l.fora}
                      className="h-10 w-[4.5rem] rounded-full bg-transparent px-3 text-right tabular-nums outline-none disabled:opacity-50"
                      onBlur={(e) => { const q = Number(e.target.value); if (Number.isFinite(q) && q >= 0 && q !== l.q) ajustar(l.id, { q }); }} />
                    <span className="text-muted-foreground">{l.un}</span>
                  </label>
                  <span className={cn("col-start-3 row-start-2 text-right sm:col-start-auto sm:row-start-auto sm:w-28", l.fora && "opacity-50")}>
                    <span className={cn("block text-[15px] font-semibold tabular-nums", l.fora && "line-through")}>{eur(l.total)}</span>
                    {l.q !== 1 && l.q > 0 && <span className="block text-xs tabular-nums text-muted-foreground">{eur(l.unit)} × {nf(l.q)}</span>}
                  </span>
                  <button type="button" aria-label={l.fora ? `Repor ${l.n}` : `Tirar ${l.n}`} onClick={() => ajustar(l.id, { fora: !l.fora })}
                    className={cn("col-start-3 row-start-1 grid min-h-11 min-w-11 place-items-center justify-self-end rounded-full transition-colors sm:col-start-auto sm:row-start-auto",
                      l.fora ? "px-3 text-sm font-medium text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive")}>
                    {l.fora ? <span className="inline-flex items-center gap-1.5"><RotateCcw className="h-4 w-4" aria-hidden="true" />Repor</span> : <X className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** O orçamento ao lado da proposta: o total com IVA a contar, e as partes por baixo. */
export function ResumoProposta({ linhas, porEscolher }: { linhas: Linha[]; porEscolher: number }) {
  const t = totais(linhas);
  const comIva = useContagem(t.comIva);
  const partes = GRUPOS.map((x) => ({ g: x.g, v: somaDe(linhas.filter((l) => l.grupo === x.g)) })).filter((x) => x.v > 0);
  return (
    <section aria-label="Orçamento" className="overflow-hidden rounded-2xl bg-foreground text-background shadow-lg">
      <div className="p-6">
        <p className="text-sm text-background/70">Orçamento, com IVA a {Math.round(IVA * 100)}%</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{eur(comIva)}</p>
        {porEscolher > 0 && <p className="mt-2 inline-flex rounded-full bg-amber-300/20 px-2.5 py-0.5 text-sm text-amber-200">{porEscolher} por escolher no catálogo</p>}
      </div>
      <dl className="space-y-2 border-t border-background/10 px-6 py-4 text-sm">
        {partes.map((x) => (
          <div key={x.g} className="flex justify-between gap-4"><dt className="text-background/70">{x.g}</dt><dd className="tabular-nums">{eur(x.v)}</dd></div>
        ))}
        <div className="flex justify-between gap-4 border-t border-background/10 pt-2"><dt className="text-background/70">Sem IVA</dt><dd className="font-medium tabular-nums">{eur(t.semIva)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-background/70">IVA {Math.round(IVA * 100)}%</dt><dd className="tabular-nums">{eur(t.iva)}</dd></div>
      </dl>
      <p className="border-t border-background/10 px-6 py-3 text-xs text-background/60">Com IVA a 6% se a casa estiver numa área de reabilitação urbana: por confirmar.</p>
    </section>
  );
}
