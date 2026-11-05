// 5/11 (Rúben, a visita real: «reconstruir tudo o que está em papel, a planta da área»). O croqui da folha, no ecrã: as paredes à volta
// com o comprimento em cm, as peças lá dentro (arrastam-se com o dedo ou com as setas), e os m² do chão e das paredes que vão para as
// medidas com um toque. A planta grava-se no negócio (f.planta, JSON). A geometria está em planta.ts.
import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { Check, Plus, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { porMedida, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import {
  PECAS, PLANTA_VAZIA, areaChaoM2, areaParedesM2, cantos, emL, faltaFechar, gravarPlanta, juntarPeca, lerPlanta, limites, peDireitoDoCampo,
  retangulo, type Parede, type PecaPlanta, type Planta, type TipoPeca,
} from "./planta";

const INP = "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const CHIP = "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const chip = (ligado: boolean) => cn(CHIP, ligado ? "border-primary bg-primary/10 font-medium ring-1 ring-primary" : "border-input bg-background hover:bg-accent");
const PASSO = 5; // cm: as peças andam de 5 em 5
const PE_DIREITO_SEM_RESPOSTA = 2.5;
const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
const arred = (n: number) => Math.round(n / PASSO) * PASSO;

export function PlantaDivisao({ ctx, d, divisao }: { ctx: Ctx; d: Negocio; divisao?: string }) {
  const id = useId();
  const [p, setP] = useState<Planta>(() => lerPlanta(d.f.planta) ?? PLANTA_VAZIA);
  const [sel, setSel] = useState<string | null>(null);
  const [feito, setFeito] = useState("");
  const svg = useRef<SVGSVGElement>(null);
  const arrasto = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const contador = useRef(p.pecas.length);

  const gravar = (nova: Planta) => { setP(nova); setFeito(""); ctx.A.campo(d.id, "planta", gravarPlanta(nova)); };
  const mudarParede = (i: number, parcial: Partial<Parede>) => gravar({ ...p, paredes: p.paredes.map((x, j) => (j === i ? { ...x, ...parcial } : x)) });
  const mudarPeca = (pid: string, parcial: Partial<PecaPlanta>, guardar = true) => {
    const nova = { ...p, pecas: p.pecas.map((x) => (x.id === pid ? { ...x, ...parcial } : x)) };
    if (guardar) gravar(nova); else setP(nova);
  };

  const falta = faltaFechar(p.paredes);
  const chao = areaChaoM2(p.paredes);
  const peCampo = peDireitoDoCampo(d.f.diag_pe_direito_m);
  const pe = peCampo ?? PE_DIREITO_SEM_RESPOSTA;
  const paredes = areaParedesM2(p, pe);
  const b = limites(p.paredes);
  const margem = Math.max(b.w, b.h) * 0.12 + 20;
  const vb = `${b.x - margem} ${b.y - margem} ${b.w + 2 * margem} ${b.h + 2 * margem}`;
  const pts = cantos(p.paredes);
  const letra = Math.max(b.w, b.h) / 22;
  const selecionada = p.pecas.find((x) => x.id === sel) ?? null;

  const pontoSvg = (e: RPointerEvent): { x: number; y: number } | null => {
    const m = svg.current?.getScreenCTM();
    if (!svg.current || !m) return null;
    const pt = svg.current.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const r = pt.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  };
  const comecar = (e: RPointerEvent, pc: PecaPlanta) => {
    const q = pontoSvg(e); if (!q) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    arrasto.current = { id: pc.id, dx: q.x - pc.x, dy: q.y - pc.y };
    setSel(pc.id);
  };
  const mover = (e: RPointerEvent) => {
    const a = arrasto.current, q = a && pontoSvg(e); if (!a || !q) return;
    mudarPeca(a.id, { x: arred(q.x - a.dx), y: arred(q.y - a.dy) }, false);
  };
  const largar = () => { if (!arrasto.current) return; arrasto.current = null; gravar(p); };
  const teclas = (e: KeyboardEvent, pc: PecaPlanta) => {
    const passo = e.shiftKey ? 25 : PASSO;
    const mov: Record<string, [number, number]> = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] };
    const m = mov[e.key]; if (!m) return;
    e.preventDefault();
    mudarPeca(pc.id, { x: pc.x + m[0], y: pc.y + m[1] });
  };

  const usarNasMedidas = () => {
    if (chao === null) return;
    ctx.run(() => {
      porMedida(d.visita.med, "pav", chao);
      if (paredes !== null) porMedida(d.visita.med, "par", paredes);
    });
    setFeito(`Nas medidas: chão ${nf(chao)} m²${paredes !== null ? ` e paredes ${nf(paredes)} m²` : ""}.`);
  };

  const formas = useMemo(() => {
    const largura = p.paredes[0]?.c || 200, fundo = p.paredes[1]?.c || 150;
    return { ret: retangulo(largura, fundo), l: emL(largura, fundo, Math.round(largura / 3), Math.round(fundo / 3)) };
  }, [p.paredes]);

  return (
    <div className="space-y-5">
      <p className="text-[15px] text-muted-foreground">
        A planta{divisao ? ` da ${divisao.toLowerCase()}` : ""}, como na folha: as paredes à volta, a começar no canto de cima à esquerda, e as peças lá dentro.
      </p>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Forma da divisão">
        <button type="button" className={chip(false)} onClick={() => gravar({ ...p, paredes: formas.ret })}>Retângulo</button>
        <button type="button" className={chip(false)} onClick={() => gravar({ ...p, paredes: formas.l })}>Em L</button>
      </div>

      {/* o desenho: as paredes com as medidas e as peças (arrastar com o dedo; com o teclado, as setas) */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <svg ref={svg} viewBox={vb} className="block h-auto max-h-[60vh] w-full touch-none select-none" role="img"
          aria-label={`Planta: ${p.paredes.map((x) => `${x.c} cm`).join(", ")}${chao !== null ? `; chão ${nf(chao)} m²` : ""}`}
          onPointerMove={mover} onPointerUp={largar} onPointerCancel={largar} onClick={(e) => { if (e.target === svg.current) setSel(null); }}>
          <polygon points={pts.slice(0, falta > 1 ? undefined : -1).map((q) => `${q.x},${q.y}`).join(" ")} className={cn("stroke-foreground", falta > 1 ? "fill-none" : "fill-primary/[0.04]")}
            strokeWidth={letra / 4} strokeLinejoin="round" fill={falta > 1 ? "none" : undefined} />
          {falta > 1 && <line x1={pts[pts.length - 1].x} y1={pts[pts.length - 1].y} x2={0} y2={0} className="stroke-destructive" strokeWidth={letra / 6} strokeDasharray={`${letra / 2} ${letra / 2}`} />}
          {p.paredes.map((w, i) => {
            const a = pts[i], z = pts[i + 1];
            const mx = (a.x + z.x) / 2, my = (a.y + z.y) / 2;
            const horiz = Math.abs(z.x - a.x) > Math.abs(z.y - a.y);
            return (
              <text key={i} x={mx + (horiz ? 0 : letra * 1.6 * Math.sign(z.y - a.y || 1))} y={my + (horiz ? -letra * 0.7 * Math.sign(z.x - a.x || 1) : letra / 3)}
                textAnchor="middle" fontSize={letra} className="fill-foreground font-semibold">{w.c}</text>
            );
          })}
          {p.pecas.map((pc) => (
            <g key={pc.id} role="button" tabIndex={0} aria-label={`${PECAS[pc.tipo].n}, ${pc.w} por ${pc.h} cm. Setas para mover.`} aria-pressed={sel === pc.id}
              onPointerDown={(e) => comecar(e, pc)} onKeyDown={(e) => teclas(e, pc)} onFocus={() => setSel(pc.id)} className="cursor-grab outline-none">
              <rect x={pc.x} y={pc.y} width={pc.w} height={pc.h} rx={Math.min(pc.w, pc.h) / 8}
                className={cn(PECAS[pc.tipo].abertura ? "fill-amber-200 stroke-amber-700" : "fill-primary/15 stroke-primary", sel === pc.id && "stroke-[3]")}
                strokeWidth={sel === pc.id ? letra / 4 : letra / 8} />
              <text x={pc.x + pc.w / 2} y={pc.y + pc.h / 2 + letra / 3} textAnchor="middle" fontSize={letra * 0.75} className="pointer-events-none fill-foreground">
                {PECAS[pc.tipo].n}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p role="status" className={cn("text-[15px]", falta > 1 ? "text-destructive" : "text-success")}>
        {falta > 1 ? `A planta ainda não fecha: faltam ${falta} cm até ao canto de partida.` : "A planta fecha."}
      </p>

      {/* as paredes, pela ordem do desenho */}
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-[15px] font-semibold">Paredes, em cm</legend>
        {p.paredes.map((w, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="grid w-32 gap-1 text-sm font-medium" htmlFor={`${id}-p${i}`}>Parede {i + 1}
              <input id={`${id}-p${i}`} key={`${i}-${w.c}`} type="number" inputMode="numeric" min={0} defaultValue={w.c} className={INP}
                onBlur={(e) => { const c = Math.max(0, Math.round(Number(e.target.value) || 0)); if (c !== w.c) mudarParede(i, { c }); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            </label>
            {i < p.paredes.length - 1 && (
              <div role="group" aria-label={`Depois da parede ${i + 1}`} className="flex gap-2">
                <button type="button" className={chip(w.vira === "dir")} aria-pressed={w.vira === "dir"} onClick={() => mudarParede(i, { vira: "dir" })}>vira à direita</button>
                <button type="button" className={chip(w.vira === "esq")} aria-pressed={w.vira === "esq"} onClick={() => mudarParede(i, { vira: "esq" })}>à esquerda</button>
              </div>
            )}
            {p.paredes.length > 3 && (
              <Button type="button" variant="ghost" className="min-h-11" aria-label={`Tirar a parede ${i + 1}`} onClick={() => gravar({ ...p, paredes: p.paredes.filter((_x, j) => j !== i) })}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => gravar({ ...p, paredes: [...p.paredes, { c: 50, vira: "dir" }] })}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Juntar parede
          </Button>
        </div>
      </fieldset>

      {/* as peças: juntar, e a selecionada com o tamanho, rodar e tirar */}
      <div className="space-y-3">
        <p className="text-[15px] font-semibold">Peças</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PECAS) as TipoPeca[]).map((t) => (
            <button key={t} type="button" className={chip(false)} onClick={() => { const nid = `pc${++contador.current}`; gravar(juntarPeca(p, t, nid)); setSel(nid); }}>
              <Plus className="h-4 w-4" aria-hidden="true" />{PECAS[t].n}
            </button>
          ))}
        </div>
        {selecionada && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <p className="w-full text-[15px] font-medium">{PECAS[selecionada.tipo].n}</p>
            {(["w", "h"] as const).map((k) => (
              <label key={k} className="grid w-28 gap-1 text-sm font-medium">{k === "w" ? "Largura" : "Fundo"} (cm)
                <input key={`${selecionada.id}-${k}-${selecionada[k]}`} type="number" inputMode="numeric" min={1} defaultValue={selecionada[k]} className={INP}
                  onBlur={(e) => { const n = Math.max(1, Math.round(Number(e.target.value) || 0)); if (n !== selecionada[k]) mudarPeca(selecionada.id, { [k]: n }); }} />
              </label>
            ))}
            <Button type="button" variant="outline" className="min-h-11" onClick={() => mudarPeca(selecionada.id, { w: selecionada.h, h: selecionada.w })}>
              <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Rodar
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => { gravar({ ...p, pecas: p.pecas.filter((x) => x.id !== selecionada.id) }); setSel(null); }}>
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Tirar
            </Button>
          </div>
        )}
      </div>

      {/* o que a planta dá, e passá-lo às medidas */}
      <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px]">
          {chao === null ? "Feche a planta para ver os m²." : <>
            Chão <b>{nf(chao)} m²</b>{paredes !== null && <> · paredes <b>{nf(paredes)} m²</b></>}
            <span className="block text-sm text-muted-foreground">
              Paredes com {nf(pe)} m de pé-direito{peCampo === null ? " (o pé-direito ainda não foi respondido)" : ""}, sem as portas e as janelas da planta.
            </span>
          </>}
        </p>
        <Button type="button" className="min-h-11 shrink-0" disabled={chao === null} onClick={usarNasMedidas}>
          <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Usar nas medidas
        </Button>
      </div>
      <p role="status" className="min-h-5 text-sm text-success">{feito}</p>
    </div>
  );
}
