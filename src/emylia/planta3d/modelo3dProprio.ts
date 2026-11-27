// 27/11: as regras do 3D com um GLB PRÓPRIO (o ficheiro que a empresa carrega numa categoria, subcategoria ou Modelo). Funções puras, sem React nem three.
// O CONTRATO DO DONO: o GLB só dá a FORMA. A escala vem SEMPRE das medidas do produto (largura, profundidade e altura, não uniforme; sem medidas no produto, o tamanho nativo
// do ficheiro, com aviso se estiver fora de 1 cm a 5 m); a cor e a textura (a foto tingida pela cor, texturaProduto.ts) vêm SEMPRE do produto e aplicam-se a todos os materiais
// do GLB exceto os de nome que começa por metal, vidro, espelho, luz ou agua (sem distinguir maiúsculas nem acentos). Se o GLB falhar (rede, cabeçalho, limite) mostra-se o
// modelo genérico, sem partir o ecrã, e uma nota diz porquê (a escolha de qual GLB manda é de modelos3dEscolha.ts; a montagem com o three é de ModeloProprio.tsx).
import { AVISO_TRIANGULOS, MAX_TRIANGULOS } from "./glbValidar";

export { AVISO_TRIANGULOS, MAX_TRIANGULOS };
/** Sem medidas no produto, o tamanho nativo do GLB avisa-se se a maior dimensão estiver fora disto (em metros): 1 cm a 5 m. */
export const MIN_NATIVO_M = 0.01, MAX_NATIVO_M = 5;

/** Os materiais que o produto NÃO pinta: o nome começa por um destes (a regra do dono; o resto do ficheiro leva a cor e a textura do produto). */
const PREFIXOS_FIXOS = ["metal", "vidro", "espelho", "luz", "agua"] as const;

/** Sem maiúsculas, sem acentos e sem espaços nas pontas: «Água_1» e «  Vidro» contam como «agua» e «vidro». */
const normalizar = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Este material recebe a cor e a textura do produto? Não, se o nome começa por metal, vidro, espelho, luz ou agua. Sem nome, recebe. */
export function materialRecebeAparencia(nome: string | null | undefined): boolean {
  const n = normalizar(nome ?? "");
  return !PREFIXOS_FIXOS.some((p) => n.startsWith(p));
}

/** As medidas do produto em metros; é o que escala o GLB. */
export interface MedidasProduto { larguraM: number; profundidadeM: number; alturaM: number }
/** Uma dimensão do ficheiro, em metros (as do glTF são metros). */
export interface TamanhoNativo { x: number; y: number; z: number }
export interface PlanoEscala {
  /** o factor de cada eixo (x = largura, y = altura, z = profundidade): 1 sem medidas */
  escala: [number, number, number];
  /** true: escalou-se pelas medidas do produto; false: tamanho nativo */
  usaMedidas: boolean;
  /** o tamanho nativo fora de 1 cm a 5 m (só sem medidas), em texto para quem usa o ecrã; null se está tudo bem */
  aviso: string | null;
  /** o mesmo, por classe, para as notas do ecrã */
  tamanhoNativo: "pequeno" | "grande" | null;
}

const valido = (n: number): boolean => Number.isFinite(n) && n > 0;
/** O factor de uma dimensão: a medida a dividir pela nativa; sem uma das duas válida fica a 1 (nunca infinito nem zero). */
const factor = (medida: number, nativa: number): number => (valido(medida) && valido(nativa) ? medida / nativa : 1);

/**
 * Como escalar o GLB. Com `medidas`: não uniforme, cada eixo pela sua medida (o cubo vira o armário de 60×40×90). Sem elas: tamanho nativo, e se a maior dimensão do ficheiro
 * estiver abaixo de 1 cm ou acima de 5 m, um aviso (quase sempre a unidade ficou errada na exportação: o dono corrige-a no ficheiro ou preenche as medidas do produto).
 */
