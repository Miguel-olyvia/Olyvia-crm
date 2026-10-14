// As peças da seleção guiada (14/10/2026): cartões que ligam e desligam ao toque (sem "+"), com o nome em 2 linhas no máximo,
// a quantidade escrita no cartão com um "Mudar" discreto, os cartões grandes de resposta e a fila de filtros por baixo da pesquisa
// (desliza com o dedo, a arrastar com o rato e com a roda; sem barra visível).
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Link2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, nfmt } from "./motor";
import { numero } from "./pecas";
import { IconeServico, Ilustracao, type IconeServicoKey, type IlustracaoKey } from "./ilustracoes";
import { MOLA, MOLA_CARTAO, VistoDesenho, cascata, useReduzir } from "./movimento";

/** O visto do cartão escolhido (desenha-se ao ligar; o círculo vazio quando não está); "so" = vem com um produto. */
function Visto({ on, so, atraso }: { on: boolean; so?: boolean; atraso?: number }) {
  if (so) return <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center text-primary"><Link2 className="h-4 w-4" /></span>;
  return <VistoDesenho on={on} atraso={atraso} />;
}

/** A camada do acento (borda de 2 px, fundo suave e sombra): aparece e some só com opacity, sem repintar a caixa. */
function Acento({ on, atraso = 0 }: { on: boolean; atraso?: number }) {
  const reduzir = useReduzir();
  return (
    <motion.span aria-hidden="true" initial={false} animate={{ opacity: on ? 1 : 0 }} transition={{ duration: reduzir ? 0 : 0.18, delay: reduzir ? 0 : atraso }}
      className="pointer-events-none absolute -inset-px rounded-xl border-2 border-primary bg-primary/[0.06] shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.55)]" />
  );
}

/**
 * A caixa do cartão. "animar" reorganiza a grelha com animação quando se filtra (layout, só nas listas curtas);
 * "entrada" é a cascata (movimento.tsx: cascata).
 */
function Caixa({ on, falta, title, animar, entrada, children, atraso }: {
  atraso?: number; on: boolean; falta?: boolean; title: string; animar?: boolean; entrada?: ReturnType<typeof cascata>; children: ReactNode;
}) {
  const reduzir = useReduzir();
  return (
    <motion.li layout={animar && !reduzir ? "position" : false} transition={MOLA} {...(entrada ?? { initial: false })}
      className={cn("relative flex flex-col rounded-xl border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.05)]", falta ? "border-destructive" : "border-border")}
      title={title}>
      <Acento on={on} atraso={atraso} />
      {children}
    </motion.li>
  );
}
const TOQUE = "relative flex w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed";
/** O "press": escala 0,97 ao tocar (a mola dos cartões). */
const PRESS = { whileTap: { scale: 0.97 }, transition: MOLA_CARTAO };

/** A figura do cartão: no escolhido, o fundo passa ao acento suave e a figura cresce um pouco (realce subtil). */
function Figura({ on, children, className, atraso = 0 }: { on: boolean; children: ReactNode; className: string; atraso?: number }) {
  const reduzir = useReduzir();
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-lg bg-muted/70", className)}>
      <motion.span aria-hidden="true" className="absolute inset-0 bg-primary/[0.12]" initial={false} animate={{ opacity: on ? 1 : 0 }} transition={{ duration: reduzir ? 0 : 0.2, delay: reduzir ? 0 : atraso }} />
      <motion.span className={cn("relative grid place-items-center transition-colors duration-200", on ? "text-primary" : "text-muted-foreground")} initial={false}
        animate={{ scale: on && !reduzir ? 1.08 : 1, rotate: on && !reduzir ? -3 : 0 }} transition={{ ...MOLA_CARTAO, delay: reduzir ? 0 : atraso }}>
        {children}
      </motion.span>
    </span>
  );
}

