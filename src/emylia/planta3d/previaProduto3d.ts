// 23/11: a pré-visualização 3D de um produto no formulário de criar e na ficha (só para ver). Funções puras, sem React nem three:
// as medidas e a cor que vêm dos atributos do produto, o modelo do catálogo 3D com essas medidas, o estado do modelo (o que se vai ver)
// e a cena mínima: uma divisão pequena com a peça ao centro e a câmara a apontar-lhe.
import type { AtributoDef, AtributoProduto, DimensaoMedida } from "../v2/catalogoModelo";
import { classesDosAtributos, daAspeto, ehAcabamento, ehAtributoDeTextura, hexDoAcabamentoGeral, opcaoEscolhida, ordemUnica } from "./acabamentoCor3d";
import { alturaDeSanitaDeChao, modeloDoProduto, temModeloGenerico, temModeloHtml, type NoCat, type ProdutoModelo3D, type TipoMockup } from "./catalogo3d";
import { eixosPorOmissao, validarEixos, type Eixos } from "./eixosMedida";
import { DIRECAO_VISTA } from "./cotasPeca";
import type { ZonasDoProduto } from "./zonasGlb";
import type { TexturaModelo } from "./texturaProduto";
import { espacoVazio, paredesDoContorno, PE_DIREITO_OMISSAO, type Espaco, type PecaProduto } from "./modelo";

/** As dimensões do modelo que a medida diz, em cm; o que não diz fica de fora (vem do nome ou das omissões do tipo). */
export interface MedidasParciais { larguraCm?: number; profundidadeCm?: number; alturaCm?: number }
/** A medida do atributo, em cm, tal como está nos atributos (largura, comprimento, espessura; o 1D «altura» à parte). Só leva o que é legível. */
export interface MedidaCm { largura?: number; comprimento?: number; espessura?: number; altura?: number }

/** De 5 a 400 cm, os mesmos limites das medidas lidas do nome (dimensoesDoNome): fora disto não é a medida de um produto de catálogo (é um engano de unidade), não se desenha,
 *  e a câmara (que se afasta até 12 m) enquadra sempre a peça. */
const MIN_CM = 5, MAX_CM = 400;
const ARREDONDAR = (cm: number) => Math.round(cm * 10) / 10;

/** Uma dimensão em cm: o número, ou o limite superior (`ate`) de um intervalo; mm passa a cm. Ilegível (zero, negativa, NaN, fora de 5 a 400 cm): undefined. */
function emCm(d: DimensaoMedida | null | undefined, unidade: "cm" | "mm"): number | undefined {
  const v = typeof d === "number" ? d : d && typeof d === "object" ? d.ate : Number.NaN;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return undefined;
  const cm = ARREDONDAR(unidade === "mm" ? v / 10 : v);
  return cm >= MIN_CM && cm <= MAX_CM ? cm : undefined;
}

/**
 * A medida do produto (o atributo do tipo «medida») em centímetros. 2D: largura e comprimento; 3D: mais a espessura. 1D: a largura ou o comprimento dá a
 * largura, a altura dá a altura, a espessura não diz nada. Sem medida legível: null. Como isto se reparte por largura, profundidade e altura depende do
 * tipo do produto: `dimensoesDaMedida`.
 */
export function medidaDosAtributos(attrs: readonly AtributoProduto[] | undefined): MedidaCm | null {
  const m = attrs?.find((a) => a.medida)?.medida;
  if (!m) return null;
  const r: MedidaCm = {};
  if (m.tipo === "1D") {
    const v = emCm(m.valor, m.unidade);
    if (v !== undefined && (m.dimensao === "largura" || m.dimensao === "comprimento")) r.largura = v;
    else if (v !== undefined && m.dimensao === "altura") r.altura = v;
  } else {
    const l = emCm(m.largura, m.unidade), c = emCm(m.comprimento, m.unidade), e = emCm(m.espessura, m.unidade);
    if (l !== undefined) r.largura = l;
    if (c !== undefined) r.comprimento = c;
    if (e !== undefined) r.espessura = e;
  }
  return Object.keys(r).length ? r : null;
}

/**
 * A medida do atributo repartida por largura, profundidade e altura como o classificador faz com os números do nome (extrairDimensoes): base de duche e
 * banheira, o maior é a largura e o menor a profundidade, e a espessura é a altura; espelho, quadro, radiador, toalheiro, resguardo, roupeiro e também os
 * móveis, colunas e armários (COMPRIMENTO_NA_ALTURA, lido na base: colunas e móveis de lavatório), o comprimento é a altura e a espessura a profundidade;
 * os outros (tampo, bancada, lavabo…), o comprimento é a profundidade e a espessura a altura. Nada que sirva: null.
 * 24/11: essa regra é `eixosPorOmissao(tipo)`; `eixos` (escolhidos à mão no painel «Medidas», só para ver) manda sobre ela, e sem eixos (ou inválidos) dá exactamente o que dava.
 */
