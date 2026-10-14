// As peças da seleção guiada (14/10/2026): cartões que ligam e desligam ao toque (sem "+"), com o nome em 2 linhas no máximo,
// a quantidade escrita no cartão com um "Mudar" discreto, os cartões grandes de resposta e a fila de filtros por baixo da pesquisa
// (desliza com o dedo, a arrastar com o rato e com a roda; sem barra visível).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Link2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, nfmt } from "./motor";
import { numero } from "./pecas";
import { IconeServico, Ilustracao, type IconeServicoKey, type IlustracaoKey } from "./ilustracoes";

/** O visto do cartão escolhido (o círculo vazio quando não está). */
function Visto({ on, so }: { on: boolean; so?: boolean }) {
  return (
    <span aria-hidden="true" className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors duration-150",
      so ? "border-transparent text-primary" : on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>
      {so ? <Link2 className="h-4 w-4" /> : on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}

const CAIXA = (on: boolean) => cn("relative flex flex-col rounded-xl border bg-card transition-colors duration-150",
  on ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "border-border");
const TOQUE = "flex w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed";

/* ------------------------------------------------------------------ serviço */
export function CartaoServico({ nome, nomeCompleto, linha2, icone, figura, on, so, desativado, onTocar, children, falta, compacto }: {
  nome: string; nomeCompleto: string; linha2?: string | null; icone: IconeServicoKey; figura?: ReactNode; on: boolean; so?: boolean; desativado?: boolean;
  onTocar: () => void; children?: ReactNode; falta?: boolean;
  /** Mais baixo (o fornece por serviço): a figura de 32 px e menos espaço. */
  compacto?: boolean;
}) {
  const corpo = (
    <>
      <span className={cn("grid shrink-0 place-items-center rounded-lg transition-colors", compacto ? "h-8 w-8" : "h-10 w-10", on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
        {figura ?? <IconeServico k={icone} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground">{nome}</span>
        {linha2 && <span className="mt-0.5 block truncate text-sm leading-snug text-muted-foreground">{linha2}</span>}
      </span>
      <Visto on={on} so={so} />
    </>
  );
  const rotulo = [nomeCompleto, linha2].filter(Boolean).join(". ");
  return (
    <li className={cn(CAIXA(on), falta && "border-destructive")} title={nomeCompleto}>
      {so ? (
        <div className="flex min-h-[64px] items-center gap-3 p-3" aria-label={rotulo} role="group">{corpo}</div>
      ) : (
        <button type="button" aria-pressed={on} disabled={desativado} onClick={onTocar} aria-label={rotulo}
          className={cn(TOQUE, "items-center gap-3", compacto ? "min-h-[52px] px-3 py-2" : "min-h-[64px] p-3")}>{corpo}</button>
      )}
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ produto */
export function CartaoProduto({ nome, nomeCompleto, detalhe, preco, un, img, on, trazInstalacao, onTocar, children }: {
  nome: string; nomeCompleto: string; detalhe?: string | null; preco: number; un: string; img: IlustracaoKey; on: boolean; trazInstalacao?: boolean;
  onTocar: () => void; children?: ReactNode;
}) {
  const rotulo = [nomeCompleto, detalhe, `${eur(preco)} € por ${un}`, trazInstalacao ? "traz a instalação" : null].filter(Boolean).join(". ");
  return (
    <li className={CAIXA(on)} title={nomeCompleto}>
      <button type="button" aria-pressed={on} onClick={onTocar} aria-label={rotulo} className={cn(TOQUE, "h-full flex-col gap-2 p-2.5")}>
        <span className="flex w-full items-start justify-between gap-2">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted/70"><Ilustracao k={img} className="h-11 w-11" /></span>
          <Visto on={on} />
        </span>
        <span className="line-clamp-2 w-full text-[15px] font-medium leading-snug text-foreground">{nome}</span>
        {detalhe && <span className="-mt-1.5 block w-full truncate text-sm text-muted-foreground">{detalhe}</span>}
        <span className="mt-auto flex w-full items-center justify-between gap-1 whitespace-nowrap text-[15px] tabular-nums text-foreground">
          <span>{eur(preco)} €<span className="text-sm text-muted-foreground"> / {un}</span></span>
          {trazInstalacao && <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </span>
      </button>
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ a quantidade */
/**
 * A quantidade no cartão escolhido, sem fila de números: o texto ("12 m² · da visita", ou "1 un") e um "Mudar" discreto,
 * que abre um campo numérico pequeno (Enter ou sair do campo grava; Escape desiste). Só se põe no cartão escolhido.
 */
export function QtdMudar({ id, valor, un, nome, texto, onMudar }: { id: string; valor: number; un: string; nome: string; texto?: string; onMudar: (n: number) => void }) {
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
    <div className="flex min-h-9 items-center justify-between gap-2 px-3 pb-2 animate-in fade-in-0 duration-150">
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
export function CartaoResposta({ on, onTocar, titulo, sub, disabled }: { on: boolean; onTocar: () => void; titulo: string; sub?: string; disabled?: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onTocar} disabled={disabled}
      className={cn("flex min-h-16 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:opacity-70",
        on ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "border-input bg-card hover:border-foreground/40")}>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-foreground">{titulo}</span>
        {sub && <span className="block text-sm text-muted-foreground">{sub}</span>}
      </span>
      <Visto on={on} />
    </button>
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
export function FiltrosFila({ opcoes, ativo, onMudar, rotulo }: { opcoes: string[]; ativo: string | null; onMudar: (v: string | null) => void; rotulo: string }) {
  const ref = useRef<HTMLDivElement>(null);
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

  if (opcoes.length < 2) return null;
  const b = (on: boolean) => cn("inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[15px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset",
    on ? "border-primary bg-primary font-medium text-primary-foreground" : "border-input bg-card text-foreground hover:border-foreground/40");
  // o esbatimento só na ponta que tem mais conteúdo
  const mascara = pontas.esq || pontas.dir
    ? `linear-gradient(to right, ${pontas.esq ? "transparent 0, #000 32px" : "#000 0"}, ${pontas.dir ? "#000 calc(100% - 32px), transparent 100%" : "#000 100%"})`
    : undefined;
  return (
    <div ref={ref} role="group" aria-label={rotulo} data-esq={pontas.esq || undefined} data-dir={pontas.dir || undefined}
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
      onDragStart={(e) => e.preventDefault()}>
      <button type="button" aria-pressed={!ativo} onClick={() => onMudar(null)} className={b(!ativo)}>Todos</button>
      {opcoes.map((o) => (
        <button key={o} type="button" aria-pressed={ativo === o} onClick={() => onMudar(ativo === o ? null : o)} className={b(ativo === o)}>{o}</button>
      ))}
    </div>
  );
}
