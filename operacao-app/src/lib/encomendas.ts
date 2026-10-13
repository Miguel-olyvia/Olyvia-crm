/**
 * Encomenda Cliente e notas de encomenda a fornecedor (pós-contrato, Frente A).
 *
 * SQL: supabase/migrations/20261215100000_pos_contrato_encomendas.sql (no
 * CRM). Tudo passa por RPCs (rpc_ec_*, rpc_nota_*): as tabelas só se leem.
 *
 *   Contrato assinado → Encomenda Cliente (rascunho → validada)
 *                     → notas por fornecedor (proposta → aprovada | rejeitada)
 *                     → encomenda ao fornecedor (purchase_orders, "pendente")
 *
 * As regras puras (o "porquê" do fornecedor, o agrupamento por tipo, o que
 * cada botão pode fazer) estão aqui e testadas em __tests__/encomendas.test.ts.
 */
import { supabase } from "./supabase";
import { ErroDeDados } from "./dados";

/* ───────────────────────────── Tipos ───────────────────────────── */

export type TipoLinha = "produto" | "consumivel" | "equipamento" | "mao_obra";
export type EstadoEncomenda = "rascunho" | "validada" | "anulada";
export type EstadoFornecedor = "por_gerar" | "nao_necessaria" | "por_aprovar" | "aprovada" | "parcial";
export type EstadoNota = "proposta" | "aprovada" | "rejeitada";
export type OrigemFornecedor = "preferido" | "linha_orcamento" | "produto" | "marca" | "nenhum";
export type OrigemLinha = "orcamento" | "conjunto" | "ficha_servico" | "obra" | "manual";

export interface LinhaEncomenda {
  id: string;
  tipo: TipoLinha;
  product_id: string | null;
  service_id: string | null;
  equipamento_id: string | null;
  skill_id: string | null;
  descricao: string;
  unidade: string | null;
  qtd_necessaria: number;
  qtd_stock: number;
  qtd_em_encomenda: number;
  qtd_em_falta: number;
  origem: OrigemLinha;
  quote_id: string | null;
  quote_line_id: string | null;
  supplier_id: string | null;
  fornecedor_nome: string | null;
  fornecedor_origem: OrigemFornecedor;
  fornecedor_mudado: boolean;
  preco_compra: number | null;
  prazo_dias: number | null;
  gere_stock: boolean | null;
  servico_nome: string | null;
}

export interface LinhaNota {
  id: string;
  encomenda_linha_id: string | null;
  product_id: string;
  descricao: string;
  unidade: string | null;
  qtd: number;
  preco_compra: number | null;
}

export interface NotaEncomenda {
  id: string;
  estado: EstadoNota;
  supplier_id: string | null;
  fornecedor_nome: string | null;
  fornecedor_email: string | null;
  prazo_previsto: string | null;
  versao: number;
  aprovada_em: string | null;
  aprovada_por_nome: string | null;
  rejeitada_em: string | null;
  motivo_rejeicao: string | null;
  purchase_order_id: string | null;
  purchase_order_numero: string | null;
  purchase_order_estado: string | null;
  total: number;
  linhas: LinhaNota[];
}

export interface CabecalhoEncomenda {
  id: string;
  estado: EstadoEncomenda;
  fornecedor_estado: EstadoFornecedor;
  obra_id: string | null;
  versao: number;
  validada_em: string | null;
  validada_por_nome: string | null;
  gerada_em: string | null;
  reaberta_em: string | null;
  reaberta_motivo: string | null;
}

export interface EncomendaCliente {
  contrato: { id: string; numero: string; estado: string; assinado: boolean };
  pode: { editar: boolean; validar: boolean; aprovar: boolean; mudar_fornecedor: boolean };
  encomenda: CabecalhoEncomenda | null;
  linhas: LinhaEncomenda[];
  notas: NotaEncomenda[];
  fornecedores: { id: string; nome: string }[];
}

/* ───────────────────────────── Rótulos ─────────────────────────── */

