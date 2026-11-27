// 20/11: os dados das FAMÍLIAS gravadas na base. Chama as funções cat_*familia* de 20270125100000_catalogo_familias.sql (POR APLICAR: até lá respondem
// «Ainda não disponível nesta base»). Mesmo padrão de modelosDados.ts: `chamar` traduz os erros (CT001 sem permissão, CT003 não encontrado, CT004 noutra
// família, nome repetido ou alterada por outra pessoa, com a mensagem em português da base). A base guarda só o agrupamento (nome, eixos por id do atributo,
// produtos); tudo o resto deriva-se dos produtos no núcleo (nucleo.ts).
import type { AtributoDef } from "../v2/catalogoModelo";
import { chamar, type ResG } from "../atributosGestao";
import type { LinhaPaginaProduto } from "../real/produtosPaginados";
import { nomeDoAtributo } from "./atributosFamilia";
import type { EixoVista, FamiliaVista, OutraMedida, ProdutoVista, ValorVista } from "./escolhaVariacao";
import type { EixosCfg } from "./nucleo";
import { MAX_SELECAO } from "./selecao";

/** Uma família da lista. `versao` é o updated_at da base, devolvido tal e qual ao gravar (concorrência otimista). */
export interface FamiliaResumo { id: string; nome: string; nProdutos: number; versao: string }
export type PapelEixo = "cor" | "medida";
/** Um eixo como a base o guarda: o id do atributo e o papel; a posição é a ordem na lista. */
export interface EixoGravado { atributoId: string; papel: PapelEixo }
/** Uma família lida para a reabrir: os eixos pela posição e as linhas dos produtos vivos (as mesmas da página de produtos, com custo e PVP mascarados sem services.view). */
export interface FamiliaLida { id: string; nome: string; versao: string; veValores: boolean; eixos: EixoGravado[]; linhas: LinhaPaginaProduto[] }
/** O que se grava: `id` null cria; `versao` é a lida (null ao criar). */
export interface FamiliaParaGravar { id: string | null; nome: string; eixos: readonly EixoGravado[]; produtos: readonly string[]; versao: string | null }
export interface FamiliaGravada { id: string; nome: string; versao: string }
export interface FamiliaDoProduto { familiaId: string; nome: string }

type Bruto = Record<string, unknown>;
const texto = (x: unknown): string => (typeof x === "string" ? x : "");
const inteiro = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const objeto = (x: unknown): Bruto | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Bruto) : null);
const ERRO_LER = "Não foi possível ler as famílias.";

export async function lerFamilias(org: string): Promise<ResG<FamiliaResumo[]>> {
  const r = await chamar("cat_ler_familias", { p_org: org }, ERRO_LER);
  if ("erro" in r) return r;
  const lista = objeto(r.v)?.familias;
  if (!Array.isArray(lista)) return { ok: false, erro: ERRO_LER };
  return { ok: true, v: lista.flatMap((x) => { const o = objeto(x); return o ? [{ id: texto(o.id), nome: texto(o.nome), nProdutos: inteiro(o.n_produtos), versao: texto(o.updated_at) }] : []; }) };
}

/** Os eixos da resposta, pela posição; o que não for um eixo válido ignora-se. */
function eixosDe(x: unknown): EixoGravado[] {
  if (!Array.isArray(x)) return [];
  return x.flatMap((e) => {
    const o = objeto(e);
    if (!o || (o.papel !== "cor" && o.papel !== "medida") || !texto(o.attribute_id)) return [];
    return [{ atributoId: texto(o.attribute_id), papel: o.papel as PapelEixo, posicao: inteiro(o.posicao) }];
  }).sort((a, b) => a.posicao - b.posicao).map(({ atributoId, papel }) => ({ atributoId, papel }));
}

