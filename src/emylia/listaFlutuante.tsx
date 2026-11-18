// 16/11: a lista aberta de um combobox (ComboPesquisa, ComboOpcao dos atributos) fica POR CIMA de tudo. Antes era `absolute` dentro do campo e o
// cartão seguinte (com o seu próprio contexto de empilhamento) tapava-a. Agora vai num portal para o <body>, com `position: fixed` calculada
// a partir do retângulo do campo: mesma largura, abre para cima se não houver espaço por baixo, e acompanha o campo quando a página (ou
// qualquer contentor com scroll) rola ou a janela muda de tamanho. O espaço conta-se pela área VISÍVEL (window.visualViewport, que encolhe com o
// teclado virtual do iOS), o recálculo vai num requestAnimationFrame (uma medição por frame) e a lista fecha se o campo sair da vista.
import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Acima dos cartões, do cabeçalho fixo e dos diálogos (z-[600]/[610] em components/ui/dialog.tsx), abaixo dos popovers e selects (z-[700]). */
export const Z_LISTA_FLUTUANTE = 650;
const ALTURA_MAX = 288; // = max-h-72
const FOLGA = 4; // a distância ao campo (era mt-1)
const MARGEM = 8; // o que fica livre até à borda da área visível

export interface PosicaoLista { style: CSSProperties; paraCima: boolean }
/** A área visível: `top` e `height` do visualViewport (ou da janela) e a altura do viewport de layout (a referência do `bottom` de um elemento fixo). */
export interface Vista { top: number; height: number; layoutHeight: number; /** A largura do viewport de layout; sem ela, a da janela. */ layoutWidth?: number }

/** A área visível agora. Com window.visualViewport (teclado virtual) é essa; sem ele, a janela. */
export function vistaAtual(): Vista {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  return { top: vv?.offsetTop ?? 0, height: vv?.height ?? window.innerHeight, layoutHeight: document.documentElement.clientHeight || window.innerHeight, layoutWidth: document.documentElement.clientWidth || window.innerWidth };
}

/** Onde pôr a lista: por baixo do campo, ou por cima se por baixo não couber e por cima houver mais espaço. Função pura (testável). */
export function posicaoDaLista(r: { left: number; top: number; bottom: number; width: number }, v: Vista): PosicaoLista {
  const baixo = v.top + v.height - r.bottom - FOLGA - MARGEM;
  const cima = r.top - v.top - FOLGA - MARGEM;
  const paraCima = baixo < Math.min(ALTURA_MAX, 200) && cima > baixo;
  // nunca mais alta do que o espaço real da área visível (a 400% de zoom ou com o teclado virtual); nunca fora do ecrã na horizontal
  const espaco = Math.max(0, paraCima ? cima : baixo);
  const vw = v.layoutWidth ?? (typeof window !== "undefined" ? window.innerWidth : r.left + r.width + MARGEM);
  const largura = Math.max(0, Math.min(r.width, vw - 2 * MARGEM));
  const esquerda = Math.max(MARGEM, Math.min(r.left, vw - MARGEM - largura));
  const base: CSSProperties = { position: "fixed", left: esquerda, width: largura, maxHeight: Math.min(ALTURA_MAX, espaco), zIndex: Z_LISTA_FLUTUANTE };
  return { paraCima, style: paraCima ? { ...base, bottom: v.layoutHeight - r.top + FOLGA } : { ...base, top: r.bottom + FOLGA } };
}

/** O campo saiu da vista: fora da área visível ou da parte visível de um contentor com scroll onde viva. */
export function campoForaDaVista(r: { top: number; bottom: number }, v: Vista, campo: HTMLElement): boolean {
  if (r.bottom <= v.top || r.top >= v.top + v.height) return true;
  for (let el = campo.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(el).overflowY)) continue;
    const c = el.getBoundingClientRect();
    if (r.bottom <= c.top || r.top >= c.bottom) return true;
  }
  return false;
}

const mesma = (a: PosicaoLista, b: PosicaoLista) => a.paraCima === b.paraCima && JSON.stringify(a.style) === JSON.stringify(b.style);

/** O contentor da lista, no <body>. `ancora` é o elemento que a lista acompanha (o wrapper do campo). Só se monta enquanto a lista está aberta.
 *  `aoSairDaVista` fecha-a quando o campo deixa de se ver. */
export function ListaFlutuante({ ancora, children, className, aoSairDaVista }: { ancora: RefObject<HTMLElement | null>; children: ReactNode; className?: string; aoSairDaVista?: () => void }) {
  // já medida no primeiro render: a lista existe logo no DOM (o scroll até à opção escolhida, ao abrir, depende disso)
  const [pos, setPos] = useState<PosicaoLista | null>(() => { const el = ancora.current; return el ? posicaoDaLista(el.getBoundingClientRect(), vistaAtual()) : null; });
  const sair = useRef(aoSairDaVista);
  sair.current = aoSairDaVista;
  useLayoutEffect(() => {
    let raf = 0;
    const calcular = () => {
      raf = 0;
      const el = ancora.current;
      if (!el) return;
      const r = el.getBoundingClientRect(), v = vistaAtual();
      if (campoForaDaVista(r, v, el)) { sair.current?.(); return; }
      const nova = posicaoDaLista(r, v);
      setPos((p) => (p && mesma(p, nova) ? p : nova)); // só renderiza se mudou
    };
    const agendar = () => { if (!raf) raf = requestAnimationFrame(calcular); }; // uma medição por frame, por muitos eventos que haja
    // `capture`: o scroll não borbulha, mas apanha-se o de qualquer contentor com scroll onde o campo viva
    window.addEventListener("scroll", agendar, true);
    window.addEventListener("resize", agendar);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", agendar);
    vv?.addEventListener("scroll", agendar);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", agendar, true);
      window.removeEventListener("resize", agendar);
      vv?.removeEventListener("resize", agendar);
      vv?.removeEventListener("scroll", agendar);
    };
  }, [ancora]);
  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    // pointer-events-auto: dentro de um diálogo modal o <body> pode ter pointer-events: none
    <div data-lista-flutuante="" data-para-cima={pos.paraCima ? "" : undefined} style={pos.style} onMouseDown={(e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.("input")) e.preventDefault(); }}
      className={cn("pointer-events-auto overflow-auto rounded-xl border border-border bg-popover p-1 shadow-lg motion-safe:animate-in motion-safe:fade-in-0", className)}>
      {children}
    </div>,
    document.body,
  );
}