export const ROTULO_TIPO: Record<TipoLinha, string> = {
  produto: "Produtos",
  consumivel: "Consumíveis",
  equipamento: "Equipamentos",
  mao_obra: "Mão de obra",
};

export const ORDEM_TIPOS: readonly TipoLinha[] = ["produto", "consumivel", "equipamento", "mao_obra"];

export const ROTULO_ESTADO_ENCOMENDA: Record<EstadoEncomenda, string> = {
  rascunho: "Por validar",
  validada: "Validada",
  anulada: "Anulada",
};

export const ROTULO_ESTADO_FORNECEDOR: Record<EstadoFornecedor, string> = {
  por_gerar: "À espera da Encomenda Cliente",
  nao_necessaria: "Não necessária",
  por_aprovar: "Por aprovar",
  parcial: "Parcialmente aprovada",
  aprovada: "Aprovada",
};

export const ROTULO_ESTADO_NOTA: Record<EstadoNota, string> = {
  proposta: "Por aprovar",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
};

/* ───────────────────────────── Regras puras ────────────────────── */

const num = (x: unknown): number => {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
};
const numOuNulo = (x: unknown): number | null => (x == null || x === "" ? null : num(x));

/**
 * Porque é que a linha tem (ou não tem) este fornecedor — o texto que
 * aparece por baixo do nome. `null` para linhas que não se encomendam.
 */
export function porqueFornecedor(l: Pick<LinhaEncomenda, "tipo" | "product_id" | "fornecedor_origem" | "fornecedor_mudado">): string | null {
  if (l.tipo === "equipamento" || l.tipo === "mao_obra" || !l.product_id) return null;
  if (l.fornecedor_mudado) return "escolhido à mão";
  switch (l.fornecedor_origem) {
    case "preferido":
      return "fornecedor preferido";
    case "linha_orcamento":
      return "sem fornecedor preferido — o escolhido na linha do orçamento";
    case "produto":
      return "sem fornecedor preferido — o fornecedor da ficha do produto";
    case "marca":
      return "sem fornecedor preferido — a marca tem o nome deste fornecedor";
    default:
      return "sem fornecedor preferido nem marca ligada";
  }
}

/** As linhas por tipo, na ordem produtos → consumíveis → equipamentos → mão de obra (tipos vazios fora). */
export function agruparPorTipo<T extends { tipo: TipoLinha }>(linhas: readonly T[]): { tipo: TipoLinha; linhas: T[] }[] {
  return ORDEM_TIPOS.map((tipo) => ({ tipo, linhas: linhas.filter((l) => l.tipo === tipo) })).filter(
    (g) => g.linhas.length > 0
  );
}

/** Uma linha que se compra (tem produto): as outras não têm stock, encomenda nem falta. */
export const linhaDeCompra = (l: Pick<LinhaEncomenda, "tipo" | "product_id">) =>
  (l.tipo === "produto" || l.tipo === "consumivel") && !!l.product_id;

/** Resumo do cartão: quantas linhas, quantas com falta, o que falta sem fornecedor. */
export function resumoEncomenda(linhas: readonly LinhaEncomenda[]) {
  const compra = linhas.filter(linhaDeCompra);
  return {
    linhas: linhas.length,
    emFalta: compra.filter((l) => l.qtd_em_falta > 0).length,
    semFornecedor: compra.filter((l) => !l.supplier_id).length,
    cobertas: compra.filter((l) => l.qtd_em_falta <= 0 && l.qtd_necessaria > 0).length,
  };
}

/** O que se pode fazer à Encomenda Cliente agora. */
export function acoesEncomenda(ec: Pick<EncomendaCliente, "contrato" | "pode" | "encomenda" | "linhas">) {
  const estado = ec.encomenda?.estado ?? null;
  return {
    gerar: ec.pode.editar && ec.contrato.assinado && estado !== "anulada",
    validar: ec.pode.validar && estado === "rascunho" && ec.linhas.length > 0,
    reabrir: ec.pode.validar && estado === "validada",
    editarLinhas: ec.pode.editar && estado === "rascunho",
  };
}

