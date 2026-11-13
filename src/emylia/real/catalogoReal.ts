// CRM: o Catálogo e custos da organização lido das tabelas (migrations 20261231910000/920000) e montado nos objetos que os ecrãs da
// Emylia já usam: Custos (custosStore), Catalogo (catalogoStore), os serviços do motor (S.svc), o Catálogo inteiro (CATALOGO_TODO)
// e os técnicos com o custo/hora. Aqui só se monta: ler da base é lerCatalogo.ts; gravar as mudanças é gravarCatalogo.ts.
// Os serviços e os perfis usam a `chave` (o código da Emylia: demol, canal, c12, s-<sku>; canalizador…) porque o motor os chama assim.
import type { MedKey, Servico, SvcId } from "../motor";
import type { ItemCatalogo, LinhaCat } from "../catalogo";
import type { Custos, LinhaEstrutura, ModoPreco, Parametros, PassoMO, ReceitaV2, UsoCons, UsoEquip } from "../v2/custosModelo";
import type { AtributoDef, AtributoProduto, Catalogo, MedidaAtributo, No, Produto, Regra } from "../v2/catalogoModelo";
import type { EntulhoSvc } from "../entulho";
import type { FichaTecnico } from "../equipa/tecnicos";

/* ------------------------------------------------------------------ as linhas, tal como vêm das tabelas */
export interface LinhaParametros {
  meses: number; tsu: number; seguros_ano: number; horas_ano: number; horas_mes: number; meses_desatualizado: number;
  margem_minima: number; margem_alvo: number;
}
export interface LinhaCategoria { id: string; name: string; parent_id: string | null; sort_order: number | null }
export interface LinhaPerfil {
  id: string; chave: string | null; nome: string; salario_referencia: number | null; ativo: boolean;
  /** 20261231998000: o €/h do ofício calculado na base (fn_cat_custo_hora_oficio_det) e de onde vem. Sem estes campos (base antiga),
   *  o perfil fica sem horaBd e o €/h faz-se como antes. */
  custo_hora?: number | null; fonte?: "rh" | "cargo" | "referencia" | "sem" | null; n?: number | null; nomes?: string[] | null; cargos?: string[] | null;
}
export interface LinhaEquipamento {
  id: string; nome: string; compra: number; vida_anos: number; vida_horas: number | null; residual: number; manutencao_ano: number;
  uso_ano_horas: number; ativo: boolean;
}
export interface LinhaEstruturaBase { id: string; nome: string; categoria: string; mensal: number; ativo: boolean; ordem: number }
export interface LinhaServicoBase {
  id: string; chave: string | null; name: string; sku: string | null; unidade: string | null;
  service_category_id: string | null; service_subcategory_id: string | null;
  linhas: string[] | null; medida: string | null; modo_preco: string; margem: number | null; justificacao_preco: string | null;
  fases: number[] | null; receita_origem: string; icone: string | null;
  exige_produto_categoria_id: string | null; exige_produto_medida: string | null; exige_produto_fator: number | null; exige_produto_arredondar: boolean;
  pergunta_manter: string | null; entulho_modo: string | null; entulho_m3: number | null; entulho_kg: number | null;
}
export interface LinhaPrecoServico { service_id: string; price: number; valid_from: string | null; nota: string | null; vat_rate: number | null; created_at: string | null }
export interface LinhaPasso { servico_id: string; ordem: number; nome: string; minutos_por_unidade: number; minutos_fixos: number; skill_id: string | null; fase: number }
export interface LinhaUsoEquip { service_id: string; equipamento_id: string; horas: number; ordem: number }
export interface LinhaUsoCons { service_id: string; product_id: string; quantity: number; opcional: boolean; sort_order: number | null }
export interface LinhaProduto {
  id: string; name: string; sku: string | null; tipo_catalogo: string; unidade: string | null; catalogo_categoria_id: string | null;
  servico_id: string | null; fator_servico: number; entulho_m3: number | null; entulho_kg: number | null; short_description: string | null;
  marca_livre: string | null; fornecedor_livre: string | null;
  /** 03/11 (20270104930000): as fotos do produto; base antiga não manda o campo. */
  image_urls?: string[] | null;
  /** 13/11 (20270117100000, cat_ler_produtos_tabelas): a marca, a unidade e a categoria pelas tabelas de referência (brands, uom,
   *  product_categories). Sem a função na base (SQL por colar) não vêm e fica o texto (marca_livre, unidade, catalogo_categoria_id). */
  brand_id?: string | null; marca?: string | null; uom_id?: string | null; uom?: string | null;
  category_id?: string | null; subcategory_id?: string | null;
}
/** Uma categoria de produto (product_categories). */
export interface LinhaCategoriaProduto { id: string; name: string; parent_id: string | null; sort_order: number | null }
/** 13/11 (20270117100000): o que cat_ler_produtos_tabelas manda além dos campos de cada produto. */
export interface LinhasTabelas {
  categoriasProduto: LinhaCategoriaProduto[];
  marcas: string[];
  unidades: string[];
  /** O ramo da árvore dos produtos de onde cada serviço obriga a escolher um produto (services.exige_categoria_produto_id). */
  exige: { service_id: string; categoria_produto_id: string }[];
}
/** 13/11 (cat_ler_atributos): a lista global de atributos com as opções, e os valores de cada produto (só os que têm). */
export interface LinhaAtributo {
  id: string; codigo: string; nome: string; tipo: "lista" | "medida"; tem_hex: boolean; ordem: number;
  opcoes: { id: string; valor: string; nome?: string | null; hex: string | null; ordem: number }[];
}
/** `ativa`: false se a opção foi desativada (o id continua a vir; `opcoes` da lista só traz as ativas). */
export interface LinhaValorAtributo { atributo: string; opcao: string | null; valor: string | null; medida: MedidaAtributo | null; ativa?: boolean }
export interface LinhasAtributos { defs: LinhaAtributo[]; produtos: { id: string; valores: LinhaValorAtributo[] }[] }
export interface LinhaPrecoProduto { product_id: string; price_type: string; price: number; valid_from: string | null }
export interface LinhaFornecedorProduto { product_id: string; purchase_price: number | null; preco_data: string | null; ligacao: string; fornecedor: string | null }
export interface LinhaTecnico { id: string; nome: string; custo_hora: number | null; perfis: string[] }

