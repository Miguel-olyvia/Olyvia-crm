// CRM: grava na base o que mudou no Catálogo e custos. Os ecrãs da Emylia mudam as stores (mudarCustos, mudarCatalogo) e S.svc;
// aqui compara-se o antes (o que veio da base) com o depois e sai a lista de chamadas às funções cat_* (diferencasCatalogo: pura,
// testável). executarCatalogo corre-as por ordem: o que se cria primeiro (um ramo, um perfil, um consumível) fica com o id da base
// e as chamadas seguintes usam-no ({ tmp: "…" }). No fim, a página volta a ler da base.
import type { Servico, SvcId } from "../motor";
import { itemCatalogo, type ItemCatalogo } from "../catalogo";
import type { Custos, ReceitaV2 } from "../v2/custosModelo";
import type { Catalogo, No } from "../v2/catalogoModelo";
import { MEDIDA_PARA_BASE, type CatalogoMontado, type LinhaProduto } from "./catalogoReal";
import { mesmosAtributos, valoresParaGravar } from "../atributosTexto";
import { erroAmigavel } from "../fichaProdutoDados";
import { ehIdDeModelo3D } from "../planta3d/modelos3dEscolha";
import { resolverCategoria, textoSemGerar } from "../skuDados";
import type { CategoriaGestao } from "../categoriasMarcasGestao";
import { RPC_LIGAR_FORNECEDOR, argsLigarFornecedor, type FornecedorPendente } from "../fornecedoresCatalogo";

/** O Catálogo num momento: o que os ecrãs mostram. */
export interface FotoCatalogo {
  C: Custos;
  K: Catalogo;
  svc: Record<SvcId, Servico>;
  margens: { min: number; alvo: number };
}
/** Um valor que só se sabe depois de uma chamada anterior (o id que a base deu). */
export interface Tmp { tmp: string }
/** `tolerante`: se falhar, a gravação continua e diz-se em `avisos` (o que já se gravou fica; é o caso de gerar a referência, o último passo). */
export interface Chamada { rpc: string; args: Record<string, unknown>; guarda?: string; nota: string; tolerante?: boolean; produto?: string;
  /** Quando a resposta não é o id (texto), tira-se dela o que `guarda` guarda: o id do modelo criado, a subcategoria achada. null = não deu. */
  extrai?: (data: unknown) => string | null;
  /** O início do aviso de um passo tolerante («Produto «X» criado; fornecedor por ligar»); sem ele, o da referência. O motivo segue-se depois de «: ». */
  aviso?: string }

const avisoSku = (nome: string | undefined, motivo: string) => `Produto${nome ? ` «${nome}»` : ""} criado; referência por gerar: ${motivo}`;
/** 16/11: o fornecedor real de um produto ou consumível NOVO (cat_ligar_fornecedor_produto), depois de o texto e antes dos atributos. Tolerante:
 *  o produto fica criado e o texto do fornecedor já foi gravado por cat_guardar_produto_texto (compatibilidade). */
const ligarFornecedor = (org: string, rotulo: "Produto" | "Consumível", nome: string, ref: Tmp, x: { fornecedorId?: string; fornecedorNovo?: FornecedorPendente }): Chamada[] => {
  const args = argsLigarFornecedor(org, ref, x);
  return args ? [{ rpc: RPC_LIGAR_FORNECEDOR, nota: `${rotulo}: ${nome} (fornecedor)`, tolerante: true, aviso: `${rotulo} «${nome}» criado; fornecedor por ligar`, args }] : [];
};
/** 16/11: o modelo de um produto NOVO (depois da classificação, antes de gerar a referência, que precisa dele). Um modelo novo cria-se na subcategoria do
 *  produto: o id dela só se sabe depois de gravada (pode ter sido criada agora), por isso lê-se pelos nomes (como a pré-visualização). Tolerante: o produto
 *  fica criado e diz-se que o modelo ficou por ligar. */
