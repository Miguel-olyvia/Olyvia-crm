// Criar no Catálogo (27/10/2026): serviços, produtos, equipamentos, consumíveis e técnicos novos, feitos à mão no Catálogo.
// Funções puras, sem React: o ecrã é CriarNoCatalogo.tsx.
//
// Onde fica cada coisa criada:
// · serviço: o item em Catalogo.servicosCriados (entra no CATALOGO_TODO pelo catalogo.ts: porServicosCriados), o nó em
//   Catalogo.classe, o ícone em Catalogo.icone e a receita completa em Custos.receitas (origem "editada"). Não entra em S.svc:
//   fica "não usado" até a visita ou o orçamento o escolherem (o motor cria-o com garantirServico, com esta receita).
// · produto: Catalogo.produtos (como o criarProduto dos Materiais), com PVP, referência, descrição e o serviço que traz.
// · equipamento: Custos.equip. · técnico (perfil): Custos.perfis. · consumível: Catalogo.consumiveisCriados, até uma receita o usar.
//
// PRODUÇÃO (docs/10-pendentes-e-decisoes.md): os produtos e consumíveis criados aqui são da organização e ainda não estão ligados
// aos artigos dos fornecedores (Inventário › catálogo do fornecedor). Na passagem a produção têm de se ligar.
import { CATALOGO_TODO, normal, type ItemCatalogo, type LinhaCat } from "./catalogo";
import { r2, type Estado, type MedKey, type SvcId } from "./motor";
import type { IconeServicoKey, IlustracaoKey } from "./ilustracoes";
import { criarProduto, type Catalogo, type ConsumivelCriado } from "./v2/catalogoModelo";
import {
  HOJE, custoHoraPerfil, custoReceita, margemSobrePreco, mesesEntre, precoReceita,
  type CustoCalc, type Custos, type Equip, type ModoPreco, type ReceitaV2,
} from "./v2/custosModelo";
import { consumiveisCatalogo, type ConsCatalogo } from "./fichaServico";

export type TipoCriar = "servico" | "produto" | "equipamento" | "consumivel" | "tecnico";
export const TIPOS_CRIAR: { k: TipoCriar; t: string; d: string }[] = [
  { k: "servico", t: "Serviço", d: "O que se vende e se faz em obra, com a receita e o preço." },
  { k: "produto", t: "Produto", d: "O que se vende ao cliente: louça, móvel, cerâmico…" },
  { k: "equipamento", t: "Equipamento", d: "Máquinas e ferramentas: dão o €/h que entra no custo." },
  { k: "consumivel", t: "Consumível", d: "O material gasto na obra: cola, fita, silicone…" },
  { k: "tecnico", t: "Técnico", d: "Um tipo de técnico (ofício) para os passos das receitas." },
];

