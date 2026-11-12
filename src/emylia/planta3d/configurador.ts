// Protótipo (visualizador 3D): o CONFIGURADOR DE FAMÍLIAS, só em memória (estado React; recarregar perde tudo; nada vai para a base nem para o armazenamento).
// Uma família configurada = acabamentos × medidas + uma MATRIZ de células (activa, preço e SKU próprios) + o GLB do fabricante por célula. `paraFamilia`
// converte-a numa `Familia` do catálogo (familias.ts), para o resto do ecrã a tratar como as outras. Funções puras: sem React, sem three.
import { CATEGORIAS_FAMILIA, FAMILIAS, PREFIXO_CFG, type AcabFam, type CategoriaFam, type Familia, type MedidaFam } from "./familias";
import type { TipoMockup } from "./catalogo3d";
import type { TipoEspaco } from "./modelo";
import { FICHEIROS_3D, chaveFicheiro, type Ficheiro3D } from "./modelosHtml/ficheiros";
import { precoUnitario } from "../produtosVisita";

export interface AcabCfg { id: string; nome: string; cor: string; metalness: number; roughness: number; codigo: string }
export interface MedidaCfg { id: string; rotulo: string; ref: string; /** largura, profundidade, altura (cm) */ dim: [number, number, number]; /** preço base (€) */ preco: number }
/** Uma célula da matriz: o acabamento existe nesta medida? `preco`/`sku` próprios sobrepõem o da medida / o automático.
 * Com `produtoId` a variante É um produto que já existe no catálogo: `sku` e `preco` são uma cópia do produto (só leitura, não se editam aqui) e `produtoNome` o nome dele. */
export interface CelulaCfg { ativo: boolean; sku?: string; preco?: number; produtoId?: string; produtoNome?: string }
export interface RegraSku { modo: "auto" | "manual"; sep: string }
export interface FamiliaCfg {
  id: string; marca: string; nome: string; categoria: CategoriaFam; tipo: TipoMockup; espacos: TipoEspaco[];
  acabamentos: AcabCfg[]; medidas: MedidaCfg[];
  /** chave `medidaId|acabId` (celulaKey) */
  celulas: Record<string, CelulaCfg>;
  regraSku: RegraSku;
  /** chave da célula → chave do ficheiro GLB («familia|modelo|acab», modelosHtml/ficheiros.ts); sem entrada, modelo genérico */
  glb?: Record<string, string>;
}
/** Um problema da família e o GRUPO onde se corrige: 1 Família; 2 acabamentos, 3 medidas e 4 combinações. No assistente por produto (PainelConfigurador) o grupo 1 é o passo
 * «Família» e os grupos 2, 3 e 4 são todos o passo «Produtos e acabamentos» (cada produto tem a sua medida e os seus acabamentos). */
export interface Problema { passo: 1 | 2 | 3 | 4; msg: string }

export const celulaKey = (medidaId: string, acabId: string): string => `${medidaId}|${acabId}`;

/** Os tipos de produto que cada categoria aceita (o primeiro é o de omissão). */
export const TIPOS_DA_CATEGORIA: Record<CategoriaFam, TipoMockup[]> = {
  torneiras: ["torneira_cozinha"], lavaloicas: ["lava_loica"], placas: ["placa"], tampos: ["tampo"], cozinha: ["movel", "sifao"],
  banho: ["base_duche", "resguardo", "torneira", "coluna_duche", "movel", "lavatorio_pousar", "espelho"],
};