const ligarModelo = (org: string, nome: string, ref: Tmp, x: { modeloId?: string; modeloNovo?: string }, ramo: { p_categoria: string | null; p_subcategoria: string | null }): Chamada[] => {
  const aviso = `Produto «${nome}» criado; modelo por ligar`;
  const novo = x.modeloNovo?.trim();
  if (!x.modeloId && !novo) return [];
  const ligar = (modelo: string | Tmp): Chamada => ({ rpc: "cat_guardar_produto_modelo", nota: `Produto: ${nome} (modelo)`, tolerante: true, aviso, args: { p_org: org, p_produto: ref, p_modelo: modelo } });
  if (!novo) return [ligar(x.modeloId!)];
  const t = ref.tmp;
  return [
    { rpc: "cat_ler_categorias_gestao", nota: `Produto: ${nome} (subcategoria do modelo)`, tolerante: true, aviso, guarda: "sub:" + t, args: { p_org: org }, extrai: (d) => subDe(d, ramo) },
    { rpc: "cat_guardar_modelo", nota: `Produto: ${nome} (modelo novo)`, tolerante: true, aviso, guarda: "modelo:" + t, args: { p_org: org, p_id: null, p_subcategoria: { tmp: "sub:" + t }, p_nome: novo, p_numero: null },
      extrai: (d) => { const id = (d as { modelo?: { id?: unknown } } | null)?.modelo?.id; return typeof id === "string" ? id : null; } },
    ligar({ tmp: "modelo:" + t }),
  ];
};
/** O id da subcategoria (em product_categories) a partir dos nomes da categoria e da subcategoria do produto; null se não existe ou é ambíguo. */
function subDe(d: unknown, ramo: { p_categoria: string | null; p_subcategoria: string | null }): string | null {
  const lista = (d as { categorias?: unknown } | null)?.categorias;
  if (!ramo.p_categoria || !ramo.p_subcategoria || !Array.isArray(lista)) return null;
  const r = resolverCategoria(lista as CategoriaGestao[], ramo.p_categoria, ramo.p_subcategoria);
  return r.k === "ok" ? r.subcategoria : null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const porId = <T extends { id: string }>(L: readonly T[]) => new Map(L.map((x) => [x.id, x]));

/** O que mudou, em chamadas às funções cat_*, pela ordem em que têm de correr. */
export function diferencasCatalogo(org: string, antes: FotoCatalogo, depois: FotoCatalogo, base: Pick<CatalogoMontado, "ids"> & { produtos: LinhaProduto[] }): Chamada[] {
  const out: Chamada[] = [];
  const ids = base.ids;
  // 13/11 (20270117100000): a marca, a unidade e a categoria dos produtos e o ramo exigido pelos serviços gravam-se pelas tabelas de
  // referência (cat_guardar_produto_tabelas, cat_guardar_servico_exige), pelo nome do ramo. Sem a função na base: como antes.
  const tabelas = !!ids.tabelas;

  // 1. parâmetros, margens e margens por linha
  if (!igual(antes.C.par, depois.C.par) || !igual(antes.margens, depois.margens) || !igual(antes.C.minLinha, depois.C.minLinha)) {
    const P = depois.C.par;
    out.push({ rpc: "cat_guardar_parametros", nota: "Parâmetros de custo", args: {
      p_org: org, p_meses: P.meses, p_tsu: P.tsu, p_seguros_ano: P.segurosAno, p_horas_ano: P.horasAno, p_horas_mes: P.horasMes,
      p_meses_desatualizado: P.mesesDesatualizado, p_margem_minima: depois.margens.min, p_margem_alvo: depois.margens.alvo,
      p_margem_wc: depois.C.minLinha.wc ?? null, p_margem_coz: depois.C.minLinha.coz ?? null, p_margem_geral: depois.C.minLinha.geral ?? null,
    } });
  }

  // 2. estrutura
  const estA = porId(antes.C.estrutura);
  for (const e of depois.C.estrutura) {
    const a = estA.get(e.id);
    if (a && igual(a, e)) continue;
    out.push({ rpc: "cat_guardar_estrutura", nota: `Estrutura: ${e.n}`, args: { p_org: org, p_id: a && UUID.test(e.id) ? e.id : null, p_nome: e.n, p_categoria: e.cat, p_mensal: e.mensal, p_ativo: e.ativo, p_apagar: false } });
  }
  for (const a of antes.C.estrutura) if (!depois.C.estrutura.some((e) => e.id === a.id) && UUID.test(a.id))
    out.push({ rpc: "cat_guardar_estrutura", nota: `Estrutura retirada: ${a.n}`, args: { p_org: org, p_id: a.id, p_nome: a.n, p_categoria: a.cat, p_mensal: a.mensal, p_ativo: false, p_apagar: true } });

  // 3. perfis (pela chave da Emylia)
  const perfilA = porId(antes.C.perfis);
  const perfilRef = (chave: string): string | Tmp | null => ids.perfil.get(chave) ?? (perfilA.has(chave) ? null : { tmp: "perfil:" + chave });
  for (const p of depois.C.perfis) {
    const a = perfilA.get(p.id);
    if (a && igual(a, p)) continue;
    out.push({ rpc: "cat_guardar_perfil", nota: `Perfil: ${p.n}`, guarda: a ? undefined : "perfil:" + p.id, args: { p_org: org, p_id: a ? ids.perfil.get(p.id) ?? null : null, p_nome: p.n, p_salario_referencia: p.salario } });
  }

  // 4. equipamentos
  const eqA = porId(antes.C.equip);
  const equipRef = (id: string): string | Tmp => (UUID.test(id) && eqA.has(id) ? id : { tmp: "equip:" + id });
  for (const e of depois.C.equip) {
    const a = eqA.get(e.id);
    if (a && igual(a, e)) continue;
    out.push({ rpc: "cat_guardar_equipamento_horas", nota: `Equipamento: ${e.n}`, guarda: a ? undefined : "equip:" + e.id, args: {
      p_org: org, p_id: a ? e.id : null, p_nome: e.n, p_compra: e.compra, p_vida_horas: e.vida, p_residual: e.residual, p_manutencao_ano: e.manutAno, p_uso_ano_horas: e.usoAno, p_apagar: false } });
  }
  for (const a of antes.C.equip) if (!depois.C.equip.some((e) => e.id === a.id) && UUID.test(a.id))
    out.push({ rpc: "cat_guardar_equipamento_horas", nota: `Equipamento retirado: ${a.n}`, args: {
      p_org: org, p_id: a.id, p_nome: a.n, p_compra: a.compra, p_vida_horas: a.vida, p_residual: a.residual, p_manutencao_ano: a.manutAno, p_uso_ano_horas: a.usoAno, p_apagar: true } });

  // 5. árvore (os ofícios antes dos subs). Os ramos só da árvore dos produtos (soProduto) não se gravam aqui: mudam-se nas
  // Categorias de produtos.
  const noA = porId(antes.K.arvore), noD = porId(depois.K.arvore);
  const noRef = (id: string | null | undefined): string | Tmp | null => (!id ? null : noA.has(id) && UUID.test(id) ? id : { tmp: "no:" + id });
  /** O ramo na árvore dos serviços (service_categories); um ramo só de produtos não tem: null. */
  const noServico = (id: string | null | undefined) => (id && noD.get(id)?.soProduto ? null : noRef(id));
  /** Os nomes do ramo (categoria de topo e sub), para gravar pela árvore dos produtos. */
  const nomesRamo = (id: string | null | undefined): { p_categoria: string | null; p_subcategoria: string | null } => {
    const x = id ? noD.get(id) : undefined;
    if (!x) return { p_categoria: null, p_subcategoria: null };
    let topo = x;
    for (let i = 0; topo.pai && noD.has(topo.pai) && i < 10; i++) topo = noD.get(topo.pai)!;
    return topo === x ? { p_categoria: x.n, p_subcategoria: null } : { p_categoria: topo.n, p_subcategoria: x.n };
  };
  for (const n of [...depois.K.arvore].sort((x, y) => Number(x.pai != null) - Number(y.pai != null))) {
    if (n.soProduto) continue;
    const a = noA.get(n.id);
    if (a && a.n === n.n && a.pai === n.pai) continue;
    out.push({ rpc: "cat_guardar_categoria", nota: `Ramo: ${n.n}`, guarda: a ? undefined : "no:" + n.id, args: { p_org: org, p_id: a ? n.id : null, p_nome: n.n, p_pai: noRef(n.pai) } });
  }
  for (const a of antes.K.arvore) if (!a.soProduto && !noD.has(a.id) && UUID.test(a.id) && !(a.pai && !noD.has(a.pai)))
    out.push({ rpc: "cat_apagar_categoria", nota: `Ramo retirado: ${a.n}`, args: { p_org: org, p_id: a.id } });

  // 6. produtos e consumíveis soltos
  const prodBase = porId(base.produtos);
  const prodA = porId(antes.K.produtos), prodD = porId(depois.K.produtos);
  const consA = porId(antes.K.consumiveisCriados ?? []);
  // 23/11: um serviço que o Catálogo em memória não tem pela chave mas que já é um id da base (a página leve de Produtos escolhe-o da lista de
  // serviços da organização) vai pelo id; as chaves do motor e os serviços criados agora («n-…») nunca são UUID.
  const svcRef = (sid: string | undefined): string | Tmp | null => (!sid ? null : ids.servico.get(sid) ?? (UUID.test(sid) ? sid : { tmp: "svc:" + sid }));
  for (const p of depois.K.produtos) {
    const a = prodA.get(p.id);
    if (a && igual(a, p)) continue;
    const novo = !a || !prodBase.has(p.id);
    const id: string | Tmp | null = novo ? null : p.id;
    out.push({ rpc: "cat_guardar_produto", nota: `Produto: ${p.n}`, guarda: novo ? "prod:" + p.id : undefined, args: {
      p_org: org, p_id: id, p_tipo: "produto", p_nome: p.n, p_sku: p.sku ?? null, p_unidade: p.un, p_categoria_id: tabelas ? noServico(p.no) : noRef(p.no),
      p_custo: p.custo, p_custo_data: p.data || null, p_pvp: p.pvp ?? null, p_servico_id: svcRef(p.servico), p_fator_servico: p.fatorServico ?? 1,
      p_entulho_m3: p.entulho?.m3 ?? null, p_entulho_kg: p.entulho?.kg ?? null, p_descricao: p.desc ?? null } });
    if (novo || a?.marca !== p.marca || a?.fornecedor !== p.fornecedor)
      out.push({ rpc: "cat_guardar_produto_texto", nota: `Produto: ${p.n} (marca e fornecedor)`, args: { p_org: org, p_id: novo ? { tmp: "prod:" + p.id } : p.id, p_marca: p.marca, p_fornecedor: p.fornecedor } });
    if (novo) out.push(...ligarFornecedor(org, "Produto", p.n, { tmp: "prod:" + p.id }, p));
    if (tabelas)
      out.push({ rpc: "cat_guardar_produto_tabelas", nota: `Produto: ${p.n} (marca, unidade e categoria)`, args: {
        p_org: org, p_id: novo ? { tmp: "prod:" + p.id } : p.id, p_marca: p.marca, p_unidade: p.un, ...nomesRamo(p.no) } });
    // 13/11: os atributos escolhidos ao criar seguem com o produto novo (cat_guardar_produto_atributos); sem atributos a lista não muda.
    // Num produto que já existe os atributos gravam-se na ficha, direto (fichaProdutoDados.gravarAtributos), não por aqui.
    if (p.attrs?.length && (novo || !mesmosAtributos(a?.attrs, p.attrs)))
      out.push({ rpc: "cat_guardar_produto_atributos", nota: `Produto: ${p.n} (atributos)`, args: {
        p_org: org, p_produto: novo ? { tmp: "prod:" + p.id } : p.id, p_valores: valoresParaGravar(p.attrs) } });
    // 16/11 (20270118300000): o modelo do produto novo (o NNNN da referência é o número dele), antes de gerar a referência
    if (novo) out.push(...ligarModelo(org, p.n, { tmp: "prod:" + p.id }, p, nomesRamo(p.no)));
    // 17/11 (20270120900000): o estado do produto novo, depois de criado (cat_guardar_produto cria-o Ativo, por isso só quando não é «active»). Tolerante: o produto fica criado.
    if (novo && p.estado && p.estado !== "active")
      out.push({ rpc: "cat_definir_estado_produto", nota: `Produto: ${p.n} (estado)`, tolerante: true, aviso: `Produto «${p.n}» criado; estado por definir`,
        args: { p_org: org, p_produto: { tmp: "prod:" + p.id }, p_status: p.estado } });
    // 24/11: o «Modelo 3D» escolhido ao criar o produto, depois de ele existir (cat_definir_modelo_3d). Tolerante: o produto fica criado mesmo que a função ainda não exista na base.
    if (novo && ehIdDeModelo3D(p.modelo3d))
      out.push({ rpc: "cat_definir_modelo_3d", nota: `Produto: ${p.n} (modelo 3D)`, tolerante: true, aviso: `Produto «${p.n}» criado; modelo 3D por definir`,
        args: { p_org: org, p_alvo: "produto", p_id: { tmp: "prod:" + p.id }, p_modelo: p.modelo3d } });
    // 16/11 (20270118000000): um produto novo SEM referência escrita ganha uma gerada (categoria + subcategoria + número + atributos), como ÚLTIMO
    // passo (precisa da classificação e dos atributos já gravados). Tolerante: o produto fica criado mesmo que a referência fique por gerar.
    if (novo && !p.sku?.trim())
      out.push({ rpc: "cat_gerar_sku_produto", nota: `Produto: ${p.n} (referência)`, tolerante: true, produto: p.n, args: { p_org: org, p_produto: { tmp: "prod:" + p.id }, p_forcar: false } });
  }
  for (const c of depois.K.consumiveisCriados ?? []) {
    const a = consA.get(c.id);
    if (a && igual(a, c)) continue;
    const novo = !a || !prodBase.has(c.id);
    out.push({ rpc: "cat_guardar_produto", nota: `Consumível: ${c.n}`, guarda: novo ? "prod:" + c.id : undefined, args: {
      p_org: org, p_id: novo ? null : c.id, p_tipo: "consumivel", p_nome: c.n, p_sku: null, p_unidade: c.un, p_categoria_id: null,
      p_custo: c.preco, p_custo_data: c.data || null, p_pvp: null, p_servico_id: null, p_fator_servico: 1 } });
    if (novo || a?.fornecedor !== c.fornecedor)
      out.push({ rpc: "cat_guardar_produto_texto", nota: `Consumível: ${c.n} (fornecedor)`, args: { p_org: org, p_id: novo ? { tmp: "prod:" + c.id } : c.id, p_marca: null, p_fornecedor: c.fornecedor } });
    if (novo) out.push(...ligarFornecedor(org, "Consumível", c.n, { tmp: "prod:" + c.id }, c));
    if (tabelas && (novo || a?.un !== c.un))
      out.push({ rpc: "cat_guardar_produto_tabelas", nota: `Consumível: ${c.n} (unidade)`, args: {
        p_org: org, p_id: novo ? { tmp: "prod:" + c.id } : c.id, p_marca: null, p_unidade: c.un, p_categoria: null, p_subcategoria: null } });
  }

  // 7. serviços: a receita (mão de obra, equipamentos, consumíveis, preço) e os pormenores (ícone, produto exigido, entulho…)
  const criados = porId(depois.K.servicosCriados ?? []);
  const sids = new Set([...Object.keys(depois.C.receitas), ...criados.keys()]);
  const consProduto = new Map<string, string | Tmp>(); // consumível de receita sem produto → o produto criado
  for (const sid of sids) {
    const rA = antes.C.receitas[sid], rD = depois.C.receitas[sid];
    if (!rD) continue;
    const meta = (F: FotoCatalogo) => ({
      un: F.svc[sid]?.un, no: F.K.classe[sid], fases: F.K.fasesServico?.[sid], exige: F.K.exigeProduto?.[sid], qtd: F.K.qtdDe?.[sid],
      perg: F.K.perguntaManter?.[sid], ent: F.K.entulhoServico?.[sid], icone: F.K.icone?.[sid],
    });
    const mA = meta(antes), mD = meta(depois);
    const novo = !ids.servico.has(sid);
    if (!novo && igual(rA, rD) && igual(mA, mD)) continue;
    const item: ItemCatalogo | undefined = criados.get(sid) ?? itemCatalogo(sid);
    const nome = depois.svc[sid]?.n ?? item?.n ?? sid;
    // os consumíveis da receita: os que já são produtos usam o id; os escritos à mão criam um consumível
    const cons = rD.cons.map((c) => {
      let ref: string | Tmp;
      if (UUID.test(c.id) && prodBase.has(c.id)) {
        ref = c.id;
        const b = prodBase.get(c.id)!, velho = rA?.cons.find((x) => x.id === c.id);
        if (velho && velho.preco !== c.preco)
          out.push({ rpc: "cat_guardar_produto", nota: `Consumível: ${c.n} (preço)`, args: {
            p_org: org, p_id: c.id, p_tipo: b.tipo_catalogo, p_nome: b.name, p_sku: b.sku, p_unidade: b.unidade, p_categoria_id: b.catalogo_categoria_id,
            p_custo: c.preco, p_custo_data: c.data || null, p_pvp: null, p_servico_id: b.servico_id, p_fator_servico: b.fator_servico,
            p_entulho_m3: b.entulho_m3, p_entulho_kg: b.entulho_kg, p_descricao: b.short_description } });
      } else {
        const chave = `${c.n.trim().toLowerCase()}|${c.un}|${c.preco}`;
        if (!consProduto.has(chave)) {
          const t = "cons:" + sid + ":" + c.id;
          out.push({ rpc: "cat_guardar_produto", nota: `Consumível novo: ${c.n}`, guarda: t, args: {
            p_org: org, p_id: null, p_tipo: "consumivel", p_nome: c.n, p_sku: null, p_unidade: c.un, p_categoria_id: null,
            p_custo: c.preco, p_custo_data: c.data || null, p_pvp: null, p_servico_id: null, p_fator_servico: 1 } });
          if (c.fornecedor) out.push({ rpc: "cat_guardar_produto_texto", nota: `Consumível novo: ${c.n} (fornecedor)`, args: { p_org: org, p_id: { tmp: t }, p_marca: null, p_fornecedor: c.fornecedor } });
          if (tabelas) out.push({ rpc: "cat_guardar_produto_tabelas", nota: `Consumível novo: ${c.n} (unidade)`, args: {
            p_org: org, p_id: { tmp: t }, p_marca: null, p_unidade: c.un, p_categoria: null, p_subcategoria: null } });
          consProduto.set(chave, { tmp: t });
        }
        ref = consProduto.get(chave)!;
      }
      return { product_id: ref, quantidade: c.q, opcional: !!c.opcional };
    });
    // um serviço não fica num ramo só de produtos (não existe em service_categories)
    const no = mD.no && !noD.get(mD.no)?.soProduto ? noD.get(mD.no) : undefined;
    const cat: No | undefined = no?.pai ? noD.get(no.pai) : no;
    const fases = (mD.fases ?? []) as number[];
    const precoMudou = rA?.precoTabela !== rD.precoTabela;
    out.push({ rpc: "cat_guardar_servico", nota: `Serviço: ${nome}`, guarda: novo ? "svc:" + sid : undefined, args: {
      p_org: org, p_id: novo ? null : ids.servico.get(sid), p_nome: nome, p_sku: item?.sku ?? null, p_unidade: mD.un ?? item?.un ?? null,
      p_categoria_id: noRef(cat?.id), p_subcategoria_id: no?.pai ? noRef(no.id) : null, p_linhas: item?.linhas ?? [],
      p_medida: rD.medida ? MEDIDA_PARA_BASE[rD.medida] : null, p_modo_preco: rD.modo, p_preco_tabela: rD.precoTabela, p_margem: rD.margem,
      p_justificacao: rD.justificacao ?? null, p_fases: fases,
      p_mo: rD.mo.filter((p) => p.h > 0).map((p) => ({ nome: p.n, perfil_id: p.perfil ? perfilRef(p.perfil) : null, minutos_fixos: 0, minutos_por_unidade: Math.round(p.h * 60 * 100) / 100, fase: fases[0] ?? 1 })),
      p_equip: rD.equip.map((u) => ({ equipamento_id: equipRef(u.equip), horas: u.h })),
      p_cons: cons, p_nota_preco: precoMudou ? rD.hist.at(-1)?.nota ?? null : null,
    } });
    const regra = mD.qtd;
    out.push({ rpc: "cat_guardar_servico_detalhes", nota: `Serviço: ${nome} (pormenores)`, args: {
      p_org: org, p_id: novo ? { tmp: "svc:" + sid } : ids.servico.get(sid), p_chave: sid, p_unidade: mD.un ?? item?.un ?? null, p_icone: mD.icone ?? null,
      p_exige_categoria_id: tabelas ? noServico(mD.exige) : noRef(mD.exige), p_exige_medida: !regra ? null : regra.k === "fixo" ? "fixo" : MEDIDA_PARA_BASE[regra.med],
      p_exige_fator: !regra ? null : regra.k === "fixo" ? regra.q : regra.f, p_exige_arredondar: regra?.k === "por" ? regra.arred : false,
      p_pergunta_manter: mD.perg ?? null, p_entulho_modo: mD.ent?.modo ?? null, p_entulho_m3: mD.ent?.m3 ?? null, p_entulho_kg: mD.ent?.kg ?? null,
    } });
    if (tabelas)
      out.push({ rpc: "cat_guardar_servico_exige", nota: `Serviço: ${nome} (produto obrigatório)`, args: {
        p_org: org, p_id: novo ? { tmp: "svc:" + sid } : ids.servico.get(sid), ...nomesRamo(mD.exige) } });
  }

  // 8. perfis retirados (17/11, 20270118800000): apagam-se na base, no fim, depois de gravados os serviços que deixaram de os usar.
  // Só os que a base conhece (id real); um perfil criado e retirado antes de gravar não chega aqui. Se estiver em uso (serviços,
  // cargos, pessoas, obras…) a base recusa e diz onde: a gravação pára com esse motivo e o perfil volta ao recarregar.
  const perfilD = new Set(depois.C.perfis.map((p) => p.id));
  for (const a of antes.C.perfis) {
    const id = ids.perfil.get(a.id);
    if (perfilD.has(a.id) || !id) continue;
    out.push({ rpc: "cat_retirar_perfil", nota: `Retirar ${a.n}`, args: { p_org: org, p_id: id } });
  }
  return out;
}

/** 23/11: criar um produto na página leve de Produtos (CatalogoProdutos) grava SÓ o produto novo (e o que lhe diz respeito: texto, fornecedor, tabelas,
 *  atributos, modelo, estado, referência). A página não lê os serviços: o «antes» e o «depois» partilham os custos da store (lerCustos), que podem ter
 *  as receitas de outra página, e sem os ids dos serviços cada receita parecia um serviço NOVO (cat_guardar_servico sem id → «duplicate key
 *  services_organization_id_sku_key», com o produto já criado). Aqui os dois lados ficam com os mesmos custos e sem receitas nem serviços. */
export function diferencasProdutoNovo(org: string, antes: Catalogo, depois: Catalogo, C: Custos, margens: { min: number; alvo: number }): Chamada[] {
  const Cs: Custos = { ...C, receitas: {} };
  const foto = (K: Catalogo): FotoCatalogo => ({ C: Cs, K, svc: {}, margens });
  return diferencasCatalogo(org, foto(antes), foto(depois), { ids: { servico: new Map(), perfil: new Map(), tabelas: true }, produtos: [] });
}

/** Troca os { tmp } pelos ids que a base deu. */
function resolver(v: unknown, tmps: Map<string, string>): unknown {
  if (Array.isArray(v)) return v.map((x) => resolver(x, tmps));
  if (v && typeof v === "object") {
    if ("tmp" in v && Object.keys(v).length === 1) {
      const id = tmps.get((v as Tmp).tmp);
      if (!id) throw new Error(`Falta o id de ${(v as Tmp).tmp} (a chamada que o criava não correu).`);
      return id;
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolver(x, tmps)]));
  }
  return v;
}

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