const slug = (s: string) => normal(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Um id livre com o prefixo e o nome (acrescenta -2, -3… se já existir). */
function idLivre(pref: string, n: string, usados: Iterable<string>): string {
  const U = new Set(usados), base = `${pref}${slug(n) || "novo"}`;
  let id = base, i = 2;
  while (U.has(id)) id = `${base}-${i++}`;
  return id;
}
const valido = (x: number) => typeof x === "number" && !isNaN(x) && isFinite(x);

/* ------------------------------------------------------------------ serviço */
export interface PassoNovo { n: string; perfil: string; h: number }
export interface EquipNovo { equip: string; h: number }
export interface ConsNovo { n: string; q: number; un: string; preco: number; fornecedor: string; data?: string; opcional?: boolean }
export interface NovoServico {
  n: string;
  /** O nó da árvore (ofício ou sub). */
  no: string;
  un: string;
  /** De onde vem a quantidade na visita (null: o comercial escreve). */
  medida: MedKey | null;
  linhas: LinhaCat[];
  mo: PassoNovo[];
  equip: EquipNovo[];
  cons: ConsNovo[];
  modo: ModoPreco;
  precoTabela: number;
  margem: number;
  icone?: IconeServicoKey;
}

/** O ofício e o sub (nomes) de um nó. */
export function oficioESub(K: Pick<Catalogo, "arvore">, no: string): { oficio: string; sub: string | null } | null {
  const x = K.arvore.find((a) => a.id === no);
  if (!x) return null;
  if (x.pai == null) return { oficio: x.n, sub: null };
  const p = K.arvore.find((a) => a.id === x.pai);
  return p ? { oficio: p.n, sub: x.n } : null;
}

/** A receita do serviço novo (como fica em Custos.receitas). */
export function receitaNova(o: NovoServico, sid: SvcId, hoje = HOJE): ReceitaV2 {
  const rec: ReceitaV2 = {
    sid, origem: "editada",
    mo: o.mo.filter((p) => p.h > 0).map((p, i) => ({ id: "p" + (i + 1), n: p.n.trim() || "Execução", perfil: p.perfil, h: r2(p.h) })),
    equip: o.equip.filter((e) => e.h > 0).map((e, i) => ({ id: "e" + i, equip: e.equip, h: r2(e.h) })),
    cons: o.cons.filter((c) => c.q > 0).map((c, i) => ({
      id: "c" + i, n: c.n, q: r2(c.q), un: c.un, preco: r2(c.preco), fornecedor: c.fornecedor || "Por escolher", data: c.data ?? hoje, ...(c.opcional ? { opcional: true } : {}),
    })),
    modo: o.modo, precoTabela: r2(o.precoTabela || 0), margem: o.margem, medida: o.medida, hist: [],
  };
  return rec;
}

export interface PrevisaoServico { c: CustoCalc; preco: number; m: number }
/** O custo, o preço e a margem do serviço como está no formulário (a pré-visualização). */
export function previsaoServico(o: NovoServico, C: Custos, estrutura: boolean): PrevisaoServico {
  const rec = receitaNova(o, "previa");
  const c = custoReceita(rec, C, estrutura);
  const preco = precoReceita(rec, c.total);
  return { c, preco, m: margemSobrePreco(preco, c.total) };
}

/** O que falta para o serviço se poder criar (vazio: pronto). Pela ordem do formulário. */
export function faltasServico(K: Catalogo, o: NovoServico): string[] {
  const out: string[] = [];
  const n = o.n.trim();
  if (!n) out.push("Escreva o nome do serviço.");
  else if (CATALOGO_TODO.some((c) => normal(c.n) === normal(n)) || (K.servicosCriados ?? []).some((c) => normal(c.n) === normal(n))) out.push(`Já existe um serviço «${n}».`);
  if (!oficioESub(K, o.no)) out.push("Escolha o ofício.");
  if (!o.un.trim()) out.push("Escolha a unidade.");
  if (!o.mo.some((p) => p.h > 0)) out.push("Ponha pelo menos um passo de mão de obra com horas.");
  else if (o.mo.some((p) => p.h > 0 && !p.perfil)) out.push("Escolha o técnico de cada passo.");
  if (o.modo === "tabela" && !(o.precoTabela > 0)) out.push("Escreva o preço de tabela.");
  if (o.modo === "margem" && !(o.margem >= 0 && o.margem < 100)) out.push("A margem fica entre 0 e 99%.");
  return out;
}

export type ResCriar<T> = ({ ok: true; id: string } & T) | { ok: false; erro: string };
/** Cria o serviço: o item e a classificação no Catálogo, a receita nos Custos. */
export function criarServico(K: Catalogo, C: Custos, o: NovoServico, hoje = HOJE): ResCriar<{ K: Catalogo; C: Custos }> {
  const f = faltasServico(K, o);
  if (f.length) return { ok: false, erro: f[0] };
  const os = oficioESub(K, o.no)!;
  const n = o.n.trim();
  const usados = [...CATALOGO_TODO.map((c) => c.id), ...(K.servicosCriados ?? []).map((c) => c.id), ...Object.keys(C.receitas)];
  const sid = idLivre("n-", n, usados);
  const rec = receitaNova({ ...o, n }, sid, hoje);
  const custo = custoReceita(rec, C, false);
  rec.hist = [{ data: hoje, preco: r2(precoReceita(rec, custo.total)), nota: "Criado no Catálogo" }];
  const item: ItemCatalogo = {
    id: sid, n, cat: os.oficio, ...(os.sub ? { sub: os.sub } : {}), un: o.un, hf: 0, hu: r2(rec.mo.reduce((a, p) => a + p.h, 0)), qm: 1, usos: 0,
    linhas: o.linhas.length ? [...o.linhas] : ["geral"],
  };
  const K2: Catalogo = {
    ...K, servicosCriados: [...(K.servicosCriados ?? []), item], classe: { ...K.classe, [sid]: o.no },
    ...(o.icone ? { icone: { ...(K.icone ?? {}), [sid]: o.icone } } : {}),
  };
  return { ok: true, id: sid, K: K2, C: { ...C, receitas: { ...C.receitas, [sid]: rec } } };
}

/* ------------------------------------------------------------------ produto */
export interface NovoProdutoCompleto {
  n: string; custo: number; un: string; marca?: string; fornecedor?: string; no?: string | null;
  sku?: string; pvp?: number | null; desc?: string; servico?: SvcId | null; img?: IlustracaoKey;
}
/** O preço de venda do produto: o PVP, ou o custo com a margem-alvo. */
export const precoVendaProduto = (custo: number, pvp: number | null | undefined, alvo: number) =>
  pvp != null && pvp > 0 ? pvp : alvo < 100 ? custo / (1 - alvo / 100) : custo;
export function faltasProduto(K: Catalogo, o: NovoProdutoCompleto): string[] {
  const out: string[] = [], n = o.n.trim();
  if (!n) out.push("Escreva o nome do produto.");
  else if (K.produtos.some((p) => normal(p.n) === normal(n))) out.push(`Já existe «${n}».`);
  if (!valido(o.custo) || o.custo < 0) out.push("Escreva o custo de compra.");
  if (!o.un.trim()) out.push("Escolha a unidade.");
  if (o.pvp != null && (!valido(o.pvp) || o.pvp < 0)) out.push("O PVP tem de ser um número.");
  const sku = o.sku?.trim();
  if (sku && K.produtos.some((p) => p.sku && normal(p.sku) === normal(sku))) out.push(`A referência ${sku} já é de outro produto.`);
  return out;
}
export function criarProdutoCompleto(K: Catalogo, o: NovoProdutoCompleto, hoje = HOJE): ResCriar<{ K: Catalogo }> {
  const f = faltasProduto(K, o);
  if (f.length) return { ok: false, erro: f[0] };
  const r = criarProduto(K, { n: o.n, custo: o.custo, un: o.un, marca: o.marca, fornecedor: o.fornecedor, no: o.no ?? null }, hoje);
  if (!r.ok) return r;
  const produtos = r.K.produtos.map((p) => p.id !== r.id ? p : {
    ...p,
    ...(o.sku?.trim() ? { sku: o.sku.trim() } : {}), ...(o.pvp != null && o.pvp > 0 ? { pvp: r2(o.pvp) } : {}),
    ...(o.desc?.trim() ? { desc: o.desc.trim() } : {}), ...(o.servico ? { servico: o.servico } : {}), ...(o.img ? { img: o.img } : {}),
  });
  return { ok: true, id: r.id, K: { ...r.K, produtos } };
}

/* ------------------------------------------------------------------ equipamento */
export type NovoEquip = Omit<Equip, "id">;
export function faltasEquip(C: Custos, o: NovoEquip): string[] {
  const out: string[] = [], n = o.n.trim();
  if (!n) out.push("Escreva o nome do equipamento.");
  else if (C.equip.some((e) => normal(e.n) === normal(n))) out.push(`Já existe «${n}».`);
  if (!valido(o.compra) || o.compra < 0) out.push("Escreva o preço de compra.");
  if (!valido(o.vida) || o.vida <= 0) out.push("A vida útil tem de ter horas.");
  if (!valido(o.residual) || o.residual < 0) out.push("O valor residual não pode ser negativo.");
  else if (o.residual > o.compra) out.push("O valor residual não pode passar a compra.");
  if (!valido(o.manutAno) || o.manutAno < 0) out.push("A manutenção não pode ser negativa.");
  if (!valido(o.usoAno) || o.usoAno < 0) out.push("As horas de uso não podem ser negativas.");
  return out;
}
export function criarEquip(C: Custos, o: NovoEquip): ResCriar<{ C: Custos }> {
  const f = faltasEquip(C, o);
  if (f.length) return { ok: false, erro: f[0] };
  const n = o.n.trim(), id = idLivre("e-", n, C.equip.map((e) => e.id));
  return { ok: true, id, C: { ...C, equip: [...C.equip, { ...o, n, id }] } };
}

/* ------------------------------------------------------------------ consumível */
export type NovoConsumivel = Omit<ConsumivelCriado, "id" | "data">;
/** Os consumíveis das receitas e os criados à mão que nenhuma receita usa ainda (a lista do Catálogo e da escolha). */
export function consumiveisComCriados(S: Estado, C: Custos, K: Pick<Catalogo, "consumiveisCriados">, hoje = HOJE): ConsCatalogo[] {
  const L = consumiveisCatalogo(S, C, hoje);
  const ja = new Set(L.map((x) => normal(x.n)));
  for (const c of K.consumiveisCriados ?? []) if (!ja.has(normal(c.n))) {
    L.push({ id: c.id, n: c.n, un: c.un, preco: c.preco, fornecedor: c.fornecedor, data: c.data, servicos: [], opcionalEm: 0, desatualizado: mesesEntre(c.data, hoje) >= C.par.mesesDesatualizado });
  }
  return L.sort((a, b) => a.n.localeCompare(b.n, "pt"));
}
export function faltasConsumivel(existentes: readonly { n: string }[], o: NovoConsumivel): string[] {
  const out: string[] = [], n = o.n.trim();
  if (!n) out.push("Escreva o nome do consumível.");
  else if (existentes.some((c) => normal(c.n) === normal(n))) out.push(`Já existe «${n}».`);
  if (!o.un.trim()) out.push("Escolha a unidade.");
  if (!valido(o.preco) || o.preco < 0) out.push("Escreva o preço por unidade.");
  return out;
}
export function criarConsumivel(K: Catalogo, existentes: readonly { n: string }[], o: NovoConsumivel, hoje = HOJE): ResCriar<{ K: Catalogo }> {
  const f = faltasConsumivel(existentes, o);
  if (f.length) return { ok: false, erro: f[0] };
  const n = o.n.trim(), L = K.consumiveisCriados ?? [];
  const id = idLivre("k-", n, L.map((c) => c.id));
  const c: ConsumivelCriado = { id, n, un: o.un.trim(), preco: r2(o.preco), fornecedor: o.fornecedor.trim() || "Por escolher", data: hoje, ...(o.opcional ? { opcional: true } : {}) };
  return { ok: true, id, K: { ...K, consumiveisCriados: [...L, c] } };
}

/* ------------------------------------------------------------------ técnico (perfil) */
export interface NovoTecnico { n: string; salario: number | null }
export function faltasTecnico(C: Custos, o: NovoTecnico): string[] {
  const out: string[] = [], n = o.n.trim();
  if (!n) out.push("Escreva o nome do tipo de técnico.");
  else if (C.perfis.some((p) => normal(p.n) === normal(n))) out.push(`Já existe «${n}».`);
  if (o.salario != null && (!valido(o.salario) || o.salario < 0)) out.push("O salário tem de ser um número.");
  return out;
}
/** O €/h que o técnico novo vai ter (só pelo salário: ainda não há técnicos do RH com este perfil). */
export const horaTecnicoNovo = (C: Custos, o: NovoTecnico) => (o.salario != null && o.salario > 0 ? custoHoraPerfil({ id: "", n: o.n, salario: o.salario }, C.par) : null);
export function criarTecnico(C: Custos, o: NovoTecnico): ResCriar<{ C: Custos }> {
  const f = faltasTecnico(C, o);
  if (f.length) return { ok: false, erro: f[0] };
  const n = o.n.trim(), id = idLivre("", n, C.perfis.map((p) => p.id));
  return { ok: true, id, C: { ...C, perfis: [...C.perfis, { id, n, salario: o.salario != null && o.salario > 0 ? o.salario : null }] } };
}