export function slug(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const idDoNome = (nome: string): string => `${PREFIXO_CFG}${slug(nome)}`;

/** Os GLB do fabricante que servem um tipo (só há de torneira de cozinha e de lava-loiça). */
export function ficheirosCompativeis(tipo: TipoMockup): Ficheiro3D[] {
  const familia = tipo === "torneira_cozinha" ? "torneira" : tipo === "lava_loica" ? "lava_loica" : null;
  return familia ? FICHEIROS_3D.filter((x) => x.familia === familia) : [];
}

/* ------------------------------------------------------------------ SKU e preço por célula */
const medidaDe = (f: FamiliaCfg, id: string) => f.medidas.find((m) => m.id === id);
const acabDe = (f: FamiliaCfg, id: string) => f.acabamentos.find((a) => a.id === id);
/** O SKU de uma célula: automático = ref + separador + código; manual = o escrito à mão, ou o automático se estiver vazio. */
export function skuDaCelula(f: FamiliaCfg, medidaId: string, acabId: string): string {
  const m = medidaDe(f, medidaId), a = acabDe(f, acabId);
  if (!m || !a) return "";
  const c = f.celulas[celulaKey(medidaId, acabId)];
  if (c?.produtoId) return c.sku?.trim() ?? "";
  const auto = `${m.ref}${f.regraSku.sep}${a.codigo}`;
  return f.regraSku.modo === "manual" ? (f.celulas[celulaKey(medidaId, acabId)]?.sku?.trim() || auto) : auto;
}
const precoProprio = (c?: CelulaCfg): number | undefined => (typeof c?.preco === "number" && Number.isFinite(c.preco) && c.preco > 0 ? c.preco : undefined);
/** O preço de uma célula: o dela, senão o da medida. */
export function precoDaCelula(f: FamiliaCfg, medidaId: string, acabId: string): number {
  const c = f.celulas[celulaKey(medidaId, acabId)];
  if (c?.produtoId) return precoProprio(c) ?? 0;
  return precoProprio(c) ?? medidaDe(f, medidaId)?.preco ?? 0;
}

const celulasAtivas = (f: FamiliaCfg): { m: MedidaCfg; a: AcabCfg }[] =>
  f.medidas.flatMap((m) => f.acabamentos.filter((a) => f.celulas[celulaKey(m.id, a.id)]?.ativo === true).map((a) => ({ m, a })));
const nomeMedida = (m: MedidaCfg): string => m.rotulo.trim() || m.ref.trim() || m.id;
/** A medida tem células que são produtos do catálogo? Então o preço vem deles e o «preço base» é só informativo. */
const medidaDoCatalogo = (f: FamiliaCfg, medidaId: string): boolean => Object.entries(f.celulas).some(([k, c]) => k.startsWith(`${medidaId}|`) && !!c.produtoId);

/* ------------------------------------------------------------------ validação */
export function problemas(f: FamiliaCfg, outrosIds: readonly string[] = []): Problema[] {
  const p: Problema[] = [], add = (passo: Problema["passo"], msg: string) => p.push({ passo, msg });
  if (!f.nome.trim()) add(1, "Escreva o nome da família.");
  else if (!slug(f.nome)) add(1, "O nome precisa de letras ou números.");
  if (f.id === PREFIXO_CFG || outrosIds.includes(f.id) || FAMILIAS.some((d) => d.id === f.id)) add(1, `Já existe uma família com o identificador «${f.id}»: mude o nome.`);
  if (f.espacos.length === 0) add(1, "Escolha pelo menos um espaço (onde a família aparece).");
  if (f.acabamentos.length === 0) add(2, "Junte pelo menos um acabamento.");
  for (const a of f.acabamentos) {
    if (!a.nome.trim()) add(2, "Há um acabamento sem nome.");
    if (!a.codigo.trim()) add(2, `O acabamento «${a.nome.trim() || a.id}» não tem código (serve para o SKU).`);
  }
  if (f.medidas.length === 0) add(3, "Junte pelo menos um produto (uma medida com referência).");
  for (const m of f.medidas) {
    if (!(m.preco > 0) && !medidaDoCatalogo(f, m.id)) add(3, `O produto «${nomeMedida(m)}» não tem preço base.`);
    if (!m.ref.trim()) add(3, `O produto «${nomeMedida(m)}» não tem referência.`);
    if (m.dim.some((x) => !(x > 0))) add(3, `O produto «${nomeMedida(m)}» tem dimensões por preencher.`);
  }
  if (f.acabamentos.length > 0 && f.medidas.length > 0) {
    const ativas = celulasAtivas(f);
    if (ativas.length === 0) add(4, "Nenhuma combinação está ativa: ative pelo menos uma cor numa medida.");
    const porSku = new Map<string, string[]>();
    for (const { m, a } of ativas) { const s = skuDaCelula(f, m.id, a.id); porSku.set(s, [...(porSku.get(s) ?? []), `${nomeMedida(m)} × ${a.nome}`]); }
    for (const [sku, onde] of porSku) if (onde.length > 1) add(4, `O SKU «${sku}» repete-se (${onde.join("; ")}).`);
    const porProduto = new Map<string, { nome: string; onde: string[] }>();
    for (const { m, a } of ativas) {
      const c = f.celulas[celulaKey(m.id, a.id)];
      if (!c?.produtoId) continue;
      const nome = c.produtoNome || c.sku || c.produtoId, atual = porProduto.get(c.produtoId) ?? { nome, onde: [] };
      porProduto.set(c.produtoId, { nome, onde: [...atual.onde, `${nomeMedida(m)} × ${a.nome}`] });
      if (precoProprio(c) === undefined) add(3, `O produto do catálogo «${nome}» não tem preço de venda.`);
    }
    for (const [, x] of porProduto) if (x.onde.length > 1) add(4, `O mesmo produto do catálogo («${x.nome}») entra em mais de uma variante (${x.onde.join("; ")}).`);
    if (ativas.length > 0) for (const m of f.medidas) if (!ativas.some((x) => x.m.id === m.id)) add(4, `O produto «${nomeMedida(m)}» não tem nenhum acabamento ativo: junte um acabamento ou remova o produto.`);
  }
  return p;
}
/** Só as mensagens (português legível), por ordem de passo. */
export const validar = (f: FamiliaCfg, outrosIds: readonly string[] = []): string[] => problemas(f, outrosIds).map((x) => x.msg);

/* ------------------------------------------------------------------ da configuração à Familia do catálogo */
/** A `Familia` do catálogo: a matriz substitui `spec.acabamentos` (os acabamentos de cada medida vêm das células activas); preço e SKU por célula vão em `spec.precos/skus`. */
export function paraFamilia(f: FamiliaCfg): Familia {
  const ativas = celulasAtivas(f);
  const medidas: MedidaFam[] = f.medidas.filter((m) => ativas.some((x) => x.m.id === m.id)).map((m) => {
    const dela = ativas.filter((x) => x.m.id === m.id).map((x) => x.a);
    const precos: Record<string, number> = {}, skus: Record<string, string> = {}, produtos: Record<string, string> = {};
    for (const a of dela) {
      const c = f.celulas[celulaKey(m.id, a.id)], proprio = precoProprio(c);
      if (proprio !== undefined) precos[a.id] = proprio;
      skus[a.id] = skuDaCelula(f, m.id, a.id);
      if (c?.produtoId) produtos[a.id] = c.produtoId;
    }
    const [w, d, h] = m.dim;
    const forma = f.tipo === "torneira_cozinha" ? { torneira: { estilo: "monocomando" as const, altura: h * 10, saida: d * 10, alcance: d * 10, base: w * 10 } }
      : f.tipo === "lava_loica" ? { cubas: [{ w: Math.max(w * 10 - 40, 100), d: Math.max(d * 10 - 40, 100), prof: h * 10, left: 20, top: 20 }] } : {};
    return { id: m.id, rotulo: m.rotulo, ref: m.ref, preco: m.preco, dim: m.dim, spec: { ...forma, acabamentos: dela.map((a) => a.id), precos, skus, ...(Object.keys(produtos).length ? { produtos } : {}) } };
  });
  const acabamentos: AcabFam[] = f.acabamentos.filter((a) => ativas.some((x) => x.a.id === a.id)).map((a) => ({ ...a, delta: 0 }));
  const glbCelulas: Record<string, string> = {};
  for (const { m, a } of ativas) { const g = f.glb?.[celulaKey(m.id, a.id)]; if (g) glbCelulas[celulaKey(m.id, a.id)] = g; }
  return {
    id: f.id, nome: f.nome.trim(), marca: f.marca.trim(), categoria: f.categoria, tipo: f.tipo, espacos: f.espacos, acabamentos, medidas,
    nota: "Família configurada no protótipo (só nesta sessão).", origem: "configurada", ...(Object.keys(glbCelulas).length ? { glbCelulas } : {}),
  };
}

/* ------------------------------------------------------------------ edição (funções puras: devolvem uma cópia) */
/** Garante uma célula por medida × acabamento (as novas nascem activas) e tira as de medidas/acabamentos que já não existem. */
export function sincronizar(f: FamiliaCfg): FamiliaCfg {
  const celulas: Record<string, CelulaCfg> = {}, glb: Record<string, string> = {};
  for (const m of f.medidas) for (const a of f.acabamentos) {
    const k = celulaKey(m.id, a.id);
    celulas[k] = f.celulas[k] ?? { ativo: true };
    if (f.glb?.[k]) glb[k] = f.glb[k];
  }
  return { ...f, celulas, glb };
}
export const comNome = (f: FamiliaCfg, nome: string): FamiliaCfg => ({ ...f, nome, id: idDoNome(nome) });
const proximoId = (prefixo: string, ids: readonly string[]): string => { let n = ids.length + 1; while (ids.includes(`${prefixo}${n}`)) n++; return `${prefixo}${n}`; };
export function juntarAcabamento(f: FamiliaCfg): FamiliaCfg {
  const id = proximoId("a", f.acabamentos.map((a) => a.id)), n = f.acabamentos.length + 1;
  return sincronizar({ ...f, acabamentos: [...f.acabamentos, { id, nome: `Acabamento ${n}`, cor: "#b7b9ba", metalness: 0.5, roughness: 0.4, codigo: `A${n}` }] });
}
export const tirarAcabamento = (f: FamiliaCfg, id: string): FamiliaCfg => sincronizar({ ...f, acabamentos: f.acabamentos.filter((a) => a.id !== id) });
export function juntarMedida(f: FamiliaCfg): FamiliaCfg {
  const id = proximoId("m", f.medidas.map((m) => m.id)), n = f.medidas.length + 1;
  return sincronizar({ ...f, medidas: [...f.medidas, { id, rotulo: `Medida ${n}`, ref: `REF-${n}`, dim: [60, 50, 20], preco: 0 }] });
}
export const tirarMedida = (f: FamiliaCfg, id: string): FamiliaCfg => sincronizar({ ...f, medidas: f.medidas.filter((m) => m.id !== id) });

export function criarFamiliaVazia(): FamiliaCfg {
  return juntarMedida(juntarAcabamento({
    id: PREFIXO_CFG, marca: "", nome: "", categoria: "lavaloicas", tipo: "lava_loica", espacos: CATEGORIAS_FAMILIA.find((c) => c.id === "lavaloicas")?.espacos ?? ["cozinha", "outro"],
    acabamentos: [], medidas: [], celulas: {}, regraSku: { modo: "auto", sep: "-" },
  }));
}

/* ------------------------------------------------------------------ POR PRODUTO
 * Na vida real cada medida × acabamento é um produto diferente (referência e preço próprios). O modelo de dados é o mesmo (acabamentos da família + medidas +
 * matriz de células), mas aqui pensa-se por produto: um PRODUTO é uma medida/referência-base; os seus acabamentos são as células que EXISTEM para ele
 * (a chave está em `celulas`; `ativo: false` é uma variante que existe mas está desligada); sem chave, o acabamento não faz parte do produto.
 * Um acabamento é único na família (por código ou nome): juntá-lo a outro produto reutiliza-o. */
export interface DadosAcab { nome?: string; cor?: string; codigo?: string; metalness?: number; roughness?: number }
const norm = (s: string): string => s.trim().toLowerCase();
const existeCelula = (f: FamiliaCfg, medidaId: string, acabId: string): boolean => Object.prototype.hasOwnProperty.call(f.celulas, celulaKey(medidaId, acabId));

/** Os acabamentos que fazem parte de um produto (ativos ou desligados), pela ordem da família. */
export const acabamentosDoProduto = (f: FamiliaCfg, medidaId: string): AcabCfg[] => f.acabamentos.filter((a) => existeCelula(f, medidaId, a.id));

/** Tira as células e os GLB de produtos/acabamentos que já não existem e os acabamentos que já nenhum produto tem. */
function limpar(f: FamiliaCfg): FamiliaCfg {
  const medidas = new Set(f.medidas.map((m) => m.id)), acabs = new Set(f.acabamentos.map((a) => a.id)), usados = new Set<string>();
  const celulas: Record<string, CelulaCfg> = {}, glb: Record<string, string> = {};
  for (const [k, c] of Object.entries(f.celulas)) {
    const i = k.indexOf("|"), mid = k.slice(0, i), aid = k.slice(i + 1);
    if (!medidas.has(mid) || !acabs.has(aid)) continue;
    celulas[k] = c; usados.add(aid);
    if (f.glb?.[k]) glb[k] = f.glb[k];
  }
  return { ...f, acabamentos: f.acabamentos.filter((a) => usados.has(a.id)), celulas, glb };
}

/** Um produto novo (medida/referência-base) sem acabamentos: junta-se-lhe cada um depois. */
export function juntarProduto(f: FamiliaCfg): FamiliaCfg {
  const id = proximoId("m", f.medidas.map((m) => m.id)), n = f.medidas.length + 1;
  return { ...f, medidas: [...f.medidas, { id, rotulo: `Produto ${n}`, ref: `REF-${n}`, dim: [60, 50, 20], preco: 0 }] };
}
export const tirarProduto = (f: FamiliaCfg, id: string): FamiliaCfg => limpar({ ...f, medidas: f.medidas.filter((m) => m.id !== id) });

const ativarNoProduto = (f: FamiliaCfg, medidaId: string, acabId: string): FamiliaCfg => {
  const k = celulaKey(medidaId, acabId);
  return f.celulas[k]?.ativo === true ? f : { ...f, celulas: { ...f.celulas, [k]: { ...f.celulas[k], ativo: true } } };
};

/** Junta um acabamento a um produto. Se a família já tem um com o mesmo código ou nome (sem distinguir maiúsculas) reutiliza-o; senão cria-o. */
export function juntarAcabamentoAoProduto(f: FamiliaCfg, medidaId: string, dados: DadosAcab = {}): FamiliaCfg {
  if (!f.medidas.some((m) => m.id === medidaId)) return f;
  const cod = norm(dados.codigo ?? ""), nom = norm(dados.nome ?? "");
  const existente = f.acabamentos.find((a) => (cod !== "" && norm(a.codigo) === cod) || (nom !== "" && norm(a.nome) === nom));
  if (existente) return ativarNoProduto(f, medidaId, existente.id);
  let n = f.acabamentos.length + 1;
  while (f.acabamentos.some((a) => norm(a.codigo) === `a${n}` || norm(a.nome) === `acabamento ${n}`)) n++;
  const novo: AcabCfg = {
    id: proximoId("a", f.acabamentos.map((a) => a.id)), nome: dados.nome?.trim() || `Acabamento ${n}`, cor: dados.cor ?? "#b7b9ba",
    metalness: dados.metalness ?? 0.5, roughness: dados.roughness ?? 0.4, codigo: dados.codigo?.trim() || `A${n}`,
  };
  return { ...f, acabamentos: [...f.acabamentos, novo], celulas: { ...f.celulas, [celulaKey(medidaId, novo.id)]: { ativo: true } } };
}

/** Junta a um produto um acabamento que a família já tem (pelo id). */
export const juntarAcabamentoExistente = (f: FamiliaCfg, medidaId: string, acabId: string): FamiliaCfg =>
  f.medidas.some((m) => m.id === medidaId) && f.acabamentos.some((a) => a.id === acabId) ? ativarNoProduto(f, medidaId, acabId) : f;

/** Tira um acabamento de UM produto (a célula e o 3D); o acabamento só sai da família se já nenhum produto o tem. */
export function tirarAcabamentoDoProduto(f: FamiliaCfg, medidaId: string, acabId: string): FamiliaCfg {
  const k = celulaKey(medidaId, acabId), celulas = { ...f.celulas }, glb = { ...f.glb };
  delete celulas[k]; delete glb[k];
  return limpar({ ...f, celulas, glb });
}

/** «Copiar os acabamentos deste produto para os outros»: junta aos outros os acabamentos ativos deste que lhes faltam (sem tirar nenhum, sem copiar preços, SKU nem 3D). */
export function copiarAcabamentosParaOutros(f: FamiliaCfg, deMedidaId: string): FamiliaCfg {
  const dele = acabamentosDoProduto(f, deMedidaId).filter((a) => f.celulas[celulaKey(deMedidaId, a.id)]?.ativo === true);
  return f.medidas.filter((m) => m.id !== deMedidaId).reduce((r, m) => dele.reduce((g, a) => ativarNoProduto(g, m.id, a.id), r), f);
}
/** «Aplicar o mesmo acabamento a todos os produtos». */
export const aplicarAcabamentoATodos = (f: FamiliaCfg, acabId: string): FamiliaCfg =>
  f.acabamentos.some((a) => a.id === acabId) ? f.medidas.reduce((r, m) => ativarNoProduto(r, m.id, acabId), f) : f;

/** Muda a variante-produto (célula): ativo, preço ou SKU próprios. Só se o acabamento já faz parte do produto. */
export function alterarVariante(f: FamiliaCfg, medidaId: string, acabId: string, p: Partial<CelulaCfg>): FamiliaCfg {
  if (!existeCelula(f, medidaId, acabId)) return f;
  const k = celulaKey(medidaId, acabId), atual = f.celulas[k];
  // um produto do catálogo manda no seu SKU e no seu preço: aqui só se liga ou desliga
  const permitido: Partial<CelulaCfg> = atual.produtoId ? (p.ativo === undefined ? {} : { ativo: p.ativo }) : p;
  return { ...f, celulas: { ...f.celulas, [k]: { ...atual, ...permitido } } };
}
/** Escolhe (ou, com chave vazia, tira) o GLB do fabricante de uma variante. */
export function definirGlbDaVariante(f: FamiliaCfg, medidaId: string, acabId: string, chave: string): FamiliaCfg {
  const k = celulaKey(medidaId, acabId), glb = { ...f.glb };
  if (chave) glb[k] = chave; else delete glb[k];
  return { ...f, glb };
}
/** Muda nome, cor ou código de um acabamento: vale para todos os produtos que o têm (é o mesmo acabamento da família). */
export const alterarAcabamento = (f: FamiliaCfg, acabId: string, p: DadosAcab): FamiliaCfg =>
  ({ ...f, acabamentos: f.acabamentos.map((a) => (a.id === acabId ? { ...a, ...p } : a)) });

/** Uma linha do resumo: uma variante ativa, ou seja, um produto real com a sua referência. */
export interface LinhaVariante { chave: string; medidaId: string; acabId: string; produto: string; ref: string; acabamento: string; sku: string; preco: number; tem3d: boolean; /** o produto do catálogo de onde vêm o SKU e o preço */ produtoId?: string }
export const linhasDeVariantes = (f: FamiliaCfg): LinhaVariante[] => celulasAtivas(f).map(({ m, a }) => {
  const chave = celulaKey(m.id, a.id);
  return { chave, medidaId: m.id, acabId: a.id, produto: nomeMedida(m), ref: m.ref, acabamento: a.nome.trim() || a.id, sku: skuDaCelula(f, m.id, a.id), preco: precoDaCelula(f, m.id, a.id), tem3d: Boolean(f.glb?.[chave]), ...(f.celulas[chave]?.produtoId ? { produtoId: f.celulas[chave].produtoId } : {}) };
});
/** «N produtos = N referências»: produtos = variantes ativas; referências = SKUs distintos (se divergem, há SKUs repetidos). */
export function resumoDeProdutos(f: FamiliaCfg): { produtos: number; referencias: number; texto: string } {
  const linhas = linhasDeVariantes(f), produtos = linhas.length, referencias = new Set(linhas.map((l) => l.sku)).size;
  return { produtos, referencias, texto: `${produtos} ${produtos === 1 ? "produto" : "produtos"} = ${referencias} ${referencias === 1 ? "referência" : "referências"}` };
}
/** Prepara uma família (nova, guardada ou do exemplo) para a UI por produto: o SKU passa a «automático, editável» (modo manual: o escrito à mão ou, se vazio, ref+sep+código).
 * Em modo automático os SKUs escritos eram ignorados, por isso descartam-se; nenhum SKU efetivo muda. Devolve uma cópia. */
export function prepararParaEdicao(f: FamiliaCfg): FamiliaCfg {
  const c = structuredClone(f);
  if (c.regraSku.modo === "auto") for (const k of Object.keys(c.celulas)) if (!c.celulas[k].produtoId) delete c.celulas[k].sku;
  return { ...c, regraSku: { ...c.regraSku, modo: "manual" } };
}

/** O caso do utilizador: uma lava-loiça Frasa Lody são 9 PRODUTOS (3 medidas × 3 acabamentos), cada um com a sua referência, o seu preço e o seu GLB. */
export function exemploLodyFrasa(): FamiliaCfg {
  const acab = (id: string, nome: string, cor: string, roughness: number, codigo: string): AcabCfg => ({ id, nome, cor, metalness: 1, roughness, codigo });
  const preco = { "40": [139, 149, 134], "50": [159, 169, 154], "70": [199, 209, 194] } as const, ids = ["cobre", "oro", "gunmetal"] as const;
  const celulas: Record<string, CelulaCfg> = {}, glb: Record<string, string> = {};
  for (const tam of ["40", "50", "70"] as const) ids.forEach((a, i) => {
    celulas[celulaKey(`lody${tam}`, a)] = { ativo: true, preco: preco[tam][i] };
    glb[celulaKey(`lody${tam}`, a)] = chaveFicheiro("lava_loica", `lody${tam}`, a);
  });
  return {
    id: "cfg:lava-loica-lody-frasa-exemplo", marca: "FRASA", nome: "Lava-loiça Lody, FRASA (exemplo: 9 produtos)", categoria: "lavaloicas", tipo: "lava_loica", espacos: ["cozinha", "outro"],
    acabamentos: [acab("cobre", "Cobre", "#bc825b", 0.3, "CO"), acab("oro", "Gold", "#c9ad68", 0.3, "GO"), acab("gunmetal", "Gunmetal", "#62605e", 0.29, "GM")],
    medidas: [
      { id: "lody40", rotulo: "40 cm", ref: "LOD-40", dim: [44, 44, 20], preco: 139 },
      { id: "lody50", rotulo: "50 cm", ref: "LOD-50", dim: [54, 44, 20], preco: 159 },
      { id: "lody70", rotulo: "70 cm", ref: "LOD-70", dim: [74, 44, 20], preco: 199 },
    ],
    celulas, regraSku: { modo: "auto", sep: "-" }, glb,
  };
}

/** O exemplo para ver logo algo: Lava-loiça Keran (RODI HOME), 2 acabamentos × 2 medidas, uma combinação inactiva e um preço próprio. */
export function exemploKeran(): FamiliaCfg {
  return {
    id: "cfg:lava-loica-keran", marca: "RODI HOME", nome: "Lava-loiça Keran", categoria: "lavaloicas", tipo: "lava_loica", espacos: ["cozinha", "outro"],
    acabamentos: [
      { id: "inox", nome: "Inox escovado", cor: "#c3c7ca", metalness: 1, roughness: 0.3, codigo: "IX" },
      { id: "gunmetal", nome: "Gun Metal", cor: "#62605e", metalness: 1, roughness: 0.29, codigo: "GM" },
    ],
    medidas: [
      { id: "m80", rotulo: "80 cm", ref: "KER-80", dim: [80, 50, 16], preco: 149 },
      { id: "m100", rotulo: "100 cm (1 cuba e meia)", ref: "KER-100", dim: [100, 50, 16], preco: 189 },
    ],
    celulas: { "m80|inox": { ativo: true }, "m80|gunmetal": { ativo: false }, "m100|inox": { ativo: true }, "m100|gunmetal": { ativo: true, preco: 199 } },
    regraSku: { modo: "auto", sep: "-" },
    glb: { "m80|inox": chaveFicheiro("lava_loica", "keran80", "inox"), "m100|inox": chaveFicheiro("lava_loica", "keran100", "inox") },
  };
}

/* ------------------------------------------------------------------ JUNTAR PRODUTOS QUE JÁ EXISTEM NO CATÁLOGO
 * Em vez de recriar cada variante, escolhem-se produtos reais do catálogo (só leitura): cada um é UMA variante (medida × acabamento) e traz o seu SKU e o seu preço de
 * venda, que aqui não se editam. O palpite por análise do nome propõe a medida e o acabamento; o utilizador corrige. Funções puras, sem React.
 * O catálogo de exemplo não traz o acabamento em colunas: está no nome («Lody 40 U-F - Cobre») ou no subtipo («Cubas inox»), por isso é preciso adivinhá-lo. */

/** A margem-alvo (%) com que o protótipo calcula o preço de um produto sem PVP (o valor de omissão do motor, `cfg.alvo`). */
export const ALVO_PROTO = 35;
/** Um produto do catálogo como o configurador o vê: o preço de venda já resolvido (o PVP real, senão custo ÷ (1 − margem-alvo), como o catálogo). */
export interface ProdutoRef { id: string; n: string; marca?: string; sku?: string; sub?: string; /** preço de venda por unidade (€, s/IVA); 0 = sem preço */ preco: number; /** o catálogo não tem PVP: o preço foi calculado pelo custo */ semPvp: boolean }
/** O mínimo que se lê de um `Produto` do catálogo (v2/catalogoModelo.ts). */
export interface ProdutoDoCatalogo { id: string; n: string; marca?: string; sku?: string; sub?: string; custo: number; pvp?: number }
export function refDoProduto(p: ProdutoDoCatalogo, alvo: number = ALVO_PROTO): ProdutoRef {
  const sku = p.sku?.trim() || p.id, preco = precoUnitario({ custo: p.custo, ...(p.pvp != null ? { pvp: p.pvp } : {}) }, alvo);
  return { id: p.id, n: p.n, ...(p.marca ? { marca: p.marca } : {}), sku, ...(p.sub ? { sub: p.sub } : {}), preco: Number.isFinite(preco) && preco > 0 ? preco : 0, semPvp: !(p.pvp != null && p.pvp > 0) };
}

const plano = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
interface AcabConhecido { id: string; codigo: string; cor: string; metalness: number; roughness: number; re: RegExp }
/** Os acabamentos que o nome costuma trazer (o `id` é o do catálogo 3D, para propor o GLB do fabricante). */
const ACABAMENTOS_CONHECIDOS: readonly AcabConhecido[] = [
  { id: "cobre", codigo: "CO", cor: "#bc825b", metalness: 1, roughness: 0.3, re: /\b(cobre|copper)\b/g },
  { id: "oro", codigo: "GO", cor: "#c9ad68", metalness: 1, roughness: 0.3, re: /\b(oro|gold|dourad[oa])\b/g },
  { id: "gunmetal", codigo: "GM", cor: "#62605e", metalness: 1, roughness: 0.29, re: /\bgun ?metal\b/g },
  { id: "inox", codigo: "IX", cor: "#c3c7ca", metalness: 1, roughness: 0.3, re: /\binox(idavel)?\b/g },
  { id: "negro", codigo: "NE", cor: "#151617", metalness: 0.05, roughness: 0.5, re: /\b(negro|preto|preta|black|midnight)\b/g },
  { id: "blanco", codigo: "BL", cor: "#f2f2ef", metalness: 0.02, roughness: 0.4, re: /\b(blanco|branco|branca|white)\b/g },
  { id: "chrome", codigo: "CR", cor: "#d9dde0", metalness: 1, roughness: 0.12, re: /\b(cromad[oa]|cromo|chrome)\b/g },
  { id: "nickel", codigo: "NI", cor: "#b9bcbd", metalness: 1, roughness: 0.2, re: /\bniquel\b/g },
  { id: "brushed", codigo: "AC", cor: "#b7b9ba", metalness: 1, roughness: 0.27, re: /\b(acero|escovad[oa])\b/g },
  { id: "titanio", codigo: "TI", cor: "#55524d", metalness: 1, roughness: 0.3, re: /\btitanio\b/g },
  { id: "antracite", codigo: "AN", cor: "#4a4e53", metalness: 0, roughness: 0.5, re: /\bantracite\b/g },
];
/** O acabamento conhecido que aparece MAIS À DIREITA no texto (em «BLANCO INOX LEMIS», Blanco é a marca e Inox o acabamento) e o pedaço do texto original. */
function acabamentoNoTexto(texto: string): { a: AcabConhecido; achado: string } | undefined {
  const t = plano(texto);
  let melhor: { a: AcabConhecido; achado: string; i: number } | undefined;
  for (const a of ACABAMENTOS_CONHECIDOS) for (const m of t.matchAll(a.re)) if (!melhor || m.index > melhor.i) melhor = { a, achado: texto.slice(m.index, m.index + m[0].length), i: m.index };
  return melhor;
}
const formatoNome = (s: string): string => (s === s.toUpperCase() || s === s.toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
const iniciais = (s: string): string => { const p = s.trim().split(/\s+/).filter(Boolean); return (p.length > 1 ? p.map((x) => x[0]).join("") : (p[0] ?? "").slice(0, 2)).toUpperCase(); };
/** O pedaço depois do último « - » do nome, se parece um acabamento (sem números, até 3 palavras, sem «cuba»). */
function fimDoNome(nome: string): string {
  const partes = nome.split(/\s+[-–—]\s+/);
  const fim = partes.length > 1 ? partes[partes.length - 1].trim() : "";
  return fim && !/\d/.test(fim) && !/cuba/i.test(fim) && fim.split(/\s+/).length <= 3 ? fim : "";
}

export interface PalpiteProduto {
  /** o rótulo da medida («40 cm», «60×45×80 cm» ou «Única») */
  medida: string; /** largura, profundidade, altura (cm) */ dim: [number, number, number]; /** a largura em cm lida do nome */ numero?: number;
  acabamento: string; cor: string; codigo: string; metalness: number; roughness: number; /** o id do acabamento no catálogo 3D, quando o nome o diz */ acabId?: string;
}
/** O palpite da medida e do acabamento de um produto a partir do nome (e do subtipo): sempre editável. */
export function palpiteDoProduto(nome: string, o: { sub?: string; tipo?: TipoMockup } = {}): PalpiteProduto {
  const texto = nome.replace(/\s+/g, " ").trim(), t = plano(texto), lava = o.tipo === "lava_loica";
  // acabamento: o fim do nome («… - Cobre»), senão o que está mais à direita no nome, senão no subtipo
  const fim = fimDoNome(texto);
  const achado = fim ? acabamentoNoTexto(fim) : (acabamentoNoTexto(texto) ?? acabamentoNoTexto(o.sub ?? ""));
  let acab: Pick<PalpiteProduto, "acabamento" | "cor" | "codigo" | "metalness" | "roughness" | "acabId"> = { acabamento: "Padrão", cor: "#b7b9ba", codigo: "STD", metalness: 0.5, roughness: 0.4 };
  if (achado) acab = { acabamento: formatoNome(fim || achado.achado), cor: achado.a.cor, codigo: achado.a.codigo, metalness: achado.a.metalness, roughness: achado.a.roughness, acabId: achado.a.id };
  else if (fim) acab = { acabamento: formatoNome(fim), cor: "#b7b9ba", codigo: iniciais(fim), metalness: 0.5, roughness: 0.4 };
  // medida: «60x45x80», senão «86CM», senão o número a seguir a «CUBA», senão o primeiro número de 2-3 algarismos (20 a 300) que não conta cubas
  const tres = /(\d{2,3})\s*[x×]\s*(\d{2,3})(?:\s*[x×]\s*(\d{1,3}))?/.exec(t);
  if (tres) {
    const w = Number(tres[1]), d = Number(tres[2]), h = tres[3] ? Number(tres[3]) : 20;
    return { medida: `${w}×${d}${tres[3] ? `×${h}` : ""} cm`, dim: [w, d, h], numero: w, ...acab };
  }
  const n = /(\d{2,3})\s*cm\b/.exec(t)?.[1] ?? /cubas?\s+(\d{2,3})\b/.exec(t)?.[1]
    ?? [...t.matchAll(/\b(\d{2,3})\b(?!\s*cubas?)/g)].map((m) => Number(m[1])).find((x) => x >= 20 && x <= 300)?.toString();
  if (n === undefined) return { medida: "Única", dim: lava ? [50, 44, 20] : [60, 50, 20], ...acab };
  const numero = Number(n);
  return { medida: `${numero} cm`, dim: lava ? [numero + 4, 44, 20] : [numero, 50, 20], numero, ...acab };
}

/** O nome e a marca sugeridos para a família: o começo comum dos nomes (sem números nem «CUBA» no fim) e a marca mais frequente. */
export function sugerirFamilia(refs: readonly ProdutoRef[]): { nome: string; marca: string } {
  if (refs.length === 0) return { nome: "", marca: "" };
  const marcas = new Map<string, number>();
  for (const r of refs) if (r.marca?.trim()) marcas.set(r.marca.trim(), (marcas.get(r.marca.trim()) ?? 0) + 1);
  const marca = [...marcas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const palavras = (n: string) => n.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const numerica = /^\d+([.,]\d+)?(cm)?$/i, solta = /^\d+([.,]\d+)?(cm)?$|^cubas?$|^[-–—]$/i;
  const limpar = (p: string[]) => { const q = [...p]; while (q.length && solta.test(q[q.length - 1])) q.pop(); return q; };
  const um = (n: string) => {
    const fim = fimDoNome(n), base = fim ? n.slice(0, n.lastIndexOf(fim)).replace(/\s+[-–—]\s*$/, "") : n;
    return palavras(base).filter((w) => !numerica.test(w)).join(" ");
  };
  if (refs.length === 1) return { nome: um(refs[0].n), marca };
  const todas = refs.map((r) => palavras(r.n)), primeira = todas[0], comum: string[] = [];
  for (let i = 0; i < primeira.length && todas.every((p) => p[i] !== undefined && plano(p[i]) === plano(primeira[i])); i++) comum.push(primeira[i]);
  return { nome: limpar(comum).join(" ") || um(refs[0].n), marca };
}

/** A categoria (e o tipo, que a categoria aceita) sugerida pelo tipo de mockup do produto. */
export function categoriaSugerida(tipo: TipoMockup): { categoria: CategoriaFam; tipo: TipoMockup } {
  const direto: Partial<Record<TipoMockup, CategoriaFam>> = { lava_loica: "lavaloicas", torneira_cozinha: "torneiras", placa: "placas", tampo: "tampos", bancada: "tampos", sifao: "cozinha" };
  const categoria = direto[tipo] ?? (TIPOS_DA_CATEGORIA.banho.includes(tipo) ? "banho" : "cozinha");
  return { categoria, tipo: TIPOS_DA_CATEGORIA[categoria].includes(tipo) ? tipo : TIPOS_DA_CATEGORIA[categoria][0] };
}

/** A chave do GLB do fabricante que o nome do produto casa (modelo = palavra do nome; números a ±1 cm; sufixo «N»; acabamento do palpite), ou vazio. */
export function ficheiroSugerido(tipo: TipoMockup, nome: string, palpite: Pick<PalpiteProduto, "acabId" | "numero">): string {
  const familia = tipo === "torneira_cozinha" ? "torneira" : tipo === "lava_loica" ? "lava_loica" : null;
  if (!familia || !palpite.acabId) return "";
  const palavras = plano(nome).split(/[^a-z0-9]+/).filter(Boolean);
  let melhor: { x: Ficheiro3D; custo: number } | undefined;
  for (const x of FICHEIROS_3D) {
    if (x.familia !== familia || x.acab !== palpite.acabId) continue;
    const m = /^([a-z]+)(\d+)?([a-z]*)$/.exec(x.modelo);
    if (!m || !palavras.includes(m[1])) continue;
    if (!m[3] && palavras.includes("n")) continue;
    if (m[3] && !palavras.includes(m[3])) continue;
    let custo = 0;
    if (m[2]) {
      if (palpite.numero === undefined) continue;
      custo = Math.abs(Number(m[2]) - palpite.numero);
      if (custo > 1) continue;
    }
    if (!melhor || custo < melhor.custo) melhor = { x, custo };
  }
  return melhor ? chaveFicheiro(melhor.x.familia, melhor.x.modelo, melhor.x.acab) : "";
}

/** O que o utilizador atribui a cada produto escolhido: a medida e o acabamento (e, se quiser, o GLB do fabricante). */
export interface AtribuicaoProduto { produtoId: string; medida: string; dim: [number, number, number]; acabamento: string; cor: string; codigo: string; metalness?: number; roughness?: number; glb?: string }

/** Monta a família a partir dos produtos escolhidos e das atribuições (mantém o nome, a marca, a categoria, o tipo e os espaços de `base`).
 * Produtos com a mesma medida (rótulo) juntam-se num mesmo «produto» da família, com as dimensões do primeiro; o mesmo acabamento (nome) é um só. Se dois produtos
 * pedem a mesma medida × acabamento, o segundo fica de fora e há um conflito para corrigir. */
export function familiaDeProdutos(base: FamiliaCfg, refs: readonly ProdutoRef[], atribuicoes: readonly AtribuicaoProduto[]): { familia: FamiliaCfg; conflitos: string[] } {
  const porId = new Map(refs.map((r) => [r.id, r] as const)), compativeis = new Set(ficheirosCompativeis(base.tipo).map((x) => chaveFicheiro(x.familia, x.modelo, x.acab)));
  const medidas: MedidaCfg[] = [], acabamentos: AcabCfg[] = [], celulas: Record<string, CelulaCfg> = {}, glb: Record<string, string> = {}, ocupado = new Map<string, string>(), conflitos: string[] = [];
  for (const a of atribuicoes) {
    const r = porId.get(a.produtoId);
    if (!r) continue;
    const rotulo = a.medida.trim() || "Única", nomeAcab = a.acabamento.trim() || "Padrão";
    let m = medidas.find((x) => norm(x.rotulo) === norm(rotulo));
    if (!m) { m = { id: `m${medidas.length + 1}`, rotulo, ref: r.sku?.trim() || r.id, dim: [...a.dim], preco: 0 }; medidas.push(m); }
    let c = acabamentos.find((x) => norm(x.nome) === norm(nomeAcab));
    if (!c) { c = { id: `a${acabamentos.length + 1}`, nome: nomeAcab, cor: a.cor, metalness: a.metalness ?? 0.5, roughness: a.roughness ?? 0.4, codigo: a.codigo.trim() || `A${acabamentos.length + 1}` }; acabamentos.push(c); }
    const k = celulaKey(m.id, c.id);
    if (ocupado.has(k)) { conflitos.push(`Os produtos «${ocupado.get(k)}» e «${r.n}» têm a mesma medida (${m.rotulo}) e o mesmo acabamento (${c.nome}): mude a medida ou o acabamento de um deles.`); continue; }
    ocupado.set(k, r.n);
    celulas[k] = { ativo: true, produtoId: r.id, produtoNome: r.n, sku: r.sku?.trim() || r.id, ...(r.preco > 0 ? { preco: r.preco } : {}) };
    if (a.glb && compativeis.has(a.glb)) glb[k] = a.glb;
  }
  for (const m of medidas) {
    const precos = Object.entries(celulas).filter(([k]) => k.startsWith(`${m.id}|`)).map(([, x]) => x.preco ?? 0).filter((x) => x > 0);
    m.preco = precos.length ? Math.min(...precos) : 0;
  }
  return { familia: { ...base, acabamentos, medidas, celulas, glb, regraSku: { ...base.regraSku, modo: "manual" } }, conflitos };
}