/** Corre as chamadas por ordem. Pára na primeira que falhar e diz qual foi, salvo as tolerantes: essas falham para `avisos` e o resto corre. */
export async function executarCatalogo(chamadas: readonly Chamada[], rpc: Rpc): Promise<{ feitas: number; erro: string | null; avisos: string[] }> {
  const tmps = new Map<string, string>();
  const avisos: string[] = [];
  let feitas = 0;
  for (const c of chamadas) {
    let args: Record<string, unknown>;
    try { args = resolver(c.args, tmps) as Record<string, unknown>; }
    catch (e) {
      // um passo tolerante cujo id não se obteve (o que o criava falhou, já avisado) fica por fazer; os outros correm
      if (c.tolerante) { if (c.aviso) avisos.push(`${c.aviso}: não se chegou a identificar o que faltava`); continue; }
      return { feitas, erro: `${c.nota}: ${(e as Error).message}`, avisos };
    }
    let r: Awaited<ReturnType<Rpc>>;
    try { r = await rpc(c.rpc, args); }
    catch (e) { r = { data: null, error: { message: (e as Error).message || "erro de rede" } }; }
    const { data, error } = r;
    if (error) {
      if (c.tolerante) { avisos.push(c.aviso ? `${c.aviso}: ${erroAmigavel(error, "erro da base")}` : avisoSku(c.produto, erroAmigavel(error, "erro da base"))); continue; }
      return { feitas, erro: `${c.nota}: ${error.message ?? "erro da base"}`, avisos };
    }
    if (c.guarda) { const v = c.extrai ? c.extrai(data) : data; if (typeof v === "string") tmps.set(c.guarda, v); }
    // a base responde sem erro mas pode não ter gerado (faltam siglas, ou a referência atual é manual): o produto fica, o aviso diz porquê
    if (c.rpc === "cat_gerar_sku_produto" && data && typeof data === "object" && (data as { gerado?: unknown }).gerado === false) {
      const v = data as { sku?: string | null; faltas?: unknown; motivo?: string | null };
      avisos.push(avisoSku(c.produto, textoSemGerar({ sku: v.sku ?? null, gerado: false, faltas: Array.isArray(v.faltas) ? v.faltas.filter((f): f is string => typeof f === "string") : [], motivo: v.motivo ?? null })));
    }
    feitas++;
  }
  return { feitas, erro: null, avisos };
}

/** O antes de uma comparação (uma cópia: as stores mudam os objetos no sítio). */
export const fotografar = (F: FotoCatalogo): FotoCatalogo => structuredClone(F);
/** Lista de receitas com a origem marcada como editada (a base grava sempre "editada"). */
export const comoEditada = (r: ReceitaV2): ReceitaV2 => ({ ...r, origem: "editada" });
