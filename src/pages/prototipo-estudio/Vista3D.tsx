// 5/11 (Rúben: «a planta em 2D vira para 3D: é isto que você queria»). O desenho do 3D (a geometria é geometria3d.ts): arrastar roda e inclina,
// os botões rodam de 45 em 45 graus, as paredes da frente cortam-se para se ver lá dentro, e a apresentação ao cliente roda sozinha.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Eye, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { projetar, type Cena } from "./geometria3d";

const BOTAO = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export function Vista3D({ cena, sozinha = false, escuro = false, titulo = "Vista 3D", className }: { cena: Cena; sozinha?: boolean; escuro?: boolean; titulo?: string; className?: string }) {
  const [rumo, setRumo] = useState(-0.65);
  const [inc, setInc] = useState(0.62);
  const [cortar, setCortar] = useState(true);
  const [aMexer, setAMexer] = useState(false);
  const arrasto = useRef<{ x: number; y: number; r: number; i: number } | null>(null);

  // a apresentação roda devagar sozinha (e pára enquanto alguém mexe; e para quem pediu menos movimento)
  useEffect(() => {
    if (!sozinha || aMexer || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let id = 0, antes = performance.now();
    const passo = (t: number) => { setRumo((r) => r + (t - antes) * 0.00012); antes = t; id = requestAnimationFrame(passo); };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [sozinha, aMexer]);

  const { faces, caixa } = projetar(cena, rumo, inc, cortar);
  const m = Math.max(caixa.w, caixa.h) * 0.08;
  const comecar = (e: RPointerEvent<SVGSVGElement>) => { e.currentTarget.setPointerCapture?.(e.pointerId); arrasto.current = { x: e.clientX, y: e.clientY, r: rumo, i: inc }; setAMexer(true); };
  const mover = (e: RPointerEvent<SVGSVGElement>) => {
    const a = arrasto.current; if (!a) return;
    setRumo(a.r + (e.clientX - a.x) * 0.01);
    setInc(Math.max(0.25, Math.min(1.35, a.i + (e.clientY - a.y) * 0.005)));
  };
  const largar = () => { arrasto.current = null; setAMexer(false); };
  const corBotao = escuro ? "border-white/20 bg-white/5 text-white hover:bg-white/10" : "border-input bg-background hover:bg-accent";

  return (
    <div className={cn("space-y-3", className)}>
      <div className={cn("overflow-hidden rounded-2xl border", escuro ? "border-white/10 bg-gradient-to-b from-slate-800 to-slate-950" : "border-border bg-gradient-to-b from-slate-50 to-slate-200")}>
        <svg viewBox={`${caixa.x - m} ${caixa.y - m} ${caixa.w + 2 * m} ${caixa.h + 2 * m}`} className="block h-auto max-h-[70vh] w-full cursor-grab touch-none select-none active:cursor-grabbing"
          role="img" aria-label={`${titulo}: arraste para rodar e inclinar.`} onPointerDown={comecar} onPointerMove={mover} onPointerUp={largar} onPointerCancel={largar}>
          {faces.map((f, i) => (
            <polygon key={i} points={f.pts.map((p) => p.join(",")).join(" ")} fill={f.cor} fillOpacity={f.opacidade ?? 1}
              stroke={f.tipo === "chao" ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.18)"} strokeWidth={Math.max(caixa.w, caixa.h) / 900} strokeLinejoin="round">
              {f.nome && <title>{f.nome}</title>}
            </polygon>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={cn(BOTAO, corBotao)} aria-label="Rodar para a esquerda" onClick={() => setRumo((r) => r - Math.PI / 4)}><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" className={cn(BOTAO, corBotao)} aria-label="Rodar para a direita" onClick={() => setRumo((r) => r + Math.PI / 4)}><RotateCw className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" className={cn(BOTAO, corBotao)} aria-pressed={!cortar} onClick={() => setCortar((c) => !c)}>
          <Eye className="h-4 w-4" aria-hidden="true" />{cortar ? "Paredes inteiras" : "Cortar as da frente"}
        </button>
        <span className={cn("text-sm", escuro ? "text-white/60" : "text-muted-foreground")}>Arraste para rodar e inclinar.</span>
      </div>
    </div>
  );
}
