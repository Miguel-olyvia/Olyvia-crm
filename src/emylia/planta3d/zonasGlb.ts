// 24/11 (fase 1): as ZONAS do objecto. Um móvel tem frente, corpo, tampo, puxadores, pés; um sofá, estofo. Cada parte de um genérico (categoriasGlb.ts) pertence a uma zona pelo seu nome
// estável (ou pela `zona` explícita da parte), e o material `corpo` passa a ser UM por zona (zonasMateriais.ts), para cada zona levar a sua foto ou cor. Que atributo pinta que zona sai,
// por omissão, do NOME do atributo: «Cor da frente» pinta a frente, «Cor do corpo» o corpo, «Cor» (ou o único atributo de cor) todas as zonas sem atributo próprio. Sem nenhum destes
// atributos nada muda: o comportamento é o de hoje (fotoDosAtributos no material `corpo` inteiro).
// 25/11 (fase 2): a ligação explícita atributo → zona (gravada por produto; config3dDados.ts) entra em `aparenciaDaZona` como `ligacoes` (e `excluidos`, o «aplicar: não»); os nomes são só a omissão.
// O aspeto (metal e superfície, aspetoZonas.ts) das opções com «Tem aspeto» entra em cada zona: sem nenhum «Tem aspeto» ligado e sem configuração, nada disto actua e o resultado é o de hoje.
// A planta 3D e as peças já gravadas NÃO usam nada disto: só a pré-visualização do produto passa `mockup3d.zonas`.
// Sem React nem three (só a constante do lado da textura).
import type { AtributoDef, AtributoProduto, Superficie } from "../v2/catalogoModelo";
import { chaveDeExclusao, materialDaSuperficie, superficieDaZona, type MaterialZona } from "./aspetoZonas";
import { sem, temGeometriaPropria, type ProdutoModelo3D } from "./catalogo3d";
import { USAR_GLB_GENERICOS, categoriaDoTipo, categoriaPorId, opcoesComOmissao, type ParteGlb, type ZonaGlb } from "./categoriasGlb";
import { LADO_TEXTURA_CM, type TexturaModelo } from "./texturaProduto";

export type { ZonaGlb } from "./categoriasGlb";
/** Todas as zonas, pela ordem em que se mostram. */
export const ZONAS: readonly ZonaGlb[] = ["frente", "corpo", "tampo", "puxadores", "pes", "estofo"];
const ROTULOS: Readonly<Record<ZonaGlb, string>> = { frente: "Frente", corpo: "Corpo", tampo: "Tampo", puxadores: "Puxadores", pes: "Pés", estofo: "Estofo" };
export const rotuloDaZona = (z: ZonaGlb): string => ROTULOS[z];

/**
 * As regras pelo nome estável da parte (é o nome do nó no GLB). `pe` e `pe_alto` (o pedestal da sanita e do bidé) são porcelana e ficam fora dos pés: só `pe_1`…, `pe_esq`, `pe_dir`,
 * `pes`, `perna_*` e o rodapé são pés.
 */
const REGRAS_POR_NOME: ReadonlyArray<readonly [RegExp, ZonaGlb]> = [
  [/^(porta|gaveta|frente|vidro)/, "frente"],
  [/^puxador/, "puxadores"],
  [/^(tampo|tabua)/, "tampo"],
  [/^(pes$|pe_(\d+|esq|dir)$|perna_|rodape)/, "pes"],
];

/**
 * A zona de uma parte: a `zona` explícita; senão pelo nome (portas, gavetas, frentes e vidros: frente; puxadores; tampo e tábua; pés, pernas e rodapé; as almofadas de um sofá: estofo);
 * as restantes partes de material `corpo` são o corpo; as de material fixo (interior, água, metal das torneiras…) ficam sem zona. `categoriaId`: só as almofadas do sofá dependem dele.
 * Atenção: só as partes de material `corpo` levam a cor de uma zona (zonasMateriais.ts); o vidro de uma porta ou o metal de um puxador continuam como são.
 */
export function zonaDaParte(parte: Pick<ParteGlb, "nome" | "mat" | "zona">, categoriaId?: string): ZonaGlb | undefined {
  if (parte.zona) return parte.zona;
  for (const [re, zona] of REGRAS_POR_NOME) if (re.test(parte.nome)) return zona;
  if (categoriaId === "sofa" && parte.nome.startsWith("almofada")) return "estofo";
  return parte.mat === "corpo" ? "corpo" : undefined;
}

/**
 * As zonas que o modelo tem e se pintam (partes de material `corpo` VISÍVEIS com estas medidas e opções), pela ordem de `ZONAS`, com o número de partes de cada uma.
 * O modelo sem genérico em GLB (o desenho aproximado, a composição de cozinha, os modelos do HTML) não tem zonas.
 */