/** Uma nota aprova-se se estiver em proposta, tiver fornecedor e linhas. Senão, diz porquê. */
export function bloqueioAprovar(n: Pick<NotaEncomenda, "estado" | "supplier_id" | "linhas">): string | null {
  if (n.estado !== "proposta") return "Esta nota já não está por aprovar.";
  if (!n.supplier_id) return "Escolha o fornecedor de cada linha antes de aprovar.";
  if (n.linhas.length === 0) return "A nota não tem linhas.";
  return null;
}

/** "hoje + 5 dias" → "18/10" — ou um travessão. */
export function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export const formatarQtd = (x: number | null | undefined) =>
  x == null ? "—" : Number.isInteger(x) ? String(x) : x.toLocaleString("pt-PT", { maximumFractionDigits: 2 });

/** Tira o "ERROR: " e o "P0001" do Postgres: fica a frase que a RPC escreveu. */
export function mensagemDeErro(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!m) return "Não foi possível concluir. Tente outra vez.";
  return m.replace(/^ERROR:\s*/i, "").trim();
}

/** A RPC ainda não está instalada nesta base (SQL por colar). */
export function rpcEmFalta(error: { message: string; code?: string } | null): boolean {
  return (
    !!error &&
    (error.code === "PGRST202" ||
      error.code === "42883" ||
      /rpc_ec_|rpc_nota_|function .* does not exist|could not find the function/i.test(error.message))
  );
}

/* ───────────────────────────── Normalizar ──────────────────────── */

function normalizarLinha(r: Record<string, unknown>): LinhaEncomenda {
  return {
    id: String(r.id),
    tipo: r.tipo as TipoLinha,
    product_id: (r.product_id as string | null) ?? null,
    service_id: (r.service_id as string | null) ?? null,
    equipamento_id: (r.equipamento_id as string | null) ?? null,
    skill_id: (r.skill_id as string | null) ?? null,
    descricao: String(r.descricao ?? ""),
    unidade: (r.unidade as string | null) ?? null,
    qtd_necessaria: num(r.qtd_necessaria),
    qtd_stock: num(r.qtd_stock),
    qtd_em_encomenda: num(r.qtd_em_encomenda),
    qtd_em_falta: num(r.qtd_em_falta),
    origem: (r.origem as OrigemLinha) ?? "manual",
    quote_id: (r.quote_id as string | null) ?? null,
    quote_line_id: (r.quote_line_id as string | null) ?? null,
    supplier_id: (r.supplier_id as string | null) ?? null,
    fornecedor_nome: (r.fornecedor_nome as string | null) ?? null,
    fornecedor_origem: (r.fornecedor_origem as OrigemFornecedor) ?? "nenhum",
    fornecedor_mudado: r.fornecedor_mudado === true,
    preco_compra: numOuNulo(r.preco_compra),
    prazo_dias: numOuNulo(r.prazo_dias),
    gere_stock: r.gere_stock == null ? null : r.gere_stock === true,
    servico_nome: (r.servico_nome as string | null) ?? null,
  };
}

function normalizarNota(r: Record<string, unknown>): NotaEncomenda {
  return {
    id: String(r.id),
    estado: r.estado as EstadoNota,
    supplier_id: (r.supplier_id as string | null) ?? null,
    fornecedor_nome: (r.fornecedor_nome as string | null) ?? null,
    fornecedor_email: (r.fornecedor_email as string | null) ?? null,
    prazo_previsto: (r.prazo_previsto as string | null) ?? null,
    versao: num(r.versao),
    aprovada_em: (r.aprovada_em as string | null) ?? null,
    aprovada_por_nome: (r.aprovada_por_nome as string | null) ?? null,
    rejeitada_em: (r.rejeitada_em as string | null) ?? null,
    motivo_rejeicao: (r.motivo_rejeicao as string | null) ?? null,
    purchase_order_id: (r.purchase_order_id as string | null) ?? null,
    purchase_order_numero: (r.purchase_order_numero as string | null) ?? null,
    purchase_order_estado: (r.purchase_order_estado as string | null) ?? null,
    total: num(r.total),
    linhas: ((r.linhas as Record<string, unknown>[] | null) ?? []).map((l) => ({
      id: String(l.id),
      encomenda_linha_id: (l.encomenda_linha_id as string | null) ?? null,
      product_id: String(l.product_id),
      descricao: String(l.descricao ?? ""),
      unidade: (l.unidade as string | null) ?? null,
      qtd: num(l.qtd),
      preco_compra: numOuNulo(l.preco_compra),
    })),
  };
}