export interface LinhasCatalogo {
  parametros: LinhaParametros | null;
  margemLinha: { linha: string; margem_minima: number }[];
  categorias: LinhaCategoria[];
  perfis: LinhaPerfil[];
  equipamentos: LinhaEquipamento[];
  estrutura: LinhaEstruturaBase[];
  servicos: LinhaServicoBase[];
  precosServico: LinhaPrecoServico[];
  passos: LinhaPasso[];
  usosEquip: LinhaUsoEquip[];
  usosCons: LinhaUsoCons[];
  produtos: LinhaProduto[];
  precosProduto: LinhaPrecoProduto[];
  fornecedores: LinhaFornecedorProduto[];
  tecnicos: LinhaTecnico[];
  /** 20261231998000: a base mandou o custo/hora de cada técnico (só com hr.pessoas.retribuicao.view). Sem o campo: true (base antiga). */
  ve_custo_tecnicos?: boolean;
  /** 13/11 (20270117100000): os produtos leem-se pelas tabelas de referência. Sem o campo: como antes, pelo texto. */
  tabelas?: LinhasTabelas;
  /** 13/11 (cat_ler_atributos): os atributos dos produtos. Sem o campo (função por criar ou com erro): o ecrã não os mostra. */
  atributos?: LinhasAtributos;
}

/* ------------------------------------------------------------------ o resultado */
export interface CatalogoMontado {
  C: Custos;
  K: Catalogo;
  /** Os serviços do motor que existem na organização (os do modelo, pela chave), já com o preço e o perfil da base. */
  svc: Record<SvcId, Servico>;
  /** O Catálogo inteiro (CATALOGO_TODO), pela chave. */
  itens: ItemCatalogo[];
  tecnicos: FichaTecnico[];
  /** Margem mínima e alvo da organização (S.cfg.min, S.cfg.alvo). */
  margens: { min: number; alvo: number };
  /** Chave da Emylia → id na base (para gravar). `tabelas`: os produtos gravam-se pelas tabelas de referência (20270117100000). */
  ids: { servico: Map<string, string>; perfil: Map<string, string>; tabelas?: boolean };
}