export async function lerFamilia(org: string, id: string): Promise<ResG<FamiliaLida>> {
  const erro = "Não foi possível ler a família.";
  const r = await chamar("cat_ler_familia", { p_org: org, p_id: id }, erro);
  if ("erro" in r) return r;
  const o = objeto(r.v), f = objeto(o?.familia);
  if (!o || !f || !Array.isArray(o.produtos)) return { ok: false, erro };
  const linhas = (o.produtos as unknown[]).filter((x): x is LinhaPaginaProduto => !!objeto(x) && typeof (x as Bruto).id === "string");
  return { ok: true, v: { id: texto(f.id), nome: texto(f.nome), versao: texto(f.updated_at), veValores: o.ve_valores === true, eixos: eixosDe(f.eixos), linhas } };
}

const textoOuNull = (x: unknown): string | null => (typeof x === "string" && x ? x : null);
const numeroOuNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

function valoresDe(x: unknown): Record<string, ValorVista> {
  const o = objeto(x);
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).flatMap(([id, v]) => {
    const b = objeto(v);
    return b && texto(b.valor) ? [[id, { valor: texto(b.valor), nome: texto(b.nome) || texto(b.valor), hex: textoOuNull(b.hex), foto: textoOuNull(b.foto), sigla: textoOuNull(b.sigla), ordem: numeroOuNull(b.ordem), isMetal: b.is_metal === true }]] : [];
  }));
}

function produtoVistaDe(x: unknown): ProdutoVista[] {
  const o = objeto(x);
  if (!o || !texto(o.id)) return [];
  const m = objeto(o.medida), a = objeto(o.aplicacao);
  return [{
    id: texto(o.id), nome: texto(o.nome), sku: texto(o.sku), estado: texto(o.estado), pvp: numeroOuNull(o.pvp), stock: numeroOuNull(o.stock),
    modeloId: textoOuNull(o.modelo_id), modelo: textoOuNull(o.modelo), subcategoriaId: textoOuNull(o.subcategoria_id), subcategoria: textoOuNull(o.subcategoria),
    categoriaId: textoOuNull(o.categoria_id), categoria: textoOuNull(o.categoria),
    medida: m && texto(m.attribute_id) ? { atributoId: texto(m.attribute_id), valor: m.valor ?? null, unidade: textoOuNull(m.unidade), texto: textoOuNull(m.texto) } : null,
    aplicacao: a && texto(a.valor) ? { valor: texto(a.valor), nome: texto(a.nome) || texto(a.valor) } : null,
    valores: valoresDe(o.valores),
  }];
}

/**
 * 26/11 (20270129300000, cat_ler_familia_vista, POR APLICAR: até lá responde «Ainda não disponível nesta base»): a família para a vista com 3D. Por produto traz o valor de cada
 * eixo com a cor, a foto e o nome da opção, o PVP (só com services.view) e o stock (só com inventory.view); null sem a permissão. Só lê.
 */
export async function lerFamiliaVista(org: string, id: string): Promise<ResG<FamiliaVista>> {
  const erro = "Não foi possível ler a família.";
  const r = await chamar("cat_ler_familia_vista", { p_org: org, p_id: id }, erro);
  if ("erro" in r) return r;
  const o = objeto(r.v), f = objeto(o?.familia);
  if (!o || !f || !texto(f.id) || !Array.isArray(o.produtos) || !Array.isArray(o.eixos)) return { ok: false, erro };
  const eixos: EixoVista[] = o.eixos.flatMap((e): EixoVista[] => {
    const b = objeto(e);
    return b && texto(b.attribute_id) ? [{ atributoId: texto(b.attribute_id), code: texto(b.code), rotulo: texto(b.rotulo), papel: texto(b.papel), posicao: inteiro(b.posicao), isMeasurement: b.is_measurement === true }] : [];
  }).sort((a, b) => a.posicao - b.posicao);
  const outras: OutraMedida[] = (Array.isArray(o.outras_medidas) ? o.outras_medidas : []).flatMap((e): OutraMedida[] => {
    const b = objeto(e);
    return b && texto(b.id) ? [{ id: texto(b.id), nome: texto(b.nome), atual: b.atual === true, medida: textoOuNull(b.medida), medidaValor: b.medida_valor ?? null, unidade: textoOuNull(b.unidade) }] : [];
  });
  return { ok: true, v: { id: texto(f.id), nome: texto(f.nome), veValores: o.ve_valores === true, veStock: o.ve_stock === true, eixos, produtos: o.produtos.flatMap(produtoVistaDe), outrasMedidas: outras } };
}