export function zonasDoModelo(m: ProdutoModelo3D): { zona: ZonaGlb; partes: number }[] {
  const mk = m.mockup3d;
  if (!USAR_GLB_GENERICOS || temGeometriaPropria(mk.params) || mk.params?.k === "cozinha") return [];
  const c = categoriaPorId(mk.generico?.id) ?? categoriaDoTipo(m.tipo);
  if (!c) return [];
  const p = { w: mk.largura, d: mk.profundidade, h: mk.altura, o: opcoesComOmissao(c, m.tipo, { ...mk.generico?.o }) };
  const n = new Map<ZonaGlb, number>();
  for (const parte of c.partes) {
    const zona = zonaDaParte(parte, c.id);
    if (!zona || parte.mat !== "corpo" || (parte.ver && !parte.ver(p))) continue;
    n.set(zona, (n.get(zona) ?? 0) + 1);
  }
  return ZONAS.filter((z) => n.has(z)).map((zona) => ({ zona, partes: n.get(zona)! }));
}

/* ------------------------------------------------------------------ o atributo que pinta cada zona */
/**
 * O que uma zona leva da opção escolhida: o nome do atributo (para o painel), a foto (caminho no storage) e o hex, se os há.
 * 25/11: `metal` e `superficie` (só presentes quando valem alguma coisa, e só com «Tem aspeto» no atributo) e `acabamento`, o nome do «Brilho» que decidiu a superfície.
 * Uma zona só com aspeto (sem atributo de cor) leva `atributo: ""`, foto e hex a null.
 */
export interface AparenciaZona { atributo: string; foto: string | null; hex: string | null; metal?: true; superficie?: Superficie; acabamento?: string }
/** A ligação explícita (id do atributo → zonas que pinta; gravada por produto, subcategoria ou categoria). Um atributo ligado só pinta as zonas a que está ligado; os nomes deixam de contar para ele. */
export type LigacoesDeZonas = Readonly<Record<string, readonly ZonaGlb[]>>;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
type Papel = "corpo" | "frente" | "geral" | null;
/** O papel de um atributo de cor pelo nome: «Cor do corpo», «Cor da frente», «Cor» (ou o código `cor`); outro nome: nenhum. */
function papelDe(d: AtributoDef): Papel {
  const n = sem(d.nome).trim();
  return n === "cor do corpo" ? "corpo" : n === "cor da frente" ? "frente" : n === "cor" || d.codigo.toLowerCase() === "cor" ? "geral" : null;
}

/**
 * O que a `zona` leva, ou null (fica a cor lisa do modelo). Por esta ordem: 1) o atributo próprio da zona («Cor da frente» → frente, «Cor do corpo» → corpo, ou o ligado a ela em `ligacoes`);
 * 2) «Cor»; 3) «Cor do corpo», que é a base de tudo o que não tem atributo próprio (é a prioridade de hoje: corpo antes de frente); 4) o único atributo de cor, seja qual for o nome.
 * Só conta o atributo com opção escolhida; a opção escolhida sem foto NÃO vai buscar a foto de outro atributo (seria a de outra parte).
 */
export function aparenciaDaZona(
  zona: ZonaGlb, attrs: readonly AtributoProduto[] | undefined, defs: readonly AtributoDef[] | undefined, ligacoes?: LigacoesDeZonas, excluidos?: ReadonlySet<string>,
): AparenciaZona | null {
  if (!attrs?.length || !defs?.length) return null;
  // 25/11: um atributo com «aplicar: não» nesta zona (excluidos) deixa de a pintar, mesmo pelo nome
  const cores = defs.filter((d) => (d.temHex || d.temFoto) && !excluidos?.has(chaveDeExclusao(d.id, zona)));
  const ligada = (d: AtributoDef): boolean => !!ligacoes?.[d.id]?.length;
  const escolhida = (d: AtributoDef): AparenciaZona | null => {
    const a = attrs.find((x) => x.atributoId === d.id && x.opcaoId);
    if (!a) return null;
    const o = d.opcoes.find((x) => x.id === a.opcaoId);
    return {
      atributo: d.nome, foto: o?.foto || null, hex: o?.hex && HEX.test(o.hex) ? o.hex : null,
      ...(d.temAspeto && o?.metal ? { metal: true as const } : {}), ...(d.temAspeto && o?.superficie ? { superficie: o.superficie } : {}),
    };
  };
  const primeira = (ds: readonly AtributoDef[]): AparenciaZona | null => { for (const d of ds) { const r = escolhida(d); if (r) return r; } return null; };
  const livres = cores.filter((d) => !ligada(d));
  return primeira(cores.filter((d) => (ligada(d) ? ligacoes![d.id].includes(zona) : papelDe(d) === zona)))
    ?? primeira(livres.filter((d) => papelDe(d) === "geral"))
    ?? primeira(livres.filter((d) => papelDe(d) === "corpo"))
    ?? (cores.length === 1 ? primeira(livres) : null);
}