export function normalizarEncomenda(r: Record<string, unknown>): EncomendaCliente {
  const c = (r.contrato ?? {}) as Record<string, unknown>;
  const p = (r.pode ?? {}) as Record<string, unknown>;
  const e = r.encomenda as Record<string, unknown> | null;
  return {
    contrato: {
      id: String(c.id ?? ""),
      numero: String(c.numero ?? ""),
      estado: String(c.estado ?? ""),
      assinado: c.assinado === true,
    },
    pode: {
      editar: p.editar === true,
      validar: p.validar === true,
      aprovar: p.aprovar === true,
      mudar_fornecedor: p.mudar_fornecedor === true,
    },
    encomenda: e
      ? {
          id: String(e.id),
          estado: e.estado as EstadoEncomenda,
          fornecedor_estado: e.fornecedor_estado as EstadoFornecedor,
          obra_id: (e.obra_id as string | null) ?? null,
          versao: num(e.versao),
          validada_em: (e.validada_em as string | null) ?? null,
          validada_por_nome: (e.validada_por_nome as string | null) ?? null,
          gerada_em: (e.gerada_em as string | null) ?? null,
          reaberta_em: (e.reaberta_em as string | null) ?? null,
          reaberta_motivo: (e.reaberta_motivo as string | null) ?? null,
        }
      : null,
    linhas: ((r.linhas as Record<string, unknown>[] | null) ?? []).map(normalizarLinha),
    notas: ((r.notas as Record<string, unknown>[] | null) ?? []).map(normalizarNota),
    fornecedores: ((r.fornecedores as { id: string; nome: string }[] | null) ?? []).map((f) => ({
      id: String(f.id),
      nome: String(f.nome),
    })),
  };
}

/* ───────────────────────────── Chamadas ────────────────────────── */

export class EncomendasPorInstalar extends ErroDeDados {
  constructor() {
    super("As encomendas pós-contrato ainda não estão instaladas nesta base (falta colar o SQL).");
  }
}

async function chamar<T>(rpc: string, args: Record<string, unknown>, contexto: string): Promise<T> {
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) {
    if (rpcEmFalta(error)) throw new EncomendasPorInstalar();
    // eslint-disable-next-line no-console
    console.error(`[Encomendas] ${contexto}:`, error);
    // As RPCs escrevem frases para pessoas ("Escolha o fornecedor antes de aprovar.").
    throw new ErroDeDados(error.message ? mensagemDeErro(error.message) : `Não foi possível ${contexto}.`);
  }
  return data as T;
}

export async function obterEncomenda(contratoId: string): Promise<EncomendaCliente> {
  const r = await chamar<Record<string, unknown>>("rpc_ec_obter", { p_contract_id: contratoId }, "ler a Encomenda Cliente");
  return normalizarEncomenda(r ?? {});
}

export const gerarEncomenda = (contratoId: string) =>
  chamar<string>("rpc_ec_gerar", { p_contract_id: contratoId }, "gerar a Encomenda Cliente");

export const validarEncomenda = (encomendaId: string) =>
  chamar<{ fornecedor_estado: EstadoFornecedor; notas: number; versao: number }>(
    "rpc_ec_validar",
    { p_encomenda_id: encomendaId },
    "validar a Encomenda Cliente"
  );

export const reabrirEncomenda = (encomendaId: string, motivo: string) =>
  chamar<void>("rpc_ec_reabrir", { p_encomenda_id: encomendaId, p_motivo: motivo }, "reabrir a Encomenda Cliente");