/* ------------------------------------------------------------------ serviço */
export function CartaoServico({ nome, nomeCompleto, linha2, icone, figura, on, so, desativado, onTocar, children, falta, compacto, animar, entrada, atraso }: {
  nome: string; nomeCompleto: string; linha2?: string | null; icone: IconeServicoKey; figura?: ReactNode; on: boolean; so?: boolean; desativado?: boolean;
  onTocar: () => void; children?: ReactNode; falta?: boolean;
  /** Mais baixo (o fornece por serviço): a figura de 32 px e menos espaço. */
  compacto?: boolean;
  /** Reorganiza-se com animação quando a grelha muda (listas curtas). */
  animar?: boolean;
  entrada?: ReturnType<typeof cascata>;
  /** O atraso da mudança (s), quando muitos mudam de uma vez (os modelos rápidos): uma cascata. */
  atraso?: number;
}) {
  const corpo = (
    <>
      <Figura on={on} atraso={atraso} className={compacto ? "h-8 w-8" : "h-10 w-10"}>{figura ?? <IconeServico k={icone} />}</Figura>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground">{nome}</span>
        {linha2 && <span className="mt-0.5 block truncate text-sm leading-snug text-muted-foreground">{linha2}</span>}
      </span>
      <Visto on={on} so={so} atraso={atraso} />
    </>
  );
  const rotulo = [nomeCompleto, linha2].filter(Boolean).join(". ");
  return (
    <Caixa on={on} falta={falta} title={nomeCompleto} animar={animar} entrada={entrada} atraso={atraso}>
      {so ? (
        <div className="relative flex min-h-[64px] items-center gap-3 p-3" aria-label={rotulo} role="group">{corpo}</div>
      ) : (
        <motion.button type="button" aria-pressed={on} disabled={desativado} onClick={onTocar} aria-label={rotulo} {...(desativado ? {} : PRESS)}
          className={cn(TOQUE, "items-center gap-3", compacto ? "min-h-[52px] px-3 py-2" : "min-h-[64px] p-3")}>{corpo}</motion.button>
      )}
      {children && <div className="relative">{children}</div>}
    </Caixa>
  );
}