/** A família de cada produto (para a marca «já está noutra família»). Sem produtos não vai à base; nunca pede mais de MAX_SELECAO. */
export async function familiasDosProdutos(org: string, ids: readonly string[]): Promise<ResG<Map<string, FamiliaDoProduto>>> {
  if (ids.length === 0) return { ok: true, v: new Map() };
  const erro = "Não foi possível ver as famílias dos produtos.";
  const r = await chamar("cat_familias_dos_produtos", { p_org: org, p_produtos: ids.slice(0, MAX_SELECAO) }, erro);
  if ("erro" in r) return r;
  const lista = objeto(r.v)?.produtos;
  if (!Array.isArray(lista)) return { ok: false, erro };
  const m = new Map<string, FamiliaDoProduto>();
  for (const x of lista) { const o = objeto(x); if (o && texto(o.produto_id)) m.set(texto(o.produto_id), { familiaId: texto(o.familia_id), nome: texto(o.nome) }); }
  return { ok: true, v: m };
}

export async function guardarFamilia(org: string, f: FamiliaParaGravar): Promise<ResG<FamiliaGravada>> {
  const erro = "Não foi possível guardar a família.";
  const r = await chamar("cat_guardar_familia", {
    p_org: org, p_id: f.id, p_nome: f.nome, p_eixos: f.eixos.map((e) => ({ attribute_id: e.atributoId, papel: e.papel })), p_produtos: [...f.produtos], p_versao: f.versao,
  }, erro);
  if ("erro" in r) return r;
  const g = objeto(objeto(r.v)?.familia);
  if (!g || !texto(g.id)) return { ok: false, erro };
  return { ok: true, v: { id: texto(g.id), nome: texto(g.nome), versao: texto(g.updated_at) } };
}

export function apagarFamilia(org: string, id: string): Promise<ResG<unknown>> {
  return chamar("cat_apagar_familia", { p_org: org, p_id: id }, "Não foi possível apagar a família.");
}

/** Os eixos do núcleo (por nome) como a base os guarda (por id): a cor primeiro, depois a medida pela ordem. Um nome sem definição falha com esse nome em `erro`. */
export function eixosParaGravar(eixos: EixosCfg, defs: readonly AtributoDef[]): ResG<EixoGravado[]> {
  const porNome = new Map<string, string>();
  for (const d of defs) if (!porNome.has(nomeDoAtributo(d))) porNome.set(nomeDoAtributo(d), d.id);
  const pedidos: { nome: string; papel: PapelEixo }[] = [...(eixos.cor ? [{ nome: eixos.cor, papel: "cor" as const }] : []), ...eixos.medida.map((nome) => ({ nome, papel: "medida" as const }))];
  const v: EixoGravado[] = [];
  for (const p of pedidos) {
    const id = porNome.get(p.nome);
    if (!id) return { ok: false, erro: p.nome };
    v.push({ atributoId: id, papel: p.papel });
  }
  return { ok: true, v };
}

/** Os eixos gravados (por id) como o núcleo os lê (por nome). Um atributo que já não está nas definições sai (o núcleo volta a validar os eixos ao abrir). */
export function eixosDaBase(eixos: readonly EixoGravado[], defs: readonly AtributoDef[]): EixosCfg {
  const porId = new Map(defs.map((d) => [d.id, nomeDoAtributo(d)] as const));
  const cor = eixos.find((e) => e.papel === "cor" && porId.has(e.atributoId));
  return { cor: cor ? porId.get(cor.atributoId) ?? null : null, medida: eixos.flatMap((e) => (e.papel === "medida" && porId.has(e.atributoId) ? [porId.get(e.atributoId) as string] : [])) };
}
