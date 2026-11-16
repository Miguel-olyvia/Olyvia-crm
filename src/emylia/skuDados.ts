// 16/11: a referência (SKU) do Catálogo: as siglas das categorias e das opções, a ordem dos atributos no SKU, a pré-visualização e a geração.
// Chama as funções cat_* de 20270118000000_catalogo_siglas_e_sku.sql (cat_guardar_sigla_categoria, cat_guardar_sigla_opcao, cat_guardar_sku_config,
// cat_gerar_sku_produto, cat_prever_sku). Formato: SIGLA_CAT-SIGLA_SUB-NNNN-<atributos pela ordem>-<medida>, ex.: BC-TO-0001-AZ-PZ-60X30.
// Quem decide é a base; aqui só se chama e se traduz o que ela devolve (códigos de falta em frases). Erros CT001–CT004 vêm em português.
import { chamar, type ResG } from "./atributosGestao";
import type { CategoriaGestao, SubcategoriaGestao } from "./categoriasMarcasGestao";

export const SIGLA_MAX = 6;
const IGUAL_SIGLA = "Já existe outra com esta sigla.";

/** Maiúsculas e no máximo 6 caracteres (o que se escreve no campo). */
export const normalizarSigla = (s: string): string => s.toUpperCase().slice(0, SIGLA_MAX);

/** null = válida. Uma categoria ou subcategoria exige pelo menos uma letra (como a base). */
export function validarSigla(s: string, exigeLetra: boolean): string | null {
  if (!s) return "Escreva a sigla.";
  if (s.length > SIGLA_MAX) return `A sigla tem até ${SIGLA_MAX} caracteres.`;
  if (!/^[A-Z0-9]+$/.test(s)) return "Use só letras A a Z e algarismos, sem acentos, espaços nem sinais.";
  if (exigeLetra && !/[A-Z]/.test(s)) return "A sigla tem de ter pelo menos uma letra.";
  return null;
}

/** CT004 (sigla repetida) tem sempre a mesma frase, qualquer que seja o sítio. */
const repetida = (r: ResG<unknown>): ResG<unknown> => (!r.ok && r.codigo === "CT004" ? { ...r, erro: IGUAL_SIGLA } : r);

export async function guardarSigla(org: string, id: string, sigla: string): Promise<ResG<unknown>> {
  return repetida(await chamar("cat_guardar_sigla_categoria", { p_org: org, p_id: id, p_sigla: sigla }, "Não foi possível guardar a sigla."));
}
export async function guardarSiglaOpcao(org: string, opcao: string, sigla: string): Promise<ResG<unknown>> {
  return repetida(await chamar("cat_guardar_sigla_opcao", { p_org: org, p_opcao: opcao, p_sigla: sigla }, "Não foi possível guardar a sigla."));
}
/** `itens` = TODOS os atributos, na ordem desejada. */
export interface ItemSku { atributo: string; entra: boolean }
export function guardarSkuConfig(org: string, itens: readonly ItemSku[]): Promise<ResG<unknown>> {
  return chamar("cat_guardar_sku_config", { p_org: org, p_itens: [...itens] }, "Não foi possível guardar a ordem da referência.");
}

export interface ResultadoGerar { sku: string | null; gerado: boolean; faltas: string[]; motivo: string | null }
export interface ResultadoPrever { sku: string | null; faltas: string[] }
type Bruto = Record<string, unknown>;
const faltasDe = (x: unknown): string[] => (Array.isArray(x) ? x.filter((f): f is string => typeof f === "string") : []);
const sku = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);

export async function gerarSkuProduto(org: string, produto: string, forcar = false): Promise<ResG<ResultadoGerar>> {
  const r = await chamar("cat_gerar_sku_produto", { p_org: org, p_produto: produto, p_forcar: forcar }, "Não foi possível gerar a referência.");
  if (!r.ok) return r;
  const v = r.v as Bruto;
  return { ok: true, v: { sku: sku(v.sku), gerado: v.gerado === true, faltas: faltasDe(v.faltas), motivo: typeof v.motivo === "string" ? v.motivo : null } };
}
/** Só leitura: o número mostrado é o próximo e só se confirma ao guardar. `atributos` no formato de cat_guardar_produto_atributos. */
export async function preverSku(org: string, categoria: string | null, subcategoria: string | null, atributos: readonly unknown[]): Promise<ResG<ResultadoPrever>> {
  const r = await chamar("cat_prever_sku", { p_org: org, p_categoria: categoria, p_subcategoria: subcategoria, p_atributos: [...atributos] }, "Não foi possível prever a referência.");
  if (!r.ok) return r;
  const v = r.v as Bruto;
  return { ok: true, v: { sku: sku(v.sku), faltas: faltasDe(v.faltas) } };
}