/** As medidas das Operações (base) ↔ as da Emylia (motor). */
const MEDIDA_DA_BASE: Record<string, MedKey> = { m2_pavimento: "pav", m2_parede: "par", pontos_agua: "pts", pecas_sanitarias: "pcs" };
export const MEDIDA_PARA_BASE: Record<MedKey, string> = { pav: "m2_pavimento", par: "m2_parede", pts: "pontos_agua", pcs: "pecas_sanitarias" };
const medidaDaBase = (m: string | null | undefined): MedKey | null => (m ? MEDIDA_DA_BASE[m] ?? null : null);

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const nomeIgual = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
/** A unidade do produto: a da tabela de unidades (uom) e, sem ela, o texto. */
const unDe = (p: LinhaProduto) => p.uom || p.unidade || "un";

/** 13/11 (20270117100000): a árvore dos produtos (product_categories) junta-se à dos serviços pelo nome, porque o motor da Emylia
 *  usa uma só árvore (classe dos serviços, ramo dos produtos e a regra «exige produto»). Uma categoria de produto com o mesmo nome
 *  (e o mesmo pai) que um ramo dos serviços fica nesse ramo; as outras entram na árvore como ramos só de produtos (soProduto).
 *  Devolve os nós a mais e a função categoria de produto → nó da árvore. */
export function juntarArvoreProdutos(servicos: readonly No[], cats: readonly LinhaCategoriaProduto[]): { extra: No[]; noDe: (id: string | null | undefined) => string | null } {
  const raiz = new Map<string, string>(), sub = new Map<string, string>();
  for (const x of servicos) {
    if (x.pai == null) { if (!raiz.has(nomeIgual(x.n))) raiz.set(nomeIgual(x.n), x.id); }
    else if (!sub.has(x.pai + "|" + nomeIgual(x.n))) sub.set(x.pai + "|" + nomeIgual(x.n), x.id);
  }
  const svc = new Set(servicos.map((x) => x.id));
  const porId = new Map(cats.map((c) => [c.id, c]));
  const memo = new Map<string, string | null>(), extra: No[] = [];
  const noDe = (id: string | null | undefined, ver = new Set<string>()): string | null => {
    if (!id) return null;
    if (memo.has(id)) return memo.get(id)!;
    const c = porId.get(id);
    if (!c || ver.has(id)) return null;
    ver.add(id);
    const pai = c.parent_id ? noDe(c.parent_id, ver) : null;
    const igual = pai == null ? raiz.get(nomeIgual(c.name)) : svc.has(pai) ? sub.get(pai + "|" + nomeIgual(c.name)) : undefined;
    const no = igual ?? c.id;
    if (!igual) extra.push({ id: c.id, n: c.name, pai, soProduto: true });
    memo.set(id, no);
    return no;
  };
  for (const c of [...cats].sort((a, b) => (n(a.sort_order) - n(b.sort_order)) || a.name.localeCompare(b.name))) noDe(c.id);
  return { extra, noDe };
}
const dia = (v: string | null | undefined): string => (v ? String(v).slice(0, 10) : "");
/** Do mais antigo para o mais recente (o último é o atual). */
const porData = <T extends { valid_from: string | null }>(L: T[]) => [...L].sort((a, b) => String(a.valid_from ?? "").localeCompare(String(b.valid_from ?? "")));

