// 23/11: o serviço que um produto traz (products.servico_id e fator_servico), na página LEVE de Produtos (CatalogoProdutos), que não lê o Catálogo dos serviços.
//   · ao criar: a lista dos serviços da organização (a tabela services, pela RLS: quem não tem services.view recebe a lista vazia e o formulário fica sem a secção);
//     o id escolhido grava-se pela mesma cat_guardar_produto de sempre (p_servico_id, p_fator_servico).
//   · na ficha: cat_definir_servico_produto (20270126100000) muda só o serviço e o fator, sem regravar o resto do produto.
import { AINDA_NAO, erroAmigavel, rpcLivre, type Res } from "../fichaProdutoDados";

export interface ServicoEscolha { id: string; nome: string; sku: string | null }
/** A opção da lista «Procurar serviço» (v = o id da base). */
export interface OpcaoServico { v: string; t: string; sub?: string }

let pCliente: Promise<unknown> | null = null;
const cliente = () => (pCliente ??= import("@/integrations/supabase/client").then((m) => m.supabase as unknown, (e) => { pCliente = null; throw e; }));

/** Os serviços do Catálogo da organização (vivos), por nome. */
export async function lerServicosDaOrganizacao(org: string): Promise<Res<ServicoEscolha[]>> {
  try {
    const sb = (await cliente()) as any;
    const { data, error } = await sb.from("services").select("id, name, sku").eq("organization_id", org).eq("is_deleted", false).eq("no_catalogo", true).order("name").limit(5000);
    if (error) return { ok: false, erro: erroAmigavel(error, "Não foi possível ler os serviços.") };
    const L = (Array.isArray(data) ? data : []) as { id?: unknown; name?: unknown; sku?: unknown }[];
    return { ok: true, v: L.filter((s) => typeof s.id === "string" && typeof s.name === "string" && !!s.name.trim())
      .map((s) => ({ id: s.id as string, nome: (s.name as string).trim(), sku: typeof s.sku === "string" && s.sku.trim() ? s.sku.trim() : null })) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error && e.message ? e.message : "Não foi possível ler os serviços." };
  }
}

/** A lista do formulário: nome e, ao lado, a referência do serviço. */
export const opcoesServicos = (L: readonly ServicoEscolha[]): OpcaoServico[] => L.map((s) => ({ v: s.id, t: s.nome, ...(s.sku ? { sub: s.sku } : {}) }));

/** O fator tem de ser um número > 0 (até 4 casas na base). */
export const fatorValido = (f: number) => Number.isFinite(f) && f > 0 && f <= 100000;

/** Muda o serviço que o produto traz (null: nenhum) e quantas unidades do serviço por unidade do produto. */
export async function definirServicoDoProduto(org: string, produto: string, servico: string | null, fator = 1): Promise<Res<null>> {
  if (servico && !fatorValido(fator)) return { ok: false, erro: "O fator tem de ser um número maior que zero." };
  try {
    const { error } = await rpcLivre("cat_definir_servico_produto", { p_org: org, p_produto: produto, p_servico: servico, p_fator: servico ? fator : 1 });
    if (error) {
      const t = erroAmigavel(error, "Não foi possível gravar o serviço.");
      return { ok: false, erro: t === AINDA_NAO ? "Mudar o serviço na ficha ainda não está disponível nesta base (falta a migração 20270126000000)." : /^CT00\d$/.test(error.code ?? "") && error.message ? error.message : t, ...(error.code ? { codigo: error.code } : {}) };
    }
    return { ok: true, v: null };
  } catch (e) {
    return { ok: false, erro: e instanceof Error && e.message ? e.message : "Não foi possível gravar o serviço." };
  }
}