export function planearEscala(nativo: TamanhoNativo, medidas: MedidasProduto | null): PlanoEscala {
  if (medidas) {
    return { escala: [factor(medidas.larguraM, nativo.x), factor(medidas.alturaM, nativo.y), factor(medidas.profundidadeM, nativo.z)], usaMedidas: true, aviso: null, tamanhoNativo: null };
  }
  const maior = Math.max(nativo.x, nativo.y, nativo.z);
  const classe = maior < MIN_NATIVO_M ? "pequeno" : maior > MAX_NATIVO_M ? "grande" : null;
  const cm = (m: number) => (m * 100).toLocaleString("pt-PT", { maximumFractionDigits: 1 });
  const aviso = classe === "pequeno" ? `O modelo é muito pequeno (${cm(maior)} cm de lado maior): o produto não tem medidas, por isso aparece no tamanho do ficheiro. Preencha as medidas do produto.`
    : classe === "grande" ? `O modelo é muito grande (${(maior).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} m de lado maior): o produto não tem medidas, por isso aparece no tamanho do ficheiro. Preencha as medidas do produto.`
      : null;
  return { escala: [1, 1, 1], usaMedidas: false, aviso, tamanhoNativo: classe };
}

/** As medidas do produto em metros, ou null se o produto não as tem (as de omissão do tipo não são medidas do produto: `deNome` falso). */
export function medidasDoProduto(d: { larguraCm: number; profundidadeCm: number; alturaCm: number; deNome: boolean }): MedidasProduto | null {
  return d.deNome ? { larguraM: d.larguraCm / 100, profundidadeM: d.profundidadeCm / 100, alturaM: d.alturaCm / 100 } : null;
}

/** Um erro próprio do GLB (o limite de triângulos…): a mensagem já vem para quem usa o ecrã. */
export class ErroModeloProprio extends Error {
  constructor(mensagem: string) { super(mensagem); this.name = "ErroModeloProprio"; }
}

const SO_GENERICO = "Mostra-se o modelo genérico.";
/** A nota para quando o GLB próprio não abre: porquê (rede, ficheiro, Draco, limite) e que o que se vê é o modelo genérico. */
export function notaDeFalha(erro: unknown): string {
  if (erro instanceof ErroModeloProprio) return `${erro.message} ${SO_GENERICO}`;
  const m = erro instanceof Error ? `${erro.name} ${erro.message}` : typeof erro === "string" ? erro : "";
  if (/draco/i.test(m)) return `O modelo 3D próprio usa compressão Draco, que não é suportada. ${SO_GENERICO}`;
  if (/failed to fetch|networkerror|couldn't load|could not load|404|not found|load failed|network/i.test(m)) return `Não foi possível carregar o modelo 3D próprio (rede ou ficheiro em falta). ${SO_GENERICO}`;
  if (/gltf|glb|json|unexpected token|unsupported|invalid|magic|header/i.test(m)) return `O ficheiro do modelo 3D próprio não é um GLB válido. ${SO_GENERICO}`;
  return `O modelo 3D próprio não abriu. ${SO_GENERICO}`;
}

/** Um aviso que não impede de mostrar o modelo (tamanho nativo estranho, muitos triângulos); null sem nada a dizer. */
export function notaDeAviso(o: { tamanhoNativo: "pequeno" | "grande" | null; triangulos: number }): string | null {
  const partes: string[] = [];
  if (o.tamanhoNativo) partes.push(`O modelo 3D próprio é muito ${o.tamanhoNativo === "pequeno" ? "pequeno" : "grande"} e o produto não tem medidas: aparece no tamanho do ficheiro. Preencha as medidas do produto.`);
  if (o.triangulos >= AVISO_TRIANGULOS) partes.push(`O modelo 3D próprio tem ${String(o.triangulos).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} triângulos e pode ficar pesado no telemóvel.`);
  return partes.length ? partes.join(" ") : null;
}