export function dimensoesDaMedida(tipo: TipoMockup, m: MedidaCm, nome?: string, eixos?: Eixos | null): MedidasParciais | null {
  // 24/11: que campo da Medida dá a largura, a altura e a profundidade: os que vêm (escolhidos à mão, só para ver) ou, sem eles ou inválidos, a regra de hoje por tipo (eixosPorOmissao)
  const ex = validarEixos(eixos) ?? eixosPorOmissao(tipo, m);
  let r: MedidasParciais = { larguraCm: m[ex.largura], profundidadeCm: m[ex.profundidade], alturaCm: m[ex.altura] ?? m.altura };
  // a sanita de chão com depósito não tem menos de 60 cm de altura (a mesma regra do catálogo e da planta); sem o nome, a medida fica como vem
  if (nome !== undefined && r.alturaCm !== undefined) r = { ...r, alturaCm: alturaDeSanitaDeChao(tipo, nome, r.alturaCm) };
  const dito = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as MedidasParciais;
  return Object.keys(dito).length ? dito : null;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/**
 * A cor (hex) da opção escolhida no atributo «cor»; sem atributo, sem definição, sem amostra ou com um hex inválido: undefined.
 * 25/11: com a separação Cor/Acabamento, o hex do «Acabamento da cor» (o metal da torneira: Cobre, Ouro, Inox…; a «Decor») manda sobre o da «Cor»; sem ele, é o de sempre.
 */
export function corDosAtributos(attrs: readonly AtributoProduto[] | undefined, defs: readonly AtributoDef[] | undefined): string | undefined {
  const doAcabamento = hexDoAcabamentoGeral(attrs, defs);
  if (doAcabamento) return doAcabamento;
  const def = defs?.find((d) => d.codigo.toLowerCase() === "cor");
  const escolhido = def && attrs?.find((a) => a.atributoId === def.id && a.opcaoId);
  const hex = escolhido ? def.opcoes.find((o) => o.id === escolhido.opcaoId)?.hex : null;
  return hex && HEX.test(hex) ? hex : undefined;
}

/**
 * O caminho da foto (`{org}/{uuid}.webp`) da opção de cor escolhida, para a textura do 3D: o atributo de cor com opção escolhida e a prioridade mais alta manda
 * («Cor do corpo», depois «Cor da frente», depois «Cor»; sem nenhum destes nomes, o único atributo de cor). Se a opção dele não tem foto, não há textura (não se vai
 * buscar a foto de outro atributo: seria a de outra parte do produto). Atributo de cor: o que tem hex ou foto. Sem foto, sem atributos ou sem escolha: null.
 * 25/11: dentro de cada um destes nomes o acabamento vem antes da cor («Acabamento do corpo» antes de «Cor do corpo», «Acabamento da frente» antes de «Cor da frente», «Acabamento da cor»,
 * «Decor» e o «Acabamento» original antes de «Cor»); um acabamento cuja opção não tem foto, hex nem aspeto não conta (acabamentoCor3d.ts).
 */
export function fotoDosAtributos(attrs: readonly AtributoProduto[] | undefined, defs: readonly AtributoDef[] | undefined): string | null {
  if (!attrs?.length || !defs?.length) return null;
  const classes = classesDosAtributos(defs);
  // 27/11: a Textura (com hex e foto na base) não é um atributo de cor: a sua foto vai por texturaDosAtributos
  const cores = defs.filter((d) => (d.temHex || d.temFoto) && !ehAtributoDeTextura(d));
  const nomeadas = cores.filter((d) => classes.has(d.id)).sort((a, b) => ordemUnica(classes.get(a.id)!) - ordemUnica(classes.get(b.id)!));
  for (const def of nomeadas.length ? nomeadas : cores.length === 1 ? cores : []) {
    const escolhido = opcaoEscolhida(def, attrs);
    if (!escolhido) continue;
    if (ehAcabamento(classes.get(def.id)) && !daAspeto(def, escolhido.opcao)) continue;
    return escolhido.opcao?.foto || null;
  }
  return null;
}

/**
 * 27/11: o caminho da foto da opção escolhida no atributo «Textura» (Pizarra, Liso, Piedra), que a base passou a deixar ter foto (`temFoto`): é a foto que o 3D aplica ao corpo TINGIDA pela
 * cor da opção de Cor (a cor continua a ser a da Cor e só a textura muda). O primeiro atributo de Textura com foto; sem atributo, sem escolha, sem `temFoto` ou sem foto na opção: null.
 * Não é a foto de um atributo de cor (esta vai por `fotoDosAtributos`, que ignora a Textura).
 */
export function texturaDosAtributos(attrs: readonly AtributoProduto[] | undefined, defs: readonly AtributoDef[] | undefined): string | null {
  if (!attrs?.length || !defs?.length) return null;
  const def = defs.find((d) => ehAtributoDeTextura(d) && d.temFoto === true);
  const escolhido = def && opcaoEscolhida(def, attrs);
  return escolhido?.opcao?.foto || null;
}

/**
 * 26/11: o 3D da FICHA de produto usa SÓ os modelos genéricos (decisão do dono): nunca o modelo do HTML (lava-loiça, placa, torneira, tampo Coverlam) nem outro modelo detalhado.
 * Cada produto fica com o genérico da sua categoria (categoriasGlb.ts) ou, se o tipo não tem genérico, com o desenho aproximado ou a caixa. Uma escolha manual de «Modelo 3D» só
 * vale se apontar para um genérico (a «caixa» e os revestimentos também). Pôr a `false` repõe os modelos do HTML na ficha. É o ÚNICO sítio que decide isto; só a ficha (e a futura
 * vista de família, que passa por modeloParaPrevia) o lê: a planta e o Estúdio chamam modeloDoProduto sem esta opção e não mudam.
 */
export const PREVIA_SO_GENERICOS = true;

export interface EntradaPrevia {
  nome: string; sub?: string; no: string | null; arvore: readonly NoCat[]; medida?: MedidaCm | null; cor?: string; /** a foto da opção de cor (URL público); 27/11: `tingir` quando é a foto da Textura (a cor multiplica-a) */ textura?: TexturaModelo;
  /** O «Modelo 3D» escolhido no próprio produto (o que se está a escolher no formulário ou o gravado); a subcategoria e a categoria vêm da árvore. */
  modelo3d?: string | null;
  /** 24/11: os eixos da Medida escolhidos à mão no painel «Medidas» (só para ver); sem eles, a regra de hoje por tipo. */
  eixos?: Eixos | null;
  /** 24/11: a aparência de cada zona (frente, corpo…), dos atributos «Cor da frente», «Cor do corpo»…; sem ela, a foto ou cor única de hoje. */
  zonas?: ZonasDoProduto;
  /** 26/11: só genéricos (por omissão `PREVIA_SO_GENERICOS`); `false` repõe os modelos do HTML (os testes fixam os dois lados). */
  soGenericos?: boolean;
}
const ID_PREVIA = "previa-produto";

/** O tipo de mockup que o classificador dá ao produto (antes da medida): o painel «Medidas» precisa dele para a regra de omissão dos eixos. */
export function tipoDaPrevia({ nome, sub, no, arvore, modelo3d, soGenericos = PREVIA_SO_GENERICOS }: Pick<EntradaPrevia, "nome" | "sub" | "no" | "arvore" | "modelo3d" | "soGenericos">): TipoMockup {
  return modeloDoProduto({ id: ID_PREVIA, n: nome.trim(), sub: sub?.trim() || undefined, no, ...(modelo3d ? { modelo3d } : {}) }, arvore, {}, { soGenericos }).tipo;
}

/**
 * O modelo do catálogo 3D do produto que se está a escrever: o classificador de sempre (pela subcategoria, pelo nome e pelo ramo da árvore), com a
 * medida dos atributos por cima da do nome (repartida pelo tipo que o classificador deu; o que ela não diz vem do nome ou das omissões do tipo) e a cor do
 * atributo Cor, que o classificador não lê.
 */
export function modeloParaPrevia({ nome, sub, no, arvore, medida, cor, textura, modelo3d, eixos, zonas, soGenericos = PREVIA_SO_GENERICOS }: EntradaPrevia): ProdutoModelo3D {
  const p = { id: ID_PREVIA, n: nome.trim(), sub: sub?.trim() || undefined, no, ...(modelo3d ? { modelo3d } : {}) };
  let m = modeloDoProduto(p, arvore, {}, { soGenericos });
  const medidas = medida ? dimensoesDaMedida(m.tipo, medida, p.n, eixos) : null;
  if (medidas) {
    const d = m.dimensoes;
    m = modeloDoProduto({ ...p, dim: [medidas.larguraCm ?? d.larguraCm, medidas.profundidadeCm ?? d.profundidadeCm, medidas.alturaCm ?? d.alturaCm] }, arvore, {}, { soGenericos });
  }
  if (!cor && !textura && !zonas) return m;
  return { ...m, mockup3d: { ...m.mockup3d, ...(cor ? { cor } : {}), ...(textura ? { textura } : {}), ...(zonas ? { zonas } : {}) } };
}

/**
 * O que a pré-visualização mostra: o modelo exacto do HTML (lava-loiça, placa, torneira), o genérico da categoria, um desenho aproximado do tipo (sem
 * genérico nem modelo do HTML) ou só a caixa cinzenta com as medidas (o tipo «caixa»: o classificador não reconheceu nada).
 */
export type EstadoPrevia = "html" | "generico" | "aproximado" | "caixa";
export function estadoDoModelo(m: ProdutoModelo3D): EstadoPrevia {
  if (temModeloHtml(m)) return "html";
  if (temModeloGenerico(m)) return "generico";
  return m.tipo === "caixa" ? "caixa" : "aproximado";
}

type V3 = [number, number, number];
/** `distMin` e `distMax`: até onde o zoom aproxima e afasta a câmara do alvo (m), à medida da peça. */
export interface CenaProduto { espaco: Espaco; modelos: Record<string, ProdutoModelo3D>; camara: { chave: string; pos: V3; alvo: V3; distMin: number; distMax: number } }

const FOLGA_M = 1, LADO_MIN_M = 1.5, FOLGA_PE_DIREITO_M = 0.3, DIST_MIN_M = 1, DIST_MAX_M = 12;
/** O zoom: não entra no objecto (um pouco mais do que o raio da caixa da peça, e nunca a menos de 25 cm) e afasta-se, no máximo, 3 vezes a distância de partida. */
const FOLGA_RAIO = 1.1, ZOOM_MIN_M = 0.25, ZOOM_AFASTAR = 3;
/** A direcção de onde a câmara olha (a mesma diagonal da vista 3D do visualizador: de frente e de lado, um pouco por cima). */
const DIRECAO: V3 = DIRECAO_VISTA;

/**
 * A cena mínima de um produto: uma divisão quadrada (o visualizador precisa de quatro paredes, e as que ficam entre a câmara e a peça escondem-se
 * sozinhas) com a peça ao centro, e uma câmara explícita que enquadra o tamanho dela (uma torneira e um roupeiro ficam do mesmo tamanho no ecrã).
 * A chave da câmara depende só das medidas: escrever o nome não a refaz, mudar as medidas sim.
 */
export function cenaDoProduto(m: ProdutoModelo3D): CenaProduto {
  const w = m.dimensoes.larguraCm / 100, p = m.dimensoes.profundidadeCm / 100, a = m.dimensoes.alturaCm / 100;
  const base = m.montagem === "parede" ? m.alturaOmissao : 0;
  const lado = Math.max(LADO_MIN_M, Math.max(w, p) + FOLGA_M), centro = lado / 2;
  const peca: PecaProduto = { id: ID_PREVIA, produtoId: m.produtoId, x: centro, y: centro, rotacao: 0, paredeEncosto: null, largura: w, profundidade: p, montagem: m.montagem, altura: base, espelhada: false, nome: m.nome };
  const vazio = espacoVazio("outro", m.nome || "Produto");
  const espaco: Espaco = {
    ...vazio, peDireito: Math.max(PE_DIREITO_OMISSAO, base + a + FOLGA_PE_DIREITO_M),
    paredes: paredesDoContorno([{ x: 0, y: 0 }, { x: lado, y: 0 }, { x: lado, y: lado }, { x: 0, y: lado }]), pecas: [peca],
  };
  const alvo: V3 = [centro, base + a / 2, centro];
  const dist = Math.min(DIST_MAX_M, Math.max(DIST_MIN_M, Math.max(w, p, a) * 2.4 + 0.5));
  const norma = Math.hypot(...DIRECAO), k = dist / norma;
  const pos: V3 = [alvo[0] + DIRECAO[0] * k, alvo[1] + DIRECAO[1] * k, alvo[2] + DIRECAO[2] * k];
  const chave = [w, p, a, base].map((v) => Math.round(v * 100)).join("x");
  const distMin = Math.min(dist, Math.max(ZOOM_MIN_M, (Math.hypot(w, p, a) / 2) * FOLGA_RAIO));
  return { espaco, modelos: { [m.produtoId]: m }, camara: { chave, pos, alvo, distMin, distMax: dist * ZOOM_AFASTAR } };
}