/** Os nomes que tornam as faltas legíveis (opcionais: sem eles a frase fica sem o nome). */
export interface NomesSku { categoria?: string | null; subcategoria?: string | null; atributos?: Record<string, string> }
const com = (frase: string, nome?: string | null) => (nome ? `${frase} «${nome}»` : frase);

/** Os códigos de falta da base (categoria, sigla_categoria, subcategoria, sigla_subcategoria, numero, sigla:<atributo>, medida:<atributo>) em frases. */
export function descreverFaltas(faltas: readonly string[], n: NomesSku = {}): string[] {
  return faltas.map((f) => {
    if (f === "categoria") return "Falta escolher a categoria";
    if (f === "sigla_categoria") return com("Falta a sigla da categoria", n.categoria);
    if (f === "subcategoria") return "A subcategoria não pertence à categoria escolhida";
    if (f === "sigla_subcategoria") return com("Falta a sigla da subcategoria", n.subcategoria);
    if (f === "numero") return "Já não há números livres (9999) para esta combinação";
    const [tipo, codigo] = [f.slice(0, f.indexOf(":")), f.slice(f.indexOf(":") + 1)];
    if (f.includes(":") && (tipo === "sigla" || tipo === "medida")) {
      const nome = n.atributos?.[codigo] ?? codigo;
      return tipo === "sigla" ? `Falta a sigla da opção escolhida em «${nome}»` : `Falta a medida de «${nome}» completa`;
    }
    return `Falta ${f}`;
  });
}

/** Porque é que a referência não se gerou, numa frase curta (depois de «referência por gerar: »). */
export function textoSemGerar(r: ResultadoGerar, n: NomesSku = {}): string {
  if (r.motivo === "sku_manual") return "a referência atual foi escrita à mão";
  const f = descreverFaltas(r.faltas, n);
  return f.length ? f.join("; ") : "não foi possível";
}

/** O exemplo ao vivo do formato, para quem ordena os atributos: a primeira sigla de cada atributo que entra (XX se não houver), a medida 60X30.
 *  `base` = SIGLA_CAT-SIGLA_SUB-NNNN (por omissão o exemplo BC-TO-0001). */
export function exemploSku(atributos: readonly { tipo: "lista" | "medida"; entra: boolean; siglas: readonly string[] }[], base = "BC-TO-0001"): string {
  const partes = atributos.filter((a) => a.entra).map((a) => (a.tipo === "medida" ? "60X30" : a.siglas[0] ?? "XX"));
  return [base, ...partes].join("-");
}

export const PREVER_AMBIGUO = "Não é possível prever: há categorias com o mesmo nome.";
export type CategoriaResolvida = { k: "ok"; categoria: string; subcategoria: string | null } | { k: "nao-existe" } | { k: "ambiguo" };
const chave = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
/** Entre os que têm o nome: os ativos e da organização (não globais); se não houver nenhum, os que há. Mais de um = ambíguo. */
function escolher<T extends SubcategoriaGestao>(L: readonly T[], nome: string): { k: "um"; v: T } | { k: "nenhum" } | { k: "ambiguo" } {
  const iguais = L.filter((x) => chave(x.nome) === chave(nome));
  const preferidos = iguais.filter((x) => x.ativo && !x.global);
  const pool = preferidos.length ? preferidos : iguais;
  return pool.length === 0 ? { k: "nenhum" } : pool.length > 1 ? { k: "ambiguo" } : { k: "um", v: pool[0] };
}
/** Os ids da categoria (e subcategoria) de produto a partir dos nomes do Catálogo (a árvore do ecrã mistura ids de serviços). Nunca adivinha: ambíguo → não se prevê. */
export function resolverCategoria(lista: readonly CategoriaGestao[], categoria: string, subcategoria: string | null): CategoriaResolvida {
  const c = escolher(lista, categoria);
  if (c.k !== "um") return c.k === "nenhum" ? { k: "nao-existe" } : { k: "ambiguo" };
  if (!subcategoria) return { k: "ok", categoria: c.v.id, subcategoria: null };
  const s = escolher(c.v.subcategorias, subcategoria);
  if (s.k !== "um") return s.k === "nenhum" ? { k: "nao-existe" } : { k: "ambiguo" };
  return { k: "ok", categoria: c.v.id, subcategoria: s.v.id };
}