/* ------------------------------------------------------------------ produto */
export function CartaoProduto({ nome, nomeCompleto, detalhe, preco, un, img, on, trazInstalacao, onTocar, children, animar, entrada }: {
  nome: string; nomeCompleto: string; detalhe?: string | null; preco: number; un: string; img: IlustracaoKey; on: boolean; trazInstalacao?: boolean;
  onTocar: () => void; children?: ReactNode; animar?: boolean; entrada?: ReturnType<typeof cascata>;
}) {
  const rotulo = [nomeCompleto, detalhe, `${eur(preco)} € por ${un}`, trazInstalacao ? "traz a instalação" : null].filter(Boolean).join(". ");
  return (
    <Caixa on={on} title={nomeCompleto} animar={animar} entrada={entrada}>
      <motion.button type="button" aria-pressed={on} onClick={onTocar} aria-label={rotulo} {...PRESS} className={cn(TOQUE, "h-full flex-col gap-2 p-3")}>
        <span className="flex w-full items-start justify-between gap-2">
          <Figura on={on} className="h-14 w-14"><Ilustracao k={img} className="h-11 w-11" /></Figura>
          <Visto on={on} />
        </span>
        <span className="line-clamp-2 w-full text-[15px] font-medium leading-snug text-foreground">{nome}</span>
        {detalhe && <span className="-mt-1.5 block w-full truncate text-sm text-muted-foreground">{detalhe}</span>}
        <span className="mt-auto flex w-full items-center justify-between gap-1 whitespace-nowrap text-[15px] tabular-nums text-foreground">
          <span>{eur(preco)} €<span className="text-sm text-muted-foreground"> / {un}</span></span>
          {trazInstalacao && <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </span>
      </motion.button>
      {children && <div className="relative">{children}</div>}
    </Caixa>
  );
}

/* ------------------------------------------------------------------ a quantidade */
/**
 * A quantidade no cartão escolhido, sem fila de números: o texto ("12 m² · da visita", ou "1 un") e um "Mudar" discreto,
 * que abre um campo numérico pequeno (Enter ou sair do campo grava; Escape desiste). Só se põe no cartão escolhido.
 */
export function QtdMudar({ id, valor, un, nome, texto, onMudar, recuo }: {
  id: string; valor: number; un: string; nome: string; texto?: string; onMudar: (n: number) => void;
  /** Nos cartões de serviço: alinhado com o nome (depois do ícone), colado a ele, no lugar da 2.ª linha. */
  recuo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (aberto) ref.current?.select(); }, [aberto]);
  const fechar = (gravar: boolean) => {
    const n = numero(ref.current?.value ?? "");
    if (gravar && !isNaN(n) && n > 0 && n !== valor) onMudar(Math.round(n * 100) / 100);
    setAberto(false);
    setTimeout(() => btn.current?.focus(), 0);
  };
  return (
    <div className={cn("flex min-h-9 items-center justify-between gap-2 pb-2 pr-3 animate-in fade-in-0 duration-150", recuo ? "-mt-3 pl-[64px]" : "pl-3")}>
      {aberto ? (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="sr-only">Quantidade de {nome}</span>
          <input id={id} ref={ref} inputMode="decimal" defaultValue={nfmt(valor)} aria-label={`Quantidade de ${nome}`}
            className="h-10 w-20 rounded-lg border border-input bg-card px-2 text-center text-[15px] tabular-nums text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            onBlur={() => fechar(true)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fechar(true); } if (e.key === "Escape") { e.preventDefault(); fechar(false); } }} />
          {un}
        </label>
      ) : (
        <span className="min-w-0 truncate text-sm tabular-nums text-muted-foreground">{texto}</span>
      )}
      {!aberto && (
        <button ref={btn} type="button" aria-controls={id} aria-label={`Mudar a quantidade de ${nome}`} onClick={() => setAberto(true)}
          className="-mr-1 min-h-9 shrink-0 rounded-md px-2 text-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/50">
          Mudar
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ respostas grandes */
export function CartaoResposta({ on, onTocar, titulo, sub, disabled, sugerido }: {
  on: boolean; onTocar: () => void; titulo: string; sub?: string; disabled?: boolean;
  /** A resposta mais provável (destacada, não escolhida): a razão, numa linha discreta, e a borda tracejada do acento. */
  sugerido?: string;
}) {
  return (
    <motion.button type="button" aria-pressed={on} onClick={onTocar} disabled={disabled} {...PRESS}
      className="relative flex h-full min-h-16 w-full items-center gap-3 rounded-xl border border-input bg-card px-4 py-3 text-left shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] outline-none transition-[border-color] duration-150 hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-70">
      <Acento on={on} />
      {sugerido && !on && <span aria-hidden="true" className="pointer-events-none absolute -inset-px rounded-xl border-2 border-dashed border-primary/70" />}
      <span className="relative min-w-0 flex-1">
        <span className="block text-base font-semibold text-foreground">{titulo}</span>
        {sub && <span className="block text-sm text-muted-foreground">{sub}</span>}
        {sugerido && !on && <span className="mt-1 block text-sm font-medium text-primary">Sugerido<span className="sr-only">: {sugerido}</span></span>}
      </span>
      <span className="relative"><Visto on={on} /></span>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ pesquisa e filtros */
export function Pesquisa({ valor, onMudar, rotulo, ph }: { valor: string; onMudar: (v: string) => void; rotulo: string; ph: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">{rotulo}</span>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" value={valor} onChange={(e) => onMudar(e.target.value)} placeholder={ph}
        className="h-12 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
    </label>
  );
}

/**
 * A fila de filtros por baixo da pesquisa: "Todos" e as opções, um ativo de cada vez (o ativo com o acento cheio).
 * Tocar no ativo volta a "Todos". Numa só linha, sem barra de scroll visível e sem scroll na página:
 * desliza com o dedo (nativo), a arrastar com o rato (um arrasto de mais de 5 px não conta como clique) e com a roda
 * (o deslocamento vertical passa a horizontal). A ponta com mais filtros esbate-se; o filtro focado com o Tab fica à vista.
 */
export function FiltrosFila({ opcoes, ativo, onMudar, rotulo, prefixo }: {
  opcoes: string[]; ativo: string | null; onMudar: (v: string | null) => void; rotulo: string;
  /** Um seletor que vem primeiro na mesma fila e desliza com o resto (ex.: a fase da obra). */
  prefixo?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idFila = useId();
  const reduzir = useReduzir();
  const arrasto = useRef<{ x: number; sl: number; id: number; moveu: boolean } | null>(null);
  const engolir = useRef(false);
  const [pontas, setPontas] = useState({ esq: false, dir: false });
  const [aArrastar, setAArrastar] = useState(false);

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const esq = el.scrollLeft > 2, dir = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setPontas((p) => (p.esq === esq && p.dir === dir ? p : { esq, dir }));
  }, []);
  useEffect(() => {
    medir();
    const el = ref.current;
    if (!el) return;
    // a roda: com a fila a transbordar, o deslocamento vertical passa a horizontal (listener não passivo, para o preventDefault)
    const roda = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const antes = el.scrollLeft;
      el.scrollLeft += e.deltaY;
      if (el.scrollLeft !== antes) e.preventDefault();
      medir();
    };
    el.addEventListener("wheel", roda, { passive: false });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    return () => { el.removeEventListener("wheel", roda); ro?.disconnect(); };
  }, [medir, opcoes.length]);

  if (opcoes.length < 2 && !prefixo) return null;
  // o filtro ativo: o fundo do acento desliza de um filtro para o outro (layoutId), o texto muda de cor por baixo
  const b = (on: boolean) => cn("relative inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[15px] transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    on ? "border-primary font-medium text-primary-foreground" : "border-input bg-card text-foreground hover:border-foreground/40");
  const fundo = (on: boolean) => on && (
    <motion.span layoutId={idFila} aria-hidden="true" className="absolute -inset-px rounded-full bg-primary" transition={reduzir ? { duration: 0 } : MOLA} />
  );
  // o esbatimento só na ponta que tem mais conteúdo
  const mascara = pontas.esq || pontas.dir
    ? `linear-gradient(to right, ${pontas.esq ? "transparent 0, #000 32px" : "#000 0"}, ${pontas.dir ? "#000 calc(100% - 32px), transparent 100%" : "#000 100%"})`
    : undefined;
  return (
    // layoutScroll: o fundo do filtro ativo (layoutId) mede-se bem com a fila deslocada
    <motion.div ref={ref} layoutScroll role="group" aria-label={rotulo} data-sem-gesto="" data-esq={pontas.esq || undefined} data-dir={pontas.dir || undefined}
      style={{ maskImage: mascara, WebkitMaskImage: mascara, msOverflowStyle: "none", scrollbarWidth: "none" }}
      className={cn("-mx-1 flex min-w-0 select-none gap-2 overflow-x-auto overscroll-x-contain px-1 py-0.5 [&::-webkit-scrollbar]:hidden",
        aArrastar ? "cursor-grabbing" : "cursor-grab")}
      onScroll={medir}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse" || e.button !== 0) return; // no toque, o scroll é o nativo
        arrasto.current = { x: e.clientX, sl: ref.current!.scrollLeft, id: e.pointerId, moveu: false };
      }}
      onPointerMove={(e) => {
        const a = arrasto.current;
        if (!a || a.id !== e.pointerId) return;
        const dx = e.clientX - a.x;
        if (!a.moveu && Math.abs(dx) > 5) {
          a.moveu = true; setAArrastar(true);
          try { ref.current!.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
        }
        if (a.moveu) { ref.current!.scrollLeft = a.sl - dx; medir(); }
      }}
      onPointerUp={(e) => {
        const a = arrasto.current;
        arrasto.current = null;
        setAArrastar(false);
        if (a?.moveu) { engolir.current = true; setTimeout(() => { engolir.current = false; }, 0); }
        try { ref.current?.releasePointerCapture(e.pointerId); } catch { /* jsdom */ }
      }}
      onPointerCancel={() => { arrasto.current = null; setAArrastar(false); }}
      // o clique que fecha um arrasto não ativa o filtro
      onClickCapture={(e) => { if (engolir.current) { e.preventDefault(); e.stopPropagation(); engolir.current = false; } }}
      onFocus={(e) => { if (e.target !== ref.current) (e.target as HTMLElement).scrollIntoView?.({ block: "nearest", inline: "nearest" }); }}
      onDragStartCapture={(e) => e.preventDefault()}>
      {prefixo}
      {opcoes.length >= 2 && <>
      <button type="button" aria-pressed={!ativo} onClick={() => onMudar(null)} className={b(!ativo)}>{fundo(!ativo)}<span className="relative">Todos</span></button>
      {opcoes.map((o) => (
        <button key={o} type="button" aria-pressed={ativo === o} onClick={() => onMudar(ativo === o ? null : o)} className={b(ativo === o)}>{fundo(ativo === o)}<span className="relative">{o}</span></button>
      ))}
      </>}
    </motion.div>
  );
}
