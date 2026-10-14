// O preenchimento rápido das Necessidades no terreno (14/10/2026): os modelos rápidos ("Remodelação completa",
// "Só louças", "Só pavimento e paredes") com o desfazer, a resposta sugerida das trocas, o passo onde se ficou e a
// divisão dos serviços e dos produtos pelas 4 fases da obra (fasesObra.ts). Funções puras, sem React.
import { type Negocio, type SvcId } from "./motor";
import { type TileServico } from "./necessidades";
import { type Obrigacao } from "./produtosVisita";
import { FASES_OBRA, faseDoProduto, fasesDoServico, type ComFases, type FaseObra } from "./fasesObra";

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ------------------------------------------------------------------ modelos rápidos */
export interface ModeloRapido { id: string; nome: string; desc: string; quer: (t: TileServico) => boolean }
/** Os modelos rápidos do primeiro passo: cada um diz que serviços do pacote ficam ligados (os outros desligam-se). */
export const MODELOS_RAPIDOS: ModeloRapido[] = [
  { id: "completa", nome: "Remodelação completa", desc: "Tudo o que as medidas pedem", quer: () => true },
  { id: "loucas", nome: "Só louças", desc: "Troca de louças e torneiras", quer: (t) => /louc|sanit|lavator|torneir|base de duche|banheir/.test(sem(t.n)) },
  { id: "pav-par", nome: "Só pavimento e paredes", desc: "Revestimentos de chão e parede", quer: (t) => /paviment|revest|parede|azulej|ceramic/.test(sem(t.n)) },
];

/** Os serviços do pacote que um modelo liga ou desliga (só os que têm medida: os outros não se podem ligar). */
export function mudancasDoModelo(tiles: TileServico[], m: ModeloRapido): SvcId[] {
  return tiles.filter((t) => t.origem === "pacote" && !t.semMedida && t.on !== m.quer(t)).map((t) => t.sid);
}
/** O modelo que já está aplicado (o estado do pacote bate com ele), para o mostrar escolhido. */
export function modeloAtual(tiles: TileServico[]): string | null {
  const pac = tiles.filter((t) => t.origem === "pacote" && !t.semMedida);
  if (!pac.length) return null;
  return MODELOS_RAPIDOS.find((m) => pac.some((t) => m.quer(t)) && mudancasDoModelo(tiles, m).length === 0)?.id ?? null;
}
/**
 * Aplica um modelo: troca o estado dos serviços do pacote que não batem (A.servico liga e desliga). Devolve os que
 * mudaram: desfazer é voltar a trocar esses mesmos (desfazerModelo).
 */
export function aplicarModelo(A: { servico: (id: number, sid: SvcId) => void }, d: Negocio, tiles: TileServico[], m: ModeloRapido): SvcId[] {
  const muda = mudancasDoModelo(tiles, m);
  for (const sid of muda) A.servico(d.id, sid);
  return muda;
}
export function desfazerModelo(A: { servico: (id: number, sid: SvcId) => void }, d: Negocio, mudados: SvcId[]) {
  for (const sid of mudados) A.servico(d.id, sid);
}

/* ------------------------------------------------------------------ a resposta sugerida das trocas */
/**
 * A resposta mais provável de uma troca (destacada, nunca escolhida): com demolição ligada, o que lá está sai, e a
 * sugestão é "Troca"; sem demolição, "Mantém". Devolve também a razão, para o comercial perceber porquê.
 */
export function sugestaoTroca(tiles: TileServico[]): { r: "sim" | "nao"; porque: string } {
  const demole = tiles.some((t) => t.on && /demol/.test(sem(t.n)));
  return demole ? { r: "nao", porque: "Com demolição, costuma trocar-se" } : { r: "sim", porque: "Sem demolição, costuma manter-se" };
}

/* ------------------------------------------------------------------ o passo onde se ficou */
const CHAVE = (id: number) => `olyvia.necessidades.passo.${id}`;
/** O passo onde se ficou nesta visita (guardado no browser; sem acesso, null). */
export function lerPassoGuardado(id: number): string | null {
  try { return window.localStorage.getItem(CHAVE(id)); } catch { return null; }
}
export function guardarPasso(id: number, k: string) {
  try { window.localStorage.setItem(CHAVE(id), k); } catch { /* sem armazenamento: abre pelas regras */ }
}

/* ------------------------------------------------------------------ as fases da obra */
export interface GrupoFase<T> { fase: FaseObra; nome: string; itens: T[] }
/** Junta os itens pela fase (1 → 4), mantendo a ordem de cada fase; as fases sem itens saem. */
export function porFase<T>(itens: T[], fase: (x: T) => FaseObra): GrupoFase<T>[] {
  const g = new Map<FaseObra, T[]>();
  for (const x of itens) { const f = fase(x); (g.get(f) ?? g.set(f, []).get(f)!).push(x); }
  return FASES_OBRA.filter((f) => g.has(f.n)).map((f) => ({ fase: f.n, nome: `Fase ${f.n} · ${f.curto}`, itens: g.get(f.n)! }));
}
/** As fases de um serviço (cartão): a primeira manda no grupo; as outras dizem-se ("também na fase 3"). */
export const fasesDoTile = (K: ComFases | null | undefined, t: Pick<TileServico, "sid" | "n" | "oficio">) => fasesDoServico(K, t.sid, t.n, t.oficio);
export const textoOutrasFases = (fs: FaseObra[]) =>
  fs.length > 1 ? `também na fase ${fs.slice(1).join(fs.length > 2 ? ", " : " e ")}`.replace(/, (\d)$/, " e $1") : "";

/** As trocas pela ordem das fases (primeiro as da fase mais cedo); empate: a ordem de antes. */
export function ordenarObrigacoesPorFase(obr: Obrigacao[], fase: (sid: SvcId) => FaseObra): Obrigacao[] {
  return obr.map((o, i) => ({ o, i, f: fase(o.sid) })).sort((a, b) => a.f - b.f || a.i - b.i).map((x) => x.o);
}
export { faseDoProduto, fasesDoServico, FASES_OBRA, type FaseObra, type ComFases };
