// CRM: grava na base o que mudou no Catálogo e custos. Os ecrãs da Emylia mudam as stores (mudarCustos, mudarCatalogo) e S.svc;
// aqui compara-se o antes (o que veio da base) com o depois e sai a lista de chamadas às funções cat_* (diferencasCatalogo: pura,
// testável). executarCatalogo corre-as por ordem: o que se cria primeiro (um ramo, um perfil, um consumível) fica com o id da base
// e as chamadas seguintes usam-no ({ tmp: "…" }). No fim, a página volta a ler da base.
import type { Servico, SvcId } from "../motor";
import { itemCatalogo, type ItemCatalogo } from "../catalogo";
import type { Custos, ReceitaV2 } from "../v2/custosModelo";
import type { Catalogo, No } from "../v2/catalogoModelo";
import { MEDIDA_PARA_BASE, type CatalogoMontado, type LinhaProduto } from "./catalogoReal";

/** O Catálogo num momento: o que os ecrãs mostram. */
export interface FotoCatalogo {
  C: Custos;
  K: Catalogo;
  svc: Record<SvcId, Servico>;
  margens: { min: number; alvo: number };
}
/** Um valor que só se sabe depois de uma chamada anterior (o id que a base deu). */
export interface Tmp { tmp: string }
export interface Chamada { rpc: string; args: Record<string, unknown>; guarda?: string; nota: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const porId = <T extends { id: string }>(L: readonly T[]) => new Map(L.map((x) => [x.id, x]));

/** O que mudou, em chamadas às funções cat_*, pela ordem em que têm de correr. */
export function diferencasCatalogo(org: string, antes: FotoCatalogo, depois: FotoCatalogo, base: Pick<CatalogoMontado, "ids"> & { produtos: LinhaProduto[] }): Chamada[] {
  const out: Chamada[] = [];
  const ids = base.ids;

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

  // 5. árvore (os ofícios antes dos subs)
  const noA = porId(antes.K.arvore), noD = porId(depois.K.arvore);
  const noRef = (id: string | null | undefined): string | Tmp | null => (!id ? null : noA.has(id) && UUID.test(id) ? id : { tmp: "no:" + id });
  for (const n of [...depois.K.arvore].sort((x, y) => Number(x.pai != null) - Number(y.pai != null))) {
    const a = noA.get(n.id);
    if (a && a.n === n.n && a.pai === n.pai) continue;
    out.push({ rpc: "cat_guardar_categoria", nota: `Ramo: ${n.n}`, guarda: a ? undefined : "no:" + n.id, args: { p_org: org, p_id: a ? n.id : null, p_nome: n.n, p_pai: noRef(n.pai) } });
  }
  for (const a of antes.K.arvore) if (!noD.has(a.id) && UUID.test(a.id) && !(a.pai && !noD.has(a.pai)))
    out.push({ rpc: "cat_apagar_categoria", nota: `Ramo retirado: ${a.n}`, args: { p_org: org, p_id: a.id } });

  // 6. produtos e consumíveis soltos
  const prodBase = porId(base.produtos);
  const prodA = porId(antes.K.produtos), prodD = porId(depois.K.produtos);
  const consA = porId(antes.K.consumiveisCriados ?? []);
  const svcRef = (sid: string | undefined): string | Tmp | null => (!sid ? null : ids.servico.get(sid) ?? { tmp: "svc:" + sid });
  for (const p of depois.K.produtos) {
    const a = prodA.get(p.id);
    if (a && igual(a, p)) continue;
    const novo = !a || !prodBase.has(p.id);
    const id: string | Tmp | null = novo ? null : p.id;
    out.push({ rpc: "cat_guardar_produto", nota: `Produto: ${p.n}`, guarda: novo ? "prod:" + p.id : undefined, args: {
      p_org: org, p_id: id, p_tipo: "produto", p_nome: p.n, p_sku: p.sku ?? null, p_unidade: p.un, p_categoria_id: noRef(p.no),
      p_custo: p.custo, p_custo_data: p.data || null, p_pvp: p.pvp ?? null, p_servico_id: svcRef(p.servico), p_fator_servico: p.fatorServico ?? 1,
      p_entulho_m3: p.entulho?.m3 ?? null, p_entulho_kg: p.entulho?.kg ?? null, p_descricao: p.desc ?? null } });
    if (novo || a?.marca !== p.marca || a?.fornecedor !== p.fornecedor)
      out.push({ rpc: "cat_guardar_produto_texto", nota: `Produto: ${p.n} (marca e fornecedor)`, args: { p_org: org, p_id: novo ? { tmp: "prod:" + p.id } : p.id, p_marca: p.marca, p_fornecedor: p.fornecedor } });
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
          consProduto.set(chave, { tmp: t });
        }
        ref = consProduto.get(chave)!;
      }
      return { product_id: ref, quantidade: c.q, opcional: !!c.opcional };
    });
    const no = mD.no ? noD.get(mD.no) : undefined;
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
      p_exige_categoria_id: noRef(mD.exige), p_exige_medida: !regra ? null : regra.k === "fixo" ? "fixo" : MEDIDA_PARA_BASE[regra.med],
      p_exige_fator: !regra ? null : regra.k === "fixo" ? regra.q : regra.f, p_exige_arredondar: regra?.k === "por" ? regra.arred : false,
      p_pergunta_manter: mD.perg ?? null, p_entulho_modo: mD.ent?.modo ?? null, p_entulho_m3: mD.ent?.m3 ?? null, p_entulho_kg: mD.ent?.kg ?? null,
    } });
  }
  return out;
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

/** Corre as chamadas por ordem. Pára na primeira que falhar e diz qual foi. */
export async function executarCatalogo(chamadas: readonly Chamada[], rpc: Rpc): Promise<{ feitas: number; erro: string | null }> {
  const tmps = new Map<string, string>();
  let feitas = 0;
  for (const c of chamadas) {
    let args: Record<string, unknown>;
    try { args = resolver(c.args, tmps) as Record<string, unknown>; }
    catch (e) { return { feitas, erro: `${c.nota}: ${(e as Error).message}` }; }
    const { data, error } = await rpc(c.rpc, args);
    if (error) return { feitas, erro: `${c.nota}: ${error.message ?? "erro da base"}` };
    if (c.guarda && typeof data === "string") tmps.set(c.guarda, data);
    feitas++;
  }
  return { feitas, erro: null };
}

/** O antes de uma comparação (uma cópia: as stores mudam os objetos no sítio). */
export const fotografar = (F: FotoCatalogo): FotoCatalogo => structuredClone(F);
/** Lista de receitas com a origem marcada como editada (a base grava sempre "editada"). */
export const comoEditada = (r: ReceitaV2): ReceitaV2 => ({ ...r, origem: "editada" });
