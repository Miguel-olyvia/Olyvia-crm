/**
 * Checklist de arranque da obra (pós-contrato): as 3 validações do Planeador
 * — Encomenda Cliente, encomenda a fornecedor, plano. Regras puras; quem
 * manda é a base (rpc_ops_obra_arranque e o bloqueio em
 * rpc_ops_obra_mudar_estado, db/obra-arranque.sql).
 */

export type EstadoEncomendaCliente = "por_instalar" | "nao_aplicavel" | "por_gerar" | "rascunho" | "validada";
export type EstadoFornecedor =
  | "por_instalar"
  | "nao_aplicavel"
  | "por_validar"
  | "por_gerar"
  | "por_aprovar"
  | "parcial"
  | "aprovada"
  | "nao_necessaria";
export type EstadoPlano = "por_aprovar" | "aprovado";

export interface MaterialAntes {
  tarefa_id: string;
  nome: string;
  inicio: string | null;
  material_chega_em: string | null;
  nota: string | null;
}

export interface Arranque {
  obra_id: string;
  estado_obra: string;
  arrancou: boolean;
  frente_a_instalada: boolean;
  encomenda_cliente: {
    estado: EstadoEncomendaCliente;
    ok: boolean;
    id: string | null;
    contrato_id: string | null;
    versao?: number | null;
    validada_por: string | null;
    validada_por_nome: string | null;
    validada_em: string | null;
  };
  fornecedor: {
    estado: EstadoFornecedor;
    ok: boolean;
    notas: {
      total: number;
      propostas: number;
      aprovadas: number;
      rejeitadas: number;
      sem_fornecedor: number;
      prazo_previsto: string | null;
    } | null;
  };
  plano: {
    estado: EstadoPlano;
    ok: boolean;
    motivo: string | null;
    aprovado_por: string | null;
    aprovado_por_nome: string | null;
    aprovado_em: string | null;
    tarefas: number;
    sem_datas: number;
    sem_pessoas: number;
    material_antes: MaterialAntes[];
    avisos: string[];
  };
  pode_arrancar: boolean;
  falta: string[];
}

export type Tom = "ok" | "pendente" | "neutro";

export interface RotuloEstado {
  texto: string;
  tom: Tom;
}

const EC: Record<EstadoEncomendaCliente, RotuloEstado> = {
  por_instalar: { texto: "por instalar", tom: "neutro" },
  nao_aplicavel: { texto: "não aplicável", tom: "neutro" },
  por_gerar: { texto: "por gerar", tom: "pendente" },
  rascunho: { texto: "por validar", tom: "pendente" },
  validada: { texto: "validada", tom: "ok" },
};

const FO: Record<EstadoFornecedor, RotuloEstado> = {
  por_instalar: { texto: "por instalar", tom: "neutro" },
  nao_aplicavel: { texto: "não aplicável", tom: "neutro" },
  por_validar: { texto: "à espera da Encomenda Cliente", tom: "pendente" },
  por_gerar: { texto: "por gerar", tom: "pendente" },
  por_aprovar: { texto: "por aprovar", tom: "pendente" },
  parcial: { texto: "aprovada em parte", tom: "pendente" },
  aprovada: { texto: "aprovada", tom: "ok" },
  nao_necessaria: { texto: "não necessária", tom: "ok" },
};

const PL: Record<EstadoPlano, RotuloEstado> = {
  por_aprovar: { texto: "por aprovar", tom: "pendente" },
  aprovado: { texto: "aprovado", tom: "ok" },
};

export const rotuloEncomendaCliente = (e: string): RotuloEstado =>
  EC[e as EstadoEncomendaCliente] ?? {
    texto: e.replace(/_/g, " "),
    tom: "neutro",
  };
export const rotuloFornecedor = (e: string): RotuloEstado =>
  FO[e as EstadoFornecedor] ?? { texto: e.replace(/_/g, " "), tom: "neutro" };
export const rotuloPlano = (e: string): RotuloEstado =>
  PL[e as EstadoPlano] ?? { texto: e.replace(/_/g, " "), tom: "neutro" };

/** Quantas das 3 validações já não impedem o arranque. */
export function validacoesFeitas(a: Pick<Arranque, "encomenda_cliente" | "fornecedor" | "plano">): number {
  return [a.encomenda_cliente.ok, a.fornecedor.ok, a.plano.ok].filter(Boolean).length;
}

/** "Falta: aprovar o plano da obra; validar a Encomenda Cliente." — ou null se já pode arrancar. */
export function mensagemFalta(a: Pick<Arranque, "pode_arrancar" | "falta"> | null | undefined): string | null {
  if (!a || a.pode_arrancar) return null;
  const f = (a.falta ?? []).filter((x) => x && x.trim());
  if (f.length === 0) return "Falta completar o checklist de arranque.";
  return `Falta: ${f.join("; ")}.`;
}

/** O plano só se aprova antes de a obra arrancar e se tiver tarefas. */
export function podeAprovarPlano(a: Pick<Arranque, "arrancou" | "estado_obra" | "plano">): boolean {
  return !a.arrancou && (a.estado_obra === "planeada" || a.estado_obra === "suspensa") && a.plano.tarefas > 0;
}