export const guardarLinha = (
  encomendaId: string,
  linha: { id?: string | null; tipo?: TipoLinha | null; productId?: string | null; descricao?: string | null; unidade?: string | null; qtd: number }
) =>
  chamar<string>(
    "rpc_ec_linha_guardar",
    {
      p_encomenda_id: encomendaId,
      p_linha_id: linha.id ?? null,
      p_tipo: linha.tipo ?? null,
      p_product_id: linha.productId ?? null,
      p_descricao: linha.descricao ?? null,
      p_unidade: linha.unidade ?? null,
      p_qtd: linha.qtd,
    },
    "guardar a linha"
  );

export const apagarLinha = (linhaId: string) =>
  chamar<void>("rpc_ec_linha_apagar", { p_linha_id: linhaId }, "apagar a linha");

export const aprovarNota = (notaId: string) =>
  chamar<string>("rpc_nota_aprovar", { p_nota_id: notaId }, "aprovar a nota de encomenda");

export const rejeitarNota = (notaId: string, motivo: string) =>
  chamar<void>("rpc_nota_rejeitar", { p_nota_id: notaId, p_motivo: motivo }, "rejeitar a nota de encomenda");

export const mudarFornecedor = (notaLinhaId: string, fornecedorId: string) =>
  chamar<string>(
    "rpc_nota_mudar_fornecedor",
    { p_nota_linha_id: notaLinhaId, p_supplier_id: fornecedorId },
    "mudar o fornecedor"
  );

/* ───────────────────────────── Dados em falta ──────────────────── */

export interface DadosEmFalta {
  resumo: {
    produtos_vendidos: number;
    sem_fornecedor_preferido: number;
    sem_fornecedor: number;
    sem_preco_compra: number;
    sem_gestao_stock: number;
    servicos_vendidos: number;
    servicos_sem_ficha: number;
    marcas_por_ligar: number;
    encomendas_paradas: number;
  };
  produtos: {
    product_id: string;
    nome: string;
    sku: string | null;
    marca: string | null;
    contratos: number;
    tem_preferido: boolean;
    tem_preco: boolean;
    gere_stock: boolean;
    resolvido_id: string | null;
    resolvido_nome: string | null;
    resolvido_origem: OrigemFornecedor;
  }[];
  servicos_sem_ficha: { service_id: string; nome: string; contratos: number }[];
  marcas: { brand_id: string; marca: string; supplier_id: string; fornecedor: string; produtos: number; vendidos: number }[];
  encomendas_paradas: { purchase_order_id: string; numero: string | null; fornecedor: string | null; dias: number; contrato_id: string | null }[];
  pode_ligar: boolean;
}

/** O que falta num produto vendido, em frases curtas. */
export function problemasProduto(p: DadosEmFalta["produtos"][number]): string[] {
  const out: string[] = [];
  if (!p.tem_preferido) {
    out.push(
      p.resolvido_id
        ? `sem fornecedor preferido (encomenda-se a ${p.resolvido_nome ?? "—"} pela ${
            p.resolvido_origem === "marca" ? "marca" : p.resolvido_origem === "produto" ? "ficha do produto" : "linha"
          })`
        : "sem fornecedor"
    );
  }
  if (!p.tem_preco) out.push("sem preço de compra");
  if (!p.gere_stock) out.push("não gere stock");
  return out;
}

export async function lerDadosEmFalta(orgId: string): Promise<DadosEmFalta> {
  return chamar<DadosEmFalta>("rpc_ec_dados_em_falta", { p_org: orgId }, "ler os dados em falta");
}

export const ligarMarcaFornecedor = (orgId: string, marcaId: string, fornecedorId: string) =>
  chamar<{ marcadas: number; criadas: number; total: number }>(
    "rpc_ec_ligar_marca_fornecedor",
    { p_org: orgId, p_brand_id: marcaId, p_supplier_id: fornecedorId },
    "ligar a marca ao fornecedor"
  );
