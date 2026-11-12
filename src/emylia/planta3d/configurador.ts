// Protótipo (visualizador 3D): o CONFIGURADOR DE FAMÍLIAS, só em memória (estado React; recarregar perde tudo; nada vai para a base nem para o armazenamento).
// Uma família configurada = acabamentos × medidas + uma MATRIZ de células (activa, preço e SKU próprios) + o GLB do fabricante por célula. `paraFamilia`
// converte-a numa `Familia` do catálogo (familias.ts), para o resto do ecrã a tratar como as outras. Funções puras: sem React, sem three.
import { CATEGORIAS_FAMILIA, FAMILIAS, PREFIXO_CFG, type AcabFam, type CategoriaFam, type Familia, type MedidaFam } from "./familias";
import type { TipoMockup } from "./catalogo3d";
import type { TipoEspaco } from "./modelo";
import { FICHEIROS_3D, chaveFicheiro, type Ficheiro3D } from "./modelosHtml/ficheiros";

export interface AcabCfg { id: string; nome: string; cor: string; metalness: number; roughness: number; codigo: string }
export interface MedidaCfg { id: string; rotulo: string; ref: string; /** largura, profundidade, altura (cm) */ dim: [number, number, number]; /** preço base (€) */ preco: number }
/** Uma célula da matriz: o acabamento existe nesta medida? `preco`/`sku` próprios sobrepõem o da medida / o automático. */
export interface CelulaCfg { ativo: boolean; sku?: string; preco?: number }
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
  const auto = `${m.ref}${f.regraSku.sep}${a.codigo}`;
  return f.regraSku.modo === "manual" ? (f.celulas[celulaKey(medidaId, acabId)]?.sku?.trim() || auto) : auto;
}
const precoProprio = (c?: CelulaCfg): number | undefined => (typeof c?.preco === "number" && Number.isFinite(c.preco) && c.preco > 0 ? c.preco : undefined);
/** O preço de uma célula: o dela, senão o da medida. */
export const precoDaCelula = (f: FamiliaCfg, medidaId: string, acabId: string): number => precoProprio(f.celulas[celulaKey(medidaId, acabId)]) ?? medidaDe(f, medidaId)?.preco ?? 0;

const celulasAtivas = (f: FamiliaCfg): { m: MedidaCfg; a: AcabCfg }[] =>
  f.medidas.flatMap((m) => f.acabamentos.filter((a) => f.celulas[celulaKey(m.id, a.id)]?.ativo === true).map((a) => ({ m, a })));
const nomeMedida = (m: MedidaCfg): string => m.rotulo.trim() || m.ref.trim() || m.id;

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
    if (!(m.preco > 0)) add(3, `O produto «${nomeMedida(m)}» não tem preço base.`);
    if (!m.ref.trim()) add(3, `O produto «${nomeMedida(m)}» não tem referência.`);
    if (m.dim.some((x) => !(x > 0))) add(3, `O produto «${nomeMedida(m)}» tem dimensões por preencher.`);
  }
  if (f.acabamentos.length > 0 && f.medidas.length > 0) {
    const ativas = celulasAtivas(f);
    if (ativas.length === 0) add(4, "Nenhuma combinação está ativa: ative pelo menos uma cor numa medida.");
    const porSku = new Map<string, string[]>();
    for (const { m, a } of ativas) { const s = skuDaCelula(f, m.id, a.id); porSku.set(s, [...(porSku.get(s) ?? []), `${nomeMedida(m)} × ${a.nome}`]); }
    for (const [sku, onde] of porSku) if (onde.length > 1) add(4, `O SKU «${sku}» repete-se (${onde.join("; ")}).`);
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
    const precos: Record<string, number> = {}, skus: Record<string, string> = {};
    for (const a of dela) {
      const proprio = precoProprio(f.celulas[celulaKey(m.id, a.id)]);
      if (proprio !== undefined) precos[a.id] = proprio;
      skus[a.id] = skuDaCelula(f, m.id, a.id);
    }
    const [w, d, h] = m.dim;
    const forma = f.tipo === "torneira_cozinha" ? { torneira: { estilo: "monocomando" as const, altura: h * 10, saida: d * 10, alcance: d * 10, base: w * 10 } }
      : f.tipo === "lava_loica" ? { cubas: [{ w: Math.max(w * 10 - 40, 100), d: Math.max(d * 10 - 40, 100), prof: h * 10, left: 20, top: 20 }] } : {};
    return { id: m.id, rotulo: m.rotulo, ref: m.ref, preco: m.preco, dim: m.dim, spec: { ...forma, acabamentos: dela.map((a) => a.id), precos, skus } };
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
  const k = celulaKey(medidaId, acabId);
  return { ...f, celulas: { ...f.celulas, [k]: { ...f.celulas[k], ...p } } };
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
export interface LinhaVariante { chave: string; medidaId: string; acabId: string; produto: string; ref: string; acabamento: string; sku: string; preco: number; tem3d: boolean }
export const linhasDeVariantes = (f: FamiliaCfg): LinhaVariante[] => celulasAtivas(f).map(({ m, a }) => {
  const chave = celulaKey(m.id, a.id);
  return { chave, medidaId: m.id, acabId: a.id, produto: nomeMedida(m), ref: m.ref, acabamento: a.nome.trim() || a.id, sku: skuDaCelula(f, m.id, a.id), preco: precoDaCelula(f, m.id, a.id), tem3d: Boolean(f.glb?.[chave]) };
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
  if (c.regraSku.modo === "auto") for (const k of Object.keys(c.celulas)) delete c.celulas[k].sku;
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
