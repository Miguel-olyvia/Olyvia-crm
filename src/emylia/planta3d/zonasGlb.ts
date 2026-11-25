// 24/11 (fase 1): as ZONAS do objecto. Um móvel tem frente, corpo, tampo, puxadores, pés; um sofá, estofo. Cada parte de um genérico (categoriasGlb.ts) pertence a uma zona pelo seu nome
// estável (ou pela `zona` explícita da parte), e o material `corpo` passa a ser UM por zona (zonasMateriais.ts), para cada zona levar a sua foto ou cor. Que atributo pinta que zona sai,
// por omissão, do NOME do atributo: «Cor da frente» pinta a frente, «Cor do corpo» o corpo, «Cor» (ou o único atributo de cor) todas as zonas sem atributo próprio. Sem nenhum destes
// atributos nada muda: o comportamento é o de hoje (fotoDosAtributos no material `corpo` inteiro).
// GANCHO PARA A FASE 2: a ligação explícita atributo → zona (gravada por produto, subcategoria e categoria) entra em `aparenciaDaZona` como `ligacoes`; os nomes passam a ser só a omissão.
// A planta 3D e as peças já gravadas NÃO usam nada disto: só a pré-visualização do produto passa `mockup3d.zonas`.
// Sem React nem three (só a constante do lado da textura).
import type { AtributoDef, AtributoProduto } from "../v2/catalogoModelo";
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
/** O que uma zona leva da opção escolhida: o nome do atributo (para o painel), a foto (caminho no storage) e o hex, se os há. */
export interface AparenciaZona { atributo: string; foto: string | null; hex: string | null }
/** GANCHO da fase 2: a ligação explícita (id do atributo → zonas que pinta). Um atributo ligado só pinta as zonas a que está ligado; os nomes deixam de contar para ele. */
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
  zona: ZonaGlb, attrs: readonly AtributoProduto[] | undefined, defs: readonly AtributoDef[] | undefined, ligacoes?: LigacoesDeZonas,
): AparenciaZona | null {
  if (!attrs?.length || !defs?.length) return null;
  const cores = defs.filter((d) => d.temHex || d.temFoto);
  const ligada = (d: AtributoDef): boolean => !!ligacoes?.[d.id]?.length;
  const escolhida = (d: AtributoDef): AparenciaZona | null => {
    const a = attrs.find((x) => x.atributoId === d.id && x.opcaoId);
    if (!a) return null;
    const o = d.opcoes.find((x) => x.id === a.opcaoId);
    return { atributo: d.nome, foto: o?.foto || null, hex: o?.hex && HEX.test(o.hex) ? o.hex : null };
  };
  const primeira = (ds: readonly AtributoDef[]): AparenciaZona | null => { for (const d of ds) { const r = escolhida(d); if (r) return r; } return null; };
  const livres = cores.filter((d) => !ligada(d));
  return primeira(cores.filter((d) => (ligada(d) ? ligacoes![d.id].includes(zona) : papelDe(d) === zona)))
    ?? primeira(livres.filter((d) => papelDe(d) === "geral"))
    ?? primeira(livres.filter((d) => papelDe(d) === "corpo"))
    ?? (cores.length === 1 ? primeira(livres) : null);
}

/** A aparência de cada zona que leva alguma, e se as zonas DIFEREM (`porZona`): com todas iguais o 3D segue o caminho de hoje (a foto ou cor única no material `corpo`). */
export interface ZonasDosAtributos { porZona: boolean; zonas: Partial<Record<ZonaGlb, AparenciaZona>> }
/** As aparências de todas as zonas a partir dos atributos do produto; nenhuma zona com cor escolhida: undefined (o modelo fica como está). */
export function zonasDosAtributos(attrs: readonly AtributoProduto[] | undefined, defs: readonly AtributoDef[] | undefined, ligacoes?: LigacoesDeZonas): ZonasDosAtributos | undefined {
  const zonas: Partial<Record<ZonaGlb, AparenciaZona>> = {};
  for (const z of ZONAS) { const a = aparenciaDaZona(z, attrs, defs, ligacoes); if (a) zonas[z] = a; }
  if (!Object.keys(zonas).length) return undefined;
  const chave = (a: AparenciaZona | undefined): string => (a ? `${a.foto ?? ""}|${a.hex ?? ""}` : "");
  return { porZona: new Set(ZONAS.map((z) => chave(zonas[z]))).size > 1, zonas };
}

/** O que o 3D aplica a uma zona: a cor lisa (hex) e/ou a foto (URL público, lado de cada repetição) e o atributo que a pinta (para o painel «Zonas»). */
export interface ZonaVisual { atributo: string; cor?: string; textura?: TexturaModelo }
export interface ZonasDoProduto { porZona: boolean; zonas: Partial<Record<ZonaGlb, ZonaVisual>> }
/** Passa o caminho da foto de cada zona a URL público (`urlDaFoto`: null se o storage falhar: fica a cor lisa dessa zona). */
export function zonasVisuais(z: ZonasDosAtributos, urlDaFoto: (caminho: string) => string | null): ZonasDoProduto {
  const zonas: Partial<Record<ZonaGlb, ZonaVisual>> = {};
  for (const zona of ZONAS) {
    const a = z.zonas[zona];
    if (!a) continue;
    const url = a.foto ? urlDaFoto(a.foto) : null;
    zonas[zona] = { atributo: a.atributo, ...(a.hex ? { cor: a.hex } : {}), ...(url ? { textura: { url, ladoCm: LADO_TEXTURA_CM } } : {}) };
  }
  return { porZona: z.porZona, zonas };
}
