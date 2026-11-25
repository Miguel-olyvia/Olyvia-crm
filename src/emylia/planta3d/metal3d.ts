// 25/11: o que um METAL precisa no 3D além da rugosidade (aspetoZonas.ts): uma cor de base que não saia desbotada. Puro: sem React nem three.
// A «cor» de uma opção de metal (Cobre #FFBA6B, Ouro, Rosa Gold…) é a amostra de catálogo: pálida, porque tem de se ver bem num quadrado. Num metal a cor de base é a reflectância, e
// um tom claríssimo reflecte quase tudo, dando um creme baço mesmo com reflexos. Aqui o tom escurece e satura de forma controlada; o valor guardado nunca muda (só a conta do 3D).
import { hexValido } from "./acabamentoCor3d";

/** Quanto um tom MUITO colorido escurece (multiplica a luminosidade HSL). Um cinzento não escurece (cromo, prata, inox já reflectem como devem). */
export const LUMINOSIDADE_METAL = 0.86;
/** Quanto a saturação de um tom colorido sobe (multiplica; o resultado nunca passa de 1). O ambiente já satura o tom ao reflectir (a cor multiplica duas vezes), por isso fica em 1,05. */
export const SATURACAO_METAL = 1.05;
/** A saturação a partir da qual um tom conta como «colorido» por inteiro (abaixo, o escurecimento é proporcional): o cobre e o ouro estão acima, o inox e o cromo perto de zero. */
const SATURACAO_COLORIDO = 0.5;
/** Abaixo desta saturação o tom é um cinzento: não se mexe na saturação (para um cromo não ganhar tom). */
const SATURACAO_CINZA = 0.06;

function paraHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function deHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h * 6) % 2) - 1)), m = l - c / 2, k = Math.floor(h * 6) % 6;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
  return [r + m, g + m, b + m];
}
const hex2 = (v: number): string => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");

/** A cor de base que o 3D dá a um metal cuja amostra de catálogo é `hex`: mais escura e mais saturada se for colorida, igual se for cinzenta. Um valor que não é hex sai como veio. */
export function corDoMetal(hex: string): string {
  if (!hexValido(hex)) return hex;
  const cheio = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(cheio.slice(i, i + 2), 16) / 255);
  const [h, s, l] = paraHsl(r, g, b);
  const s2 = s < SATURACAO_CINZA ? s : Math.min(1, s * SATURACAO_METAL);
  const l2 = l * (1 - (1 - LUMINOSIDADE_METAL) * Math.min(1, s / SATURACAO_COLORIDO));
  const [r2, g2, b2] = deHsl(h, s2, l2);
  return `#${hex2(r2)}${hex2(g2)}${hex2(b2)}`;
}
