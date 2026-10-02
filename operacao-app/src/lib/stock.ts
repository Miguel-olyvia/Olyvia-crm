/**
 * Stock do CRM, só leitura (db/stock-leitura.sql).
 *
 * "Disponível" é o "Livre" do ecrã de Stocks do CRM: o stock físico da
 * organização (todos os armazéns) menos o que as Encomendas de Cliente
 * assinadas já reservaram. "A chegar" são as encomendas a fornecedor para
 * stock ainda por receber. Nada aqui reserva stock.
 */
import { supabase } from "./supabase";
import { ErroDeDados } from "./dados";

/** Um material ligado a uma tarefa. `disponivel` null = não se sabe / não gere stock. */
export type MaterialLigado = {
  produto_id: string;
  nome: string;
  quantidade: number;
  unidade: string | null;
  disponivel: number | null;
};

export interface ProdutoStock {
  produto_id: string;
  nome: string;
  sku: string | null;
  unidade: string | null;
  gere_stock: boolean;
  fisico: number;
  reservado: number;
  a_chegar: number;
  /** físico − reservado; null quando o produto não gere stock. */
  disponivel: number | null;
}

export interface MaterialSugerido extends ProdutoStock {
  /** Da ficha técnica × quantidade do serviço, em unidades de stock. */
  quantidade: number;
}

const num = (x: unknown): number => {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
};

function normalizar(r: Record<string, unknown>): ProdutoStock {
  return {
    produto_id: String(r.produto_id),
    nome: String(r.nome ?? ""),
    sku: (r.sku as string | null) ?? null,
    unidade: (r.unidade as string | null) ?? null,
    gere_stock: r.gere_stock !== false,
    fisico: num(r.fisico),
    reservado: num(r.reservado),
    a_chegar: num(r.a_chegar),
    disponivel: r.disponivel == null ? null : num(r.disponivel),
  };
}

function rebentar(contexto: string, error: { message: string } | null): void {
  if (!error) return;
  // eslint-disable-next-line no-console
  console.error(`[Stock] ${contexto}:`, error);
  throw new ErroDeDados(
    error.message?.includes("Sem acesso")
      ? "Sem acesso ao stock desta organização."
      : `Não foi possível ${contexto}.`
  );
}

export async function pesquisarStock(orgId: string, texto: string, limite = 20): Promise<ProdutoStock[]> {
  const { data, error } = await supabase.rpc("rpc_ops_stock_pesquisar", {
    p_org: orgId,
    p_texto: texto,
    p_limite: limite,
  });
  rebentar("pesquisar o stock", error);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizar);
}

export async function sugerirMateriais(
  orgId: string,
  servicoId: string,
  quantidadeServico: number
): Promise<MaterialSugerido[]> {
  const { data, error } = await supabase.rpc("rpc_ops_stock_sugerir", {
    p_org: orgId,
    p_servico_id: servicoId,
    p_quantidade: quantidadeServico,
  });
  rebentar("ler os materiais da ficha técnica", error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...normalizar(r),
    quantidade: num(r.quantidade),
  }));
}

export async function disponibilidadeStock(orgId: string, produtos: readonly string[]): Promise<ProdutoStock[]> {
  const ids = [...new Set(produtos)];
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc("rpc_ops_stock_disponivel", {
    p_org: orgId,
    p_produtos: ids,
  });
  rebentar("refrescar o stock", error);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizar);
}

/** Um produto do stock como material de uma tarefa. */
export function paraMaterial(p: ProdutoStock, quantidade: number): MaterialLigado {
  return {
    produto_id: p.produto_id,
    nome: p.nome,
    quantidade,
    unidade: p.unidade,
    disponivel: p.disponivel,
  };
}

/** Quanto falta para `quantidade`, dado o disponível (0 se chega ou se não se sabe). */
export function emFalta(quantidade: number, disponivel: number | null): number {
  if (disponivel == null) return 0;
  return Math.max(0, arred(quantidade - Math.max(0, disponivel)));
}

export interface TotalMaterial {
  produto_id: string;
  nome: string;
  unidade: string | null;
  necessario: number;
  disponivel: number | null;
  falta: number;
}

/** Soma por produto (várias tarefas pedem o mesmo cimento) e compara com o disponível. */
export function agregarMateriais(materiais: readonly MaterialLigado[]): TotalMaterial[] {
  const m = new Map<string, TotalMaterial>();
  for (const x of materiais) {
    const t = m.get(x.produto_id);
    if (t) {
      t.necessario = arred(t.necessario + x.quantidade);
      if (t.disponivel == null && x.disponivel != null) t.disponivel = x.disponivel;
    } else {
      m.set(x.produto_id, {
        produto_id: x.produto_id,
        nome: x.nome,
        unidade: x.unidade,
        necessario: arred(x.quantidade),
        disponivel: x.disponivel,
        falta: 0,
      });
    }
  }
  const lista = [...m.values()];
  for (const t of lista) t.falta = emFalta(t.necessario, t.disponivel);
  return lista.sort((a, b) => b.falta - a.falta || a.nome.localeCompare(b.nome, "pt"));
}

export const arred = (x: number) => Math.round(x * 1000) / 1000;

export const formatarQtd = (x: number) =>
  Number.isInteger(x) ? String(x) : x.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