/** A aparência de cada zona que leva alguma, e se as zonas DIFEREM (`porZona`): com todas iguais o 3D segue o caminho de hoje (a foto ou cor única no material `corpo`). */
export interface ZonasDosAtributos { porZona: boolean; zonas: Partial<Record<ZonaGlb, AparenciaZona>>; /** as zonas ligadas explicitamente (aplicar: sim) a algum atributo; ausente sem ligações */ ligadas?: ZonaGlb[] }
/**
 * As aparências de todas as zonas a partir dos atributos do produto; nenhuma zona com cor nem aspeto escolhidos: undefined (o modelo fica como está).
 * 25/11: `ligacoes` e `excluidos` (config3dDados.ligacoesDaConfig) e o aspeto: uma zona sem cor mas com superfície (o «Brilho» sozinho) também leva entrada.
 */
export function zonasDosAtributos(
  attrs: readonly AtributoProduto[] | undefined, defs: readonly AtributoDef[] | undefined, ligacoes?: LigacoesDeZonas, excluidos?: ReadonlySet<string>,
): ZonasDosAtributos | undefined {
  const zonas: Partial<Record<ZonaGlb, AparenciaZona>> = {};
  for (const z of ZONAS) {
    const cor = aparenciaDaZona(z, attrs, defs, ligacoes, excluidos);
    const asp = superficieDaZona({ zona: z, attrs, defs, ligacoes, excluidos, daOpcaoDaCor: cor ? { metal: cor.metal === true, superficie: cor.superficie ?? null } : null });
    if (!cor && !asp.metal && !asp.superficie) continue;
    zonas[z] = {
      ...(cor ?? { atributo: "", foto: null, hex: null }), ...(asp.metal ? { metal: true as const } : {}),
      ...(asp.superficie ? { superficie: asp.superficie } : {}), ...(asp.atributo ? { acabamento: asp.atributo } : {}),
    };
  }
  if (!Object.keys(zonas).length) return undefined;
  const chave = (a: AparenciaZona | undefined): string => (a ? `${a.foto ?? ""}|${a.hex ?? ""}${a.metal || a.superficie ? `|${a.metal ? "metal" : ""}|${a.superficie ?? ""}` : ""}` : "");
  const ligadas = ZONAS.filter((z) => Object.values(ligacoes ?? {}).some((zs) => zs.includes(z)));
  return { porZona: new Set(ZONAS.map((z) => chave(zonas[z]))).size > 1, zonas, ...(ligadas.length ? { ligadas } : {}) };
}

/**
 * O que o 3D aplica a uma zona: a cor lisa (hex) e/ou a foto (URL público, lado de cada repetição) e o atributo que a pinta (para o painel «Zonas»).
 * 25/11: `material` (rugosidade e metal, de aspetoZonas) e `acabamento` (o nome do «Brilho»), só quando há aspeto.
 */
export interface ZonaVisual { atributo: string; cor?: string; textura?: TexturaModelo; material?: MaterialZona; acabamento?: string }
export interface ZonasDoProduto { porZona: boolean; zonas: Partial<Record<ZonaGlb, ZonaVisual>>; /** as zonas ligadas explicitamente: só nelas as partes de material fixo (puxadores de metal) também se pintam */ ligadas?: ZonaGlb[] }
/** Passa o caminho da foto de cada zona a URL público (`urlDaFoto`: null se o storage falhar: fica a cor lisa dessa zona). */
export function zonasVisuais(z: ZonasDosAtributos, urlDaFoto: (caminho: string) => string | null): ZonasDoProduto {
  const zonas: Partial<Record<ZonaGlb, ZonaVisual>> = {};
  for (const zona of ZONAS) {
    const a = z.zonas[zona];
    if (!a) continue;
    const url = a.foto ? urlDaFoto(a.foto) : null;
    const material = materialDaSuperficie(a.superficie ?? null, a.metal === true);
    zonas[zona] = {
      atributo: a.atributo, ...(a.hex ? { cor: a.hex } : {}), ...(url ? { textura: { url, ladoCm: LADO_TEXTURA_CM } } : {}),
      ...(material ? { material } : {}), ...(a.acabamento ? { acabamento: a.acabamento } : {}),
    };
  }
  return { porZona: z.porZona, zonas, ...(z.ligadas ? { ligadas: z.ligadas } : {}) };
}
