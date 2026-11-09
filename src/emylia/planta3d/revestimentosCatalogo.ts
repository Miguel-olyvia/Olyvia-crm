// Protótipo (visualizador 3D): PAVIMENTOS e REVESTIMENTOS DE PAREDE como produtos do catálogo (demonstração): uma família por produto, com
// variantes de cor (como as famílias de torneiras e lava-loiças), a textura procedural (desenhada num canvas no visualizador, à escala real),
// e um preço por m². O id de uma variante é «família:variante» e serve onde servia o id dos revestimentos antigos (revestimentos.ts).
import type { Revestimento, Superficie, TipoRevestimento } from "./revestimentos";
import { cantos, type Planta } from "../planta";

export interface VarianteRev { id: string; nome: string; cor: string; junta?: string }
export interface ProdutoRev {
  id: string; nome: string; superficie: Superficie; textura: TipoRevestimento;
  /** a escala real (m): o lado da peça (60×60 → 0,6), a altura do azulejo metro (7,5 × 15 → 0,075), a largura da tábua ou da ripa */
  modulo: number; precoM2: number; variantes: VarianteRev[];
}
const V = (id: string, nome: string, cor: string, junta?: string): VarianteRev => ({ id, nome, cor, ...(junta ? { junta } : {}) });

export const PRODUTOS_REV: ProdutoRev[] = [
  // pavimentos
  { id: "ceramico60", nome: "Cerâmico 60×60 liso (demo)", superficie: "pavimento", textura: "azulejo", modulo: 0.6, precoM2: 24, variantes: [V("claro", "Claro", "#d9d6cf", "#b8b4ab"), V("cinza", "Cinza", "#a3a4a2", "#86878a"), V("antracite", "Antracite", "#55595f", "#3f4348"), V("bege", "Bege", "#cbb99c", "#ab9b80")] },
  { id: "ceramico_madeira", nome: "Cerâmico efeito madeira 20×120 (demo)", superficie: "pavimento", textura: "madeira", modulo: 0.2, precoM2: 32, variantes: [V("carvalho", "Carvalho claro", "#c9a77c"), V("nogueira", "Nogueira", "#7a5434"), V("cinza", "Cinza", "#9a958d")] },
  { id: "espinha", nome: "Vinílico espinha (demo)", superficie: "pavimento", textura: "espinha", modulo: 0.09, precoM2: 38, variantes: [V("natural", "Carvalho natural", "#b8925f"), V("mel", "Mel", "#a77a44")] },
  { id: "microcimento_chao", nome: "Microcimento (demo)", superficie: "pavimento", textura: "microcimento", modulo: 1.2, precoM2: 65, variantes: [V("claro", "Cinza claro", "#bdbbb6"), V("escuro", "Cinza escuro", "#6e6d6a"), V("areia", "Areia", "#c9b89c")] },
  { id: "pedra", nome: "Pedra natural 40×60 (demo)", superficie: "pavimento", textura: "pedra", modulo: 0.5, precoM2: 78, variantes: [V("travertino", "Travertino", "#d8c8a8", "#bba985"), V("ardosia", "Ardósia", "#4f5459", "#3a3e42")] },
  { id: "hexagonal", nome: "Mosaico hexagonal (demo)", superficie: "pavimento", textura: "hexagonal", modulo: 0.2, precoM2: 45, variantes: [V("branco", "Branco", "#efeee9", "#bdbcb6"), V("cinza", "Cinza", "#9da0a2", "#77797b")] },
  { id: "flutuante", nome: "Flutuante (demo)", superficie: "pavimento", textura: "madeira", modulo: 0.19, precoM2: 18, variantes: [V("faia", "Faia", "#d2ae83"), V("wenge", "Wengé", "#4a3626")] },
  // paredes
  { id: "tinta", nome: "Tinta lisa (demo)", superficie: "parede", textura: "tinta", modulo: 1, precoM2: 9, variantes: [V("branco", "Branco", "#f2f1ed"), V("offwhite", "Off-white", "#ece6da"), V("cinza", "Cinza", "#c9ccd0"), V("salva", "Verde-salva", "#a9bfae"), V("azul", "Azul", "#8fa9c3"), V("terracota", "Terracota", "#c47e5e")] },
  { id: "metro", nome: "Azulejo metro 7,5×15 (demo)", superficie: "parede", textura: "metro", modulo: 0.075, precoM2: 36, variantes: [V("branco", "Branco", "#f4f4f2", "#cfcfcb"), V("cinza", "Cinza", "#b7babb", "#8e9192"), V("verde", "Verde", "#7f9e8a", "#e3e8e4")] },
  { id: "azulejo20", nome: "Azulejo 20×20 (demo)", superficie: "parede", textura: "azulejo", modulo: 0.2, precoM2: 28, variantes: [V("branco", "Branco", "#f4f4f2", "#cfcfcb"), V("preto", "Preto", "#26282a", "#8a8c8e")] },
  { id: "microcimento_parede", nome: "Microcimento de parede (demo)", superficie: "parede", textura: "microcimento", modulo: 1.2, precoM2: 55, variantes: [V("claro", "Cinza claro", "#c4c2bd"), V("areia", "Areia", "#cdbda2")] },
  { id: "painel3d", nome: "Pedra / painel 3D (demo)", superficie: "parede", textura: "pedra", modulo: 0.3, precoM2: 62, variantes: [V("calcario", "Calcário", "#d6cdbb", "#b3a990"), V("grafite", "Grafite", "#5a5d61", "#43464a")] },
  { id: "papel", nome: "Papel de parede (demo)", superficie: "parede", textura: "riscas", modulo: 0.12, precoM2: 22, variantes: [V("riscas", "Riscas", "#e8e2d6", "#c9bfae"), V("geometrico", "Geométrico", "#dfe3e0", "#9db0a6")] },
  { id: "ripado", nome: "Madeira ripada (demo)", superficie: "parede", textura: "ripado", modulo: 0.06, precoM2: 85, variantes: [V("carvalho", "Carvalho", "#b98e5c"), V("nogueira", "Nogueira", "#6e4a2e")] },
];

