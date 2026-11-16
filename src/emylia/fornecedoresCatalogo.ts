// 16/11 (20270118100000_catalogo_fornecedor_produto.sql): o fornecedor de um produto ou consumível no Catálogo. Os nomes e os argumentos das
// duas funções da base ficam todos aqui (contrato; conferir com a migration quando existir):
//   cat_ler_fornecedores(p_org) → { fornecedores: [{ id, nome, nif, email, ativo }], pode_criar }
//   cat_ligar_fornecedor_produto(p_org, p_produto, p_fornecedor | null, p_novo_nome | null, p_nif, p_email) → { fornecedor: { id, nome, criado, reutilizado }, ligacao: { id, preferido } }
// Exatamente um de p_fornecedor / p_novo_nome. Criar um fornecedor exige suppliers.create (CT001 sem permissão: mostra-se tal e qual).
import { chamar, type ResG } from "./atributosGestao";

export const RPC_LER_FORNECEDORES = "cat_ler_fornecedores";
export const RPC_LIGAR_FORNECEDOR = "cat_ligar_fornecedor_produto";

export interface FornecedorCat { id: string; nome: string; nif: string | null; email: string | null; ativo: boolean }
export interface FornecedoresCat { fornecedores: FornecedorCat[]; podeCriar: boolean }
/** Um fornecedor novo, ainda por criar: só se cria na base quando o produto se grava. */
export interface FornecedorPendente { nome: string; nif?: string; email?: string }
/** A escolha do campo Fornecedor: um fornecedor real (`id`), um novo por criar (`novo`) ou nada. Em protótipo `nome` é texto livre. */
export interface FornecedorEscolhido { id: string | null; nome: string; novo: { nif: string; email: string } | null }
export const FORNECEDOR_VAZIO: FornecedorEscolhido = { id: null, nome: "", novo: null };

type Bruto = Record<string, unknown>;
const texto = (x: unknown): string => (typeof x === "string" ? x : "");
const ouNull = (x: unknown): string | null => texto(x).trim() || null;

export async function lerFornecedoresCat(org: string): Promise<ResG<FornecedoresCat>> {
  const r = await chamar(RPC_LER_FORNECEDORES, { p_org: org }, "Não foi possível ler os fornecedores.");
  if (!r.ok) return r;
  const v = r.v as { fornecedores?: unknown; pode_criar?: unknown };
  if (!Array.isArray(v.fornecedores)) return { ok: false, erro: "Não foi possível ler os fornecedores." };
  const fornecedores = (v.fornecedores as Bruto[]).map((f): FornecedorCat => ({ id: texto(f.id), nome: texto(f.nome), nif: ouNull(f.nif), email: ouNull(f.email), ativo: f.ativo !== false }))
    .filter((f) => f.id && f.nome.trim());
  return { ok: true, v: { fornecedores, podeCriar: v.pode_criar === true } };
}

/** Só espaços e pontos a menos: o NIF vai sem eles. */
export const limparNif = (t: string) => t.replace(/[\s.]/g, "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NIF = /^[A-Za-z0-9]{5,20}$/;

/** A validação simples do mini-formulário: nome obrigatório; NIF e email opcionais, mas com forma de NIF e de email. Devolve a frase, ou null se está bem. */
export function validarNovoFornecedor(o: { nome: string; nif: string; email: string }): string | null {
  if (!o.nome.trim()) return "Escreva o nome do fornecedor.";
  if (o.nif.trim() && !NIF.test(limparNif(o.nif))) return "O NIF não parece válido: use só letras e números, sem espaços (5 a 20).";
  if (o.email.trim() && !EMAIL.test(o.email.trim())) return "O email não parece válido.";
  return null;
}

/** Os argumentos de cat_ligar_fornecedor_produto, ou null se não há fornecedor real (nem id, nem novo). `produto`: o id, ou { tmp } por resolver. */
export function argsLigarFornecedor(org: string, produto: string | { tmp: string }, f: { fornecedorId?: string; fornecedorNovo?: FornecedorPendente }): Record<string, unknown> | null {
  if (f.fornecedorId) return { p_org: org, p_produto: produto, p_fornecedor: f.fornecedorId, p_novo_nome: null, p_nif: null, p_email: null };
  const n = f.fornecedorNovo;
  if (!n?.nome.trim()) return null;
  return { p_org: org, p_produto: produto, p_fornecedor: null, p_novo_nome: n.nome.trim(), p_nif: limparNif(n.nif ?? "") || null, p_email: n.email?.trim() || null };
}
