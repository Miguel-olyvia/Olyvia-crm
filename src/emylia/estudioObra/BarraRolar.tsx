// 25/11 (Rúben, no Gantt do plano vivo): «uma barra horizontal grossa que acompanha o scroll até à base do gráfico, para facilitar a
// navegação». A barra de rolar do browser só aparece no fim do gráfico; esta fica colada ao fundo do ecrã enquanto o gráfico está à
// vista, e mexe no mesmo rolar (arrastar o cursor, clicar na pista, as setas ou o teclado).
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Medidas { sw: number; cw: number; sl: number }

export function BarraRolar({ alvo, rotulo, passo = 120 }: { alvo: React.RefObject<HTMLElement>; rotulo: string; passo?: number }) {
  const [m, setM] = useState<Medidas>({ sw: 0, cw: 0, sl: 0 });
  const pista = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const puxar = useRef<{ x: number; sl: number; k: number } | null>(null);
  const [aPuxar, setAPuxar] = useState(false);

  useEffect(() => {
    const el = alvo.current;
    if (!el) return;
    const ler = () => setM((o) => (o.sw === el.scrollWidth && o.cw === el.clientWidth && o.sl === el.scrollLeft ? o : { sw: el.scrollWidth, cw: el.clientWidth, sl: el.scrollLeft }));
    ler();
    el.addEventListener("scroll", ler, { passive: true });
    window.addEventListener("resize", ler);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(ler) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => { el.removeEventListener("scroll", ler); window.removeEventListener("resize", ler); ro?.disconnect(); };
  }, [alvo]);

  const max = m.sw - m.cw;
  if (max <= 1) return null; // cabe tudo: não há para onde rolar

  const ir = (sl: number, suave = false) => {
    const el = alvo.current;
    if (!el) return;
    const v = Math.max(0, Math.min(max, sl));
    if (suave && typeof el.scrollTo === "function") el.scrollTo({ left: v, behavior: "smooth" });
    else el.scrollLeft = v;
    setM((o) => ({ ...o, sl: v })); // o evento de scroll confirma; aqui já se mostra
  };
  const larg = Math.max(8, (m.cw / m.sw) * 100);
  const esq = (m.sl / max) * (100 - larg);
  const pct = Math.round((m.sl / max) * 100);

  return (
    <div className="sticky bottom-0 z-30 flex items-center gap-2 rounded-b-2xl border-t border-border bg-card/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <button type="button" aria-label="Rolar para trás" onClick={() => ir(m.sl - m.cw * 0.6, true)} disabled={m.sl <= 0}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30">
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <div ref={pista} role="scrollbar" aria-orientation="horizontal" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} tabIndex={0}
        className="relative h-4 flex-1 cursor-pointer touch-none rounded-full bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        onPointerDown={(e) => {
          if (e.target === cursor.current) return; // o cursor trata do seu arrasto
          const c = cursor.current?.getBoundingClientRect();
          if (!c) return;
          ir(e.clientX < c.left ? m.sl - m.cw * 0.9 : m.sl + m.cw * 0.9, true);
        }}
        onKeyDown={(e) => {
          const k: Record<string, number> = { ArrowLeft: m.sl - passo, ArrowRight: m.sl + passo, PageUp: m.sl - m.cw * 0.9, PageDown: m.sl + m.cw * 0.9, Home: 0, End: max };
          if (!(e.key in k)) return;
          e.preventDefault();
          ir(k[e.key]);
        }}>
        <div ref={cursor} aria-hidden="true"
          className={cn("absolute inset-y-0 cursor-grab rounded-full transition-colors", aPuxar ? "cursor-grabbing bg-primary" : "bg-foreground/30 hover:bg-foreground/45")}
          style={{ left: `${esq}%`, width: `${larg}%` }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* segue o rato na mesma */ }
            const W = pista.current?.clientWidth ?? 0, w = e.currentTarget.clientWidth;
            puxar.current = { x: e.clientX, sl: m.sl, k: W - w > 0 ? max / (W - w) : 0 };
            setAPuxar(true);
          }}
          onPointerMove={(e) => { const p = puxar.current; if (p) ir(p.sl + (e.clientX - p.x) * p.k); }}
          onPointerUp={() => { puxar.current = null; setAPuxar(false); }}
          onPointerCancel={() => { puxar.current = null; setAPuxar(false); }} />
      </div>
      <button type="button" aria-label="Rolar para a frente" onClick={() => ir(m.sl + m.cw * 0.6, true)} disabled={m.sl >= max}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30">
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