export const produtosRevDe = (s: Superficie): ProdutoRev[] => PRODUTOS_REV.filter((p) => p.superficie === s);

/** Pé-direito para as áreas de parede das linhas de venda (a planta não o guarda; o painel 3D usa o do negócio). */
const PE_VENDA = 2.6;
export interface LinhaRev { id: string; nome: string; m2: number; preco: number }
/**
 * As linhas de venda dos revestimentos escolhidos como produtos: o pavimento (área do chão) e cada revestimento de parede (a área das paredes
 * que o levam: as de destaque à parte). Áreas brutas (sem descontar portas e janelas), em m², com o pé-direito de venda.
 */
export function linhasDosRevestimentos(planta: Planta): LinhaRev[] {
  const r = planta.rev; if (!r || planta.paredes.length < 3) return [];
  const pts = cantos(planta.paredes, planta.o).slice(0, -1).map((q) => ({ x: q.x / 100, y: q.y / 100 }));
  const chao = Math.abs(pts.reduce((s, a, i) => { const b = pts[(i + 1) % pts.length]; return s + a.x * b.y - b.x * a.y; }, 0)) / 2;
  const compr = pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; return Math.hypot(b.x - a.x, b.y - a.y); });
  const linhas: LinhaRev[] = [];
  const junta = (id: string | undefined, m2: number) => {
    const v = id ? revestimentoDoCatalogo(id) : undefined; if (!v || m2 <= 0) return;
    const l = linhas.find((x) => x.id === v.id);
    if (l) { l.m2 += m2; l.preco = Math.round(l.m2 * v.precoM2 * 100) / 100; } else linhas.push({ id: v.id, nome: v.nome, m2, preco: Math.round(m2 * v.precoM2 * 100) / 100 });
  };
  junta(r.pavimento, chao);
  compr.forEach((c, i) => junta(r.porParede?.[`p${i + 1}`] ?? r.parede, c * PE_VENDA));
  return linhas.map((l) => ({ ...l, m2: Math.round(l.m2 * 100) / 100 }));
}
/** Uma variante pelo id «família:variante» (ou undefined). O papel «geométrico» desenha-se com o padrão geométrico em vez das riscas. */
export function revestimentoDoCatalogo(id: string): (Revestimento & { precoM2: number; produto: string }) | undefined {
  const [f, v] = id.split(":"), p = PRODUTOS_REV.find((x) => x.id === f), va = p?.variantes.find((x) => x.id === v);
  if (!p || !va) return undefined;
  return { id, nome: `${p.nome.replace(" (demo)", "")} · ${va.nome}`, tipo: p.id === "papel" && va.id === "geometrico" ? "geometrico" : p.textura, cor: va.cor, junta: va.junta, modulo: p.modulo, precoM2: p.precoM2, produto: p.nome };
}
