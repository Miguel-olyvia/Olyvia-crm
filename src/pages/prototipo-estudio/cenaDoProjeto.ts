// 12/11: o 3D de uma planta do Estúdio do projeto (a cena da Vista3D), à parte para o Estúdio da obra o usar também (sem carregar o
// Estúdio do projeto). Veio de EstudioProjeto.tsx, igual.
import { PECAS, cantos, type PecaPlanta, type Planta, type TipoPeca } from "@/emylia/planta";
import { produto } from "./catalogoFake";
import { alturaFinalCm, type Projeto } from "./necessidadesEstudio";
import type { Cena } from "./geometria3d";

/** Cores e alturas no 3D de cada peça, sem produto escolhido. */
export const SEM_PRODUTO: Record<TipoPeca, { cor: string; z0: number; z1: number }> = {
  base: { cor: "#f4f4f2", z0: 0, z1: 3 }, banheira: { cor: "#f4f4f2", z0: 0, z1: 55 }, sanita: { cor: "#f4f4f2", z0: 0, z1: 78 },
  bide: { cor: "#f4f4f2", z0: 0, z1: 40 }, movel: { cor: "#e8e3da", z0: 0, z1: 85 }, coluna: { cor: "#e8e3da", z0: 30, z1: 190 },
  espelho: { cor: "#cfe6ef", z0: 110, z1: 180 }, toalheiro: { cor: "#bfc3c7", z0: 90, z1: 170 }, porta: { cor: "#8a6a4a", z0: 0, z1: 205 },
  janela: { cor: "#bfe3f5", z0: 110, z1: 200 },
  bancada: { cor: "#e8e3da", z0: 0, z1: 90 }, lava: { cor: "#c9ccd0", z0: 85, z1: 92 }, placa: { cor: "#2f3136", z0: 88, z1: 92 },
  forno: { cor: "#9aa0a6", z0: 0, z1: 60 }, frigorifico: { cor: "#d9dcdf", z0: 0, z1: 200 }, maquina: { cor: "#c9ccd0", z0: 0, z1: 85 },
  exaustor: { cor: "#9aa0a6", z0: 150, z1: 210 }, armario: { cor: "#e8e3da", z0: 0, z1: 210 },
};

/** O 3D de uma planta: as paredes com a cor do revestimento, o chão com a do pavimento, e cada peça com a cor e a altura do produto. */
export function cenaDe(pl: Planta, p: Projeto, comProdutos: boolean): Cena {
  return {
    chao: cantos(pl.paredes, pl.o).slice(0, -1),
    altura: alturaFinalCm(comProdutos ? p.alturas : { peDireito: p.alturas.peDireito, tetoFalso: null }),
    corParede: (comProdutos && produto(p.revestimento)?.hex) || "#e9e6df",
    corChao: (comProdutos && produto(p.pavimento)?.hex) || "#cdc6ba",
    caixas: pl.pecas.flatMap((pc) => {
      const prod = comProdutos ? produto(p.escolhas[pc.id]) : undefined, s = SEM_PRODUTO[pc.tipo];
      const caixa = { id: pc.id, x: pc.x, y: pc.y, w: pc.w, h: pc.h, z0: prod?.z0 ?? s.z0, z1: prod?.z1 ?? s.z1, cor: prod?.hex ?? s.cor, nome: prod?.n ?? PECAS[pc.tipo].n,
        vidro: pc.tipo === "janela", naParede: ["porta", "janela", "espelho", "toalheiro"].includes(pc.tipo), rot: pc.rot };
      const resguardo = comProdutos && pc.tipo === "base" ? produto(p.acompanha[pc.id]?.resguardo) : undefined;
      return resguardo ? [caixa, { ...resguardoRodado(pc, ladoAberto(pc, pl)), id: `${pc.id}-resguardo`, z0: 3, z1: 200, cor: "#cfe9f3", nome: resguardo.n, vidro: true }] : [caixa];
    }),
  };
}

/** 11/11: numa base rodada, o resguardo roda com ela (o meio da placa gira em torno do meio da base). */
function resguardoRodado(pc: PecaPlanta, r: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number; rot?: number } {
  if (!pc.rot) return r;
  const a = (pc.rot * Math.PI) / 180, cx = pc.x + pc.w / 2, cy = pc.y + pc.h / 2, mx = r.x + r.w / 2 - cx, my = r.y + r.h / 2 - cy;
  const nx = cx + mx * Math.cos(a) - my * Math.sin(a), ny = cy + mx * Math.sin(a) + my * Math.cos(a);
  return { x: nx - r.w / 2, y: ny - r.h / 2, w: r.w, h: r.h, rot: pc.rot };
}

/** O lado da base virado para o meio da divisão (onde fica o resguardo), como uma placa de 2 cm. */
function ladoAberto(pc: PecaPlanta, pl: Planta): { x: number; y: number; w: number; h: number } {
  const pts = cantos(pl.paredes, pl.o).slice(0, -1);
  const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length, cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
  const lados = [
    { d: Math.hypot(pc.x + pc.w / 2 - cx, pc.y - cy), r: { x: pc.x, y: pc.y, w: pc.w, h: 2 } },
    { d: Math.hypot(pc.x + pc.w / 2 - cx, pc.y + pc.h - cy), r: { x: pc.x, y: pc.y + pc.h - 2, w: pc.w, h: 2 } },
    { d: Math.hypot(pc.x - cx, pc.y + pc.h / 2 - cy), r: { x: pc.x, y: pc.y, w: 2, h: pc.h } },
    { d: Math.hypot(pc.x + pc.w - cx, pc.y + pc.h / 2 - cy), r: { x: pc.x + pc.w - 2, y: pc.y, w: 2, h: pc.h } },
  ];
  return lados.sort((a, b) => a.d - b.d)[0].r;
}

