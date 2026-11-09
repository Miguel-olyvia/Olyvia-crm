// 5/11: a planta só para ver (a ficha da obra e a impressão): as paredes com as medidas, as peças com a cor e o nome do produto, e as que
// saem a tracejado. Para mexer, é o EditorPlanta.
import { PECAS, cantos, faltaFechar, limites, type PecaPlanta, type Planta } from "@/emylia/planta";

export function PlantaVista({ planta, titulo, fantasmas = [], cor, rotulo }: {
  planta: Planta; titulo: string; fantasmas?: readonly PecaPlanta[]; cor?: (pc: PecaPlanta) => string | undefined; rotulo?: (pc: PecaPlanta) => string | undefined;
}) {
  const b = limites({ ...planta, pecas: [...planta.pecas, ...fantasmas] });
  const m = Math.max(b.w, b.h) * 0.16 + 10, letra = Math.max(b.w, b.h) / 22;
  const pts = cantos(planta.paredes, planta.o);
  return (
    <figure className="space-y-2">
      <svg viewBox={`${b.x - m} ${b.y - m} ${b.w + 2 * m} ${b.h + 2 * m}`} className="block h-auto w-full rounded-xl border border-border bg-card" role="img"
        aria-label={`${titulo}: paredes de ${planta.paredes.map((w) => w.c).join(", ")} cm; ${planta.pecas.length} peças.`}>
        {/* 9/11 (Rúben: «paredes na planta diagonais»): a planta que ainda não fecha não se fecha com uma diagonal inventada */}
        {faltaFechar(planta.paredes) <= 1
          ? <polygon points={pts.slice(0, -1).map((q) => `${q.x},${q.y}`).join(" ")} className="fill-primary/[0.05] stroke-foreground" strokeWidth={letra / 4} strokeLinejoin="round" />
          : <polyline points={pts.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" className="stroke-foreground" strokeWidth={letra / 4} strokeLinejoin="round" strokeLinecap="round" />}
        {planta.paredes.map((w, i) => {
          const a = pts[i], z = pts[i + 1], horiz = a.y === z.y, vert = a.x === z.x;
          const s = horiz ? Math.sign(z.x - a.x) || 1 : Math.sign(z.y - a.y) || 1;
          // as diagonais: o número ao lado do meio, para fora (à esquerda de quem anda)
          const len = Math.hypot(z.x - a.x, z.y - a.y) || 1, nx = (z.y - a.y) / len, ny = -(z.x - a.x) / len;
          const x = horiz ? (a.x + z.x) / 2 : vert ? a.x + s * letra * 1.6 : (a.x + z.x) / 2 + nx * letra * 1.2;
          const y = horiz ? a.y - s * letra * 0.7 : vert ? (a.y + z.y) / 2 + letra / 3 : (a.y + z.y) / 2 + ny * letra * 1.2 + letra / 3;
          return <text key={i} x={x} y={y} textAnchor="middle" fontSize={letra * 0.85} className="fill-foreground font-semibold">{Math.round(w.c)}</text>;
        })}
        {fantasmas.map((pc) => (
          <rect key={`f-${pc.id}`} x={pc.x} y={pc.y} width={pc.w} height={pc.h} className="fill-none stroke-destructive/70" strokeWidth={letra / 10} strokeDasharray={`${letra / 3} ${letra / 4}`} />
        ))}
        {planta.pecas.map((pc) => {
          const c = cor?.(pc);
          return (
            <g key={pc.id}>
              <rect x={pc.x} y={pc.y} width={pc.w} height={pc.h} rx={Math.min(pc.w, pc.h) / 8} className={c ? "stroke-foreground/60" : PECAS[pc.tipo].abertura ? "fill-amber-200 stroke-amber-700" : "fill-primary/15 stroke-primary"}
                style={c ? { fill: c } : undefined} strokeWidth={letra / 10} />
              <text x={pc.x + pc.w / 2} y={pc.y + pc.h / 2 + letra / 4} textAnchor="middle" fontSize={letra * 0.55} className="fill-foreground"
                style={c ? { paintOrder: "stroke", stroke: "hsl(var(--card))", strokeWidth: letra / 6 } : undefined}>{rotulo?.(pc) ?? PECAS[pc.tipo].n}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-sm font-medium text-muted-foreground">{titulo}</figcaption>
    </figure>
  );
}