/** Monta o Catálogo e os custos da organização. `base` é o Catálogo de partida (catalogo0()): ficam dele os parâmetros da demolição. */
export function montarCatalogo(L: LinhasCatalogo, base: Catalogo, svcModelo: Record<SvcId, Servico>): CatalogoMontado {
  // perfis: a chave da Emylia (ou o id)
  const perfilChave = new Map<string, string>(), perfilId = new Map<string, string>();
  for (const p of L.perfis) { const k = p.chave || p.id; perfilChave.set(p.id, k); perfilId.set(k, p.id); }
  const par: Parametros = L.parametros
    ? { meses: n(L.parametros.meses), tsu: n(L.parametros.tsu), segurosAno: n(L.parametros.seguros_ano), horasAno: n(L.parametros.horas_ano),
        horasMes: n(L.parametros.horas_mes), mesesDesatualizado: n(L.parametros.meses_desatualizado) }
    : { meses: 14, tsu: 23.75, segurosAno: 0, horasAno: 1345, horasMes: 0, mesesDesatualizado: 6 };
  const margens = { min: L.parametros ? n(L.parametros.margem_minima) : 28, alvo: L.parametros ? n(L.parametros.margem_alvo) : 35 };

  // produtos: o custo atual (o do fornecedor ligado, se houver; senão o último custo à mão) e o PVP
  const precos = new Map<string, LinhaPrecoProduto[]>();
  for (const p of L.precosProduto) { const a = precos.get(p.product_id) ?? []; a.push(p); precos.set(p.product_id, a); }
  const forn = new Map(L.fornecedores.map((f) => [f.product_id, f]));
  const ultimo = (id: string, tipo: string) => porData((precos.get(id) ?? []).filter((p) => p.price_type === tipo)).pop();
  const custoDe = (id: string) => {
    const f = forn.get(id), c = ultimo(id, "purchase");
    if (f?.purchase_price != null && f.ligacao !== "por_ligar") return { custo: n(f.purchase_price), data: dia(f.preco_data) || dia(c?.valid_from), fornecedor: f.fornecedor ?? "" };
    return { custo: n(c?.price), data: dia(c?.valid_from), fornecedor: "" };
  };
  const produtoPorId = new Map(L.produtos.map((p) => [p.id, p]));
  // 13/11: os atributos (cat_ler_atributos); sem eles, K.atributos fica por definir e os produtos sem attrs
  const attrsDe = new Map<string, AtributoProduto[]>();
  for (const x of L.atributos?.produtos ?? []) {
    const vs = (x.valores ?? []).filter((v) => v?.atributo).map((v): AtributoProduto => ({
      atributoId: v.atributo, ...(v.opcao ? { opcaoId: v.opcao } : {}), ...(v.valor != null ? { valor: v.valor } : {}), ...(v.medida ? { medida: v.medida } : {}), ...(v.opcao && v.ativa === false ? { inativa: true as const } : {}),
    }));
    if (vs.length) attrsDe.set(x.id, vs);
  }
  const defsAtributos: AtributoDef[] | undefined = L.atributos
    ? [...L.atributos.defs].filter((d) => d?.id).sort((a, b) => n(a.ordem) - n(b.ordem)).map((d) => ({
      id: d.id, codigo: d.codigo, nome: d.nome, tipo: d.tipo, temHex: !!d.tem_hex, ordem: n(d.ordem),
      opcoes: [...(d.opcoes ?? [])].sort((a, b) => n(a.ordem) - n(b.ordem)).map((o) => ({ id: o.id, valor: o.valor, nome: o.nome || o.valor, hex: o.hex ?? null, ordem: n(o.ordem) })),
    }))
    : undefined;

  // serviços
  const cat = new Map(L.categorias.map((c) => [c.id, c]));
  const svcChave = new Map<string, string>(), svcId = new Map<string, string>();
  for (const s of L.servicos) { const k = s.chave || s.id; svcChave.set(s.id, k); svcId.set(k, s.id); }
  const agrupar = <T,>(xs: T[], k: (x: T) => string) => { const m = new Map<string, T[]>(); for (const x of xs) { const a = m.get(k(x)) ?? []; a.push(x); m.set(k(x), a); } return m; };
  const passosDe = agrupar(L.passos, (p) => p.servico_id), eqDe = agrupar(L.usosEquip, (u) => u.service_id), consDe = agrupar(L.usosCons, (u) => u.service_id);
  const precosSvc = agrupar(L.precosServico, (p) => p.service_id);

  const receitas: Record<SvcId, ReceitaV2> = {};
  const itens: ItemCatalogo[] = [];
  const svc: Record<SvcId, Servico> = {};
  const arvoreSvc = [...L.categorias].sort((a, b) => (n(a.sort_order) - n(b.sort_order)) || a.name.localeCompare(b.name))
    .sort((a, b) => Number(a.parent_id != null) - Number(b.parent_id != null))
    .map((c): No => ({ id: c.id, n: c.name, pai: c.parent_id }));
  // 13/11 (20270117100000): com as tabelas, os produtos e a regra «exige produto» vão pela árvore dos produtos, junta pelo nome
  const T = L.tabelas;
  const junta = T ? juntarArvoreProdutos(arvoreSvc, T.categoriasProduto) : null;
  const exigeNovo = new Map((T?.exige ?? []).map((e) => [e.service_id, junta!.noDe(e.categoria_produto_id)]));
  const noDoProduto = (p: LinhaProduto): string | null =>
    (junta && (p.subcategory_id || p.category_id) ? junta.noDe(p.subcategory_id || p.category_id) : null) ?? p.catalogo_categoria_id;
  const K: Catalogo = {
    ...base,
    arvore: [...arvoreSvc, ...(junta?.extra ?? [])].sort((a, b) => Number(a.pai != null) - Number(b.pai != null)),
    produtos: [], pacotes: [], classe: {}, exigeProduto: {}, qtdDe: {}, perguntaManter: {}, fasesServico: {}, entulhoServico: {}, icone: {},
    equivalentes: undefined, servicosCriados: [], consumiveisCriados: [],
    ...(defsAtributos ? { atributos: defsAtributos } : {}),
  };

  for (const s of L.servicos) {
    const sid = svcChave.get(s.id)!;
    const mo: PassoMO[] = [...(passosDe.get(s.id) ?? [])].sort((a, b) => a.ordem - b.ordem)
      .map((p) => ({ id: "p" + p.ordem, n: p.nome, perfil: p.skill_id ? perfilChave.get(p.skill_id) ?? p.skill_id : "", h: n(p.minutos_por_unidade) / 60 }));
    const equip: UsoEquip[] = [...(eqDe.get(s.id) ?? [])].sort((a, b) => a.ordem - b.ordem).map((u) => ({ id: u.equipamento_id, equip: u.equipamento_id, h: n(u.horas) }));
    const cons: UsoCons[] = [...(consDe.get(s.id) ?? [])].sort((a, b) => n(a.sort_order) - n(b.sort_order)).flatMap((u) => {
      const p = produtoPorId.get(u.product_id);
      if (!p) return [];
      const c = custoDe(p.id);
      return [{ id: p.id, n: p.name, q: n(u.quantity), un: unDe(p), preco: c.custo, fornecedor: c.fornecedor || p.fornecedor_livre || "", data: c.data, ...(u.opcional ? { opcional: true } : {}) }];
    });
    const hist = porData(precosSvc.get(s.id) ?? []).map((p) => ({ data: dia(p.valid_from), preco: n(p.price), nota: p.nota ?? "" }));
    const atual = porData(precosSvc.get(s.id) ?? []).pop();
    const rec: ReceitaV2 = {
      sid, origem: (s.receita_origem as ReceitaV2["origem"]) ?? "editada", mo, equip, cons,
      modo: (s.modo_preco as ModoPreco) ?? "tabela", precoTabela: n(atual?.price), margem: s.margem != null ? n(s.margem) : margens.alvo, hist,
      ...(s.justificacao_preco ? { justificacao: s.justificacao_preco } : {}),
      ...(s.medida ? { medida: medidaDaBase(s.medida) } : {}),
    };
    receitas[sid] = rec;
    const oficio = s.service_category_id ? cat.get(s.service_category_id)?.name ?? "" : "";
    const sub = s.service_subcategory_id ? cat.get(s.service_subcategory_id)?.name : undefined;
    const h = mo.reduce((a, p) => a + p.h, 0);
    itens.push({ id: sid, n: s.name, cat: oficio, ...(sub ? { sub } : {}), un: s.unidade ?? "un", hf: 0, hu: h, qm: 1, usos: 0,
      linhas: (s.linhas ?? []) as LinhaCat[], ...(s.sku ? { sku: s.sku } : {}), ...(rec.precoTabela > 0 ? { pvp: rec.precoTabela } : {}) });
    const no = s.service_subcategory_id ?? s.service_category_id;
    if (no) K.classe[sid] = no;
    // 13/11: o ramo exigido pela árvore dos produtos (exige_categoria_produto_id); sem ele, o antigo (árvore dos serviços)
    const exige = exigeNovo.get(s.id) ?? s.exige_produto_categoria_id;
    if (exige) {
      K.exigeProduto![sid] = exige;
      const m = s.exige_produto_medida;
      const regra: Regra = !m || m === "fixo" ? { k: "fixo", q: n(s.exige_produto_fator) || 1 }
        : { k: "por", med: medidaDaBase(m) ?? "pav", f: n(s.exige_produto_fator) || 1, arred: !!s.exige_produto_arredondar };
      K.qtdDe![sid] = regra;
    }
    if (s.pergunta_manter) K.perguntaManter![sid] = s.pergunta_manter;
    if (s.fases?.length) K.fasesServico![sid] = s.fases as never;
    if (s.entulho_modo) K.entulhoServico![sid] = { modo: s.entulho_modo as EntulhoSvc["modo"], ...(s.entulho_m3 != null ? { m3: n(s.entulho_m3) } : {}), ...(s.entulho_kg != null ? { kg: n(s.entulho_kg) } : {}) };
    if (s.icone) K.icone![sid] = s.icone as never;
    // os serviços do modelo (demol, canal…) passam para o motor com o preço, a unidade e o perfil da base
    const m = svcModelo[sid];
    if (m) {
      const iva = atual?.vat_rate != null ? (n(atual.vat_rate) as Servico["iva"]) : m.iva;
      svc[sid] = { ...m, n: s.name, un: s.unidade ?? m.un, h, preco: rec.precoTabela || m.preco, perfilId: mo[0]?.perfil || m.perfilId, ...(iva ? { iva } : {}) };
    }
  }

  // produtos e consumíveis
  const usados = new Set(L.usosCons.map((u) => u.product_id));
  for (const p of L.produtos) {
    const c = custoDe(p.id), pvp = ultimo(p.id, "retail");
    // 29/10: PVP limpo (cat_definir_pvp com null) ou a 0 não conta: o preço volta a ser custo + alvo
    if (p.tipo_catalogo === "produto") {
      const prod: Produto = {
        id: p.id, n: p.name, custo: c.custo, un: unDe(p), marca: p.marca || p.marca_livre || "", fornecedor: c.fornecedor || p.fornecedor_livre || "",
        data: c.data, no: noDoProduto(p),
        ...(p.servico_id && svcChave.has(p.servico_id) ? { servico: svcChave.get(p.servico_id)!, fatorServico: n(p.fator_servico) || 1 } : {}),
        ...(p.sku ? { sku: p.sku } : {}), ...(pvp && n(pvp.price) > 0 ? { pvp: n(pvp.price) } : {}), ...(p.short_description ? { desc: p.short_description } : {}),
        ...(p.entulho_m3 != null ? { entulho: { m3: n(p.entulho_m3), ...(p.entulho_kg != null ? { kg: n(p.entulho_kg) } : {}) } } : {}),
        ...(Array.isArray(p.image_urls) && p.image_urls.length ? { fotos: p.image_urls.filter((u) => typeof u === "string" && u) } : {}),
        ...(attrsDe.has(p.id) ? { attrs: attrsDe.get(p.id) } : {}),
      };
      K.produtos.push(prod);
    } else if (!usados.has(p.id)) {
      K.consumiveisCriados!.push({ id: p.id, n: p.name, un: unDe(p), preco: c.custo, fornecedor: c.fornecedor || p.fornecedor_livre || "", data: c.data });
    }
  }
  const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  K.unidades = unicos([...base.unidades, ...(T?.unidades ?? []), ...K.produtos.map((p) => p.un), ...itens.map((i) => i.un)]);
  K.marcas = unicos([...(T?.marcas ?? []), ...K.produtos.map((p) => p.marca)]);
  K.fornecedores = unicos([...K.produtos.map((p) => p.fornecedor), ...Object.values(receitas).flatMap((r) => r.cons.map((c) => c.fornecedor))]);

  const C: Custos = {
    par,
    perfis: L.perfis.filter((p) => p.ativo).map((p) => ({ id: perfilChave.get(p.id)!, n: p.nome, salario: p.salario_referencia != null ? n(p.salario_referencia) : null,
      // 20261231998000: o €/h que a base calculou (média do RH, salário do cargo técnico ou de referência)
      ...(p.fonte ? { horaBd: { custoHora: p.custo_hora != null ? n(p.custo_hora) : null, fonte: p.fonte, n: n(p.n), nomes: p.nomes ?? [], cargos: p.cargos ?? [] } } : {}) })),
    equip: L.equipamentos.filter((e) => e.ativo).map((e) => ({
      id: e.id, n: e.nome, compra: n(e.compra), vida: e.vida_horas != null ? n(e.vida_horas) : n(e.vida_anos) * n(e.uso_ano_horas),
      residual: n(e.residual), manutAno: n(e.manutencao_ano), usoAno: n(e.uso_ano_horas),
    })),
    estrutura: [...L.estrutura].sort((a, b) => a.ordem - b.ordem)
      .map((e): LinhaEstrutura => ({ id: e.id, n: e.nome, cat: e.categoria as LinhaEstrutura["cat"], mensal: n(e.mensal), ativo: e.ativo })),
    minLinha: Object.fromEntries(L.margemLinha.map((m) => [m.linha, n(m.margem_minima)])) as Custos["minLinha"],
    receitas,
  };

  // 20261231998000: um técnico com vários ofícios conta em todos (perfis); perfilId fica o primeiro (os ecrãs de um só ofício).
  // Sem hr.pessoas.retribuicao.view a base não manda o custo de cada um: não é "sem custo no RH", é custo escondido (custoOculto).
  const veCusto = L.ve_custo_tecnicos !== false;
  const tecnicos: FichaTecnico[] = L.tecnicos.flatMap((t) => {
    const perfis = [...new Set(t.perfis.map((id) => perfilChave.get(id)).filter((k): k is string => !!k))];
    const p = perfis[0];
    // 09/11: o técnico pelo perfil «Ser técnico de obra» ainda sem ofícios na ficha do RH vem na mesma (cat_ler_catalogo), sem ofício:
    // é o técnico da conta no Hoje, mas não entra no custo nem na escolha de técnicos de nenhum ofício (tecnicosDoPerfil).
    const nome = p ? C.perfis.find((x) => x.id === p)?.n ?? "" : "";
    // 09/11: para mostrar, todos os ofícios por ordem alfabética (o primeiro, `sk`, vem pela ordem dos ids e é o das contas)
    const nomes = perfis.map((k) => C.perfis.find((x) => x.id === k)?.n ?? "").filter(Boolean).sort((a, b) => a.localeCompare(b, "pt"));
    const rotulo = nomes.length > 1 ? { oficiosRotulo: nomes.join(" · ") } : {};
    const custo = t.custo_hora == null ? (veCusto ? { semCustoRh: true as const } : { custoOculto: true as const }) : {};
    // 28/10: pessoaRhId = a própria pessoa do RH (a agenda e as ausências leem-se por ela)
    return [{ id: t.id, pessoaRhId: t.id, n: t.nome, sk: nome, ...rotulo, ...(p ? { perfilId: p } : {}), perfis, ferias: [], custoHora: n(t.custo_hora), tel: "", desde: "", ...custo }];
  });

  return { C, K, svc, itens, tecnicos, margens, ids: { servico: svcId, perfil: perfilId, ...(T ? { tabelas: true } : {}) } };
}
