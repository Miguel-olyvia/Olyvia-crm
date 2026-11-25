/**
 * Os ativos (módulo «Ativos», fase 1): as formas que `rpc_ativos_listar` devolve e as constantes dos formulários.
 * Três grupos, escolhidos ao criar e que nunca mudam: pessoa (o que se atribui a alguém), serviço (ligado a um equipamento do
 * catálogo) e estrutura (armazéns, mesas, cadeiras...). Só se regista: nada daqui entra em preços, custos ou orçamentos.
 */

export const GRUPOS_ATIVO = ["servico", "estrutura", "pessoa"] as const;
export type GrupoAtivo = (typeof GRUPOS_ATIVO)[number];

/** Os mesmos seis tipos de `pessoas_equipamentos`. */
export const TIPOS_ATIVO_PESSOA = ["telemovel", "portatil", "viatura", "fardamento", "ferramentas", "outro"] as const;
export const TIPOS_ATIVO_ESTRUTURA = ["instalacoes", "mobiliario", "eletronica", "outro"] as const;

export const MOTIVOS_DESATIVACAO = ["abatido", "vendido", "perdido", "outro"] as const;
export type MotivoDesativacao = (typeof MOTIVOS_DESATIVACAO)[number];

export type EstadoAtivo = "ativo" | "desativado";

/**
 * Limites da base. A data vai de 2000-01-01 a hoje + 10 anos (`dataMaxima()` de `custoBase.ts`, o mesmo teto do RH e da
 * migration), e os euros chegam a 9 999 999 999,99.
 */
export const LIMITES_ATIVO = {
  valorMaximo: 9999999999.99,
  nome: 120,
  codigo: 40,
  numSerie: 80,
  localizacao: 120,
  notas: 1000,
  notaDesativacao: 500,
  vidaMinima: 1,
  vidaMaxima: 600,
  dataMinima: "2000-01-01",
} as const;

export interface CatEquipamentoLigado {
  id: string;
  nome: string;
  vidaAnos: number | null;
  vidaHoras: number | null;
  usoAnoHoras: number | null;
}

export interface AtribuicaoDoAtivo {
  pessoaEquipamentoId: string;
  pessoaNome: string | null;
  entrega: string | null;
}

/** Um ativo, como o ecrã o usa (valores já em número, datas AAAA-MM-DD). */
export interface Ativo {
  id: string;
  grupo: GrupoAtivo;
  tipo: string | null;
  nome: string;
  codigo: string | null;
  numSerie: string | null;
  catEquipamentoId: string | null;
  dataCompra: string;
  valorCompra: number;
  valorResidual: number;
  vidaMeses: number | null;
  manutencaoAno: number;
  centroCustoId: string | null;
  localizacao: string | null;
  notas: string | null;
  estado: EstadoAtivo;
  desativadoEm: string | null;
  desativadoMotivo: string | null;
  desativadoNota: string | null;
  /** Só nos de serviço. */
  catEquipamento: CatEquipamentoLigado | null;
  /** Só nos de pessoa, e só com `hr.pessoas.retribuicao.view`; sem ela, `null`. */
  atribuicao: AtribuicaoDoAtivo | null;
}

/** Uma atribuição do RH ainda sem ativo registado (só vem com `hr.pessoas.retribuicao.view`). */
export interface AtribuicaoSemAtivo {
  id: string;
  pessoaNome: string | null;
  tipo: string | null;
  descricao: string | null;
  valor: number | null;
  entrega: string | null;
  estado: string | null;
}

export interface OpcaoCentroCusto {
  id: string;
  nome: string;
}

export interface OpcaoEquipamento {
  id: string;
  nome: string;
  vidaAnos: number | null;
  vidaHoras: number | null;
}

export interface AtivosLidos {
  servico: Ativo[];
  estrutura: Ativo[];
  pessoa: Ativo[];
  /** `null` quando o RH está oculto (sem `hr.pessoas.retribuicao.view`). */
  atribuicoesSemAtivo: AtribuicaoSemAtivo[] | null;
  rhOculto: boolean;
  centrosCusto: OpcaoCentroCusto[];
  /** A lista foi cortada nos 2000 ativos que a base devolve. */
  truncado: boolean;
}

export interface OpcoesAtivo {
  equipamentos: OpcaoEquipamento[];
  centrosCusto: OpcaoCentroCusto[];
}

type Linha = Record<string, unknown>;

const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const numeroOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const numero = (v: unknown): number => numeroOuNull(v) ?? 0;
const data = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const objeto = (v: unknown): Linha | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Linha) : null);
const lista = (v: unknown): Linha[] => (Array.isArray(v) ? v.filter((x): x is Linha => objeto(x) !== null) : []);

function catDaLinha(v: unknown): CatEquipamentoLigado | null {
  const c = objeto(v);
  const id = c && texto(c.id);
  if (!c || !id) return null;
  return { id, nome: texto(c.nome) ?? "", vidaAnos: numeroOuNull(c.vida_anos), vidaHoras: numeroOuNull(c.vida_horas), usoAnoHoras: numeroOuNull(c.uso_ano_horas) };
}

function atribuicaoDaLinha(v: unknown): AtribuicaoDoAtivo | null {
  const a = objeto(v);
  const id = a && texto(a.pessoa_equipamento_id);
  if (!a || !id) return null;
  return { pessoaEquipamentoId: id, pessoaNome: texto(a.pessoa_nome), entrega: data(a.entrega) };
}

/** Uma linha de `rpc_ativos_listar` como `Ativo`; `null` se não tiver id, grupo ou data de compra legíveis. */
export function ativoDaLinha(l: Linha): Ativo | null {
  const id = texto(l.id);
  const grupo = l.grupo;
  const dataCompra = data(l.data_compra);
  if (!id || !dataCompra || (grupo !== "servico" && grupo !== "estrutura" && grupo !== "pessoa")) return null;
  return {
    id,
    grupo,
    tipo: texto(l.tipo),
    nome: texto(l.nome) ?? "",
    codigo: texto(l.codigo),
    numSerie: texto(l.num_serie),
    catEquipamentoId: texto(l.cat_equipamento_id),
    dataCompra,
    valorCompra: numero(l.valor_compra),
    valorResidual: numero(l.valor_residual),
    vidaMeses: numeroOuNull(l.vida_meses),
    manutencaoAno: numero(l.manutencao_ano),
    centroCustoId: texto(l.centro_custo_id),
    localizacao: texto(l.localizacao),
    notas: texto(l.notas),
    estado: l.estado === "desativado" ? "desativado" : "ativo",
    desativadoEm: data(l.desativado_em),
    desativadoMotivo: texto(l.desativado_motivo),
    desativadoNota: texto(l.desativado_nota),
    catEquipamento: catDaLinha(l.cat_equipamento),
    atribuicao: atribuicaoDaLinha(l.atribuicao),
  };
}

const ativosDe = (v: unknown): Ativo[] => lista(v).flatMap((l) => ativoDaLinha(l) ?? []);

const centrosDe = (v: unknown): OpcaoCentroCusto[] =>
  lista(v).flatMap((c) => {
    const id = texto(c.id);
    return id ? [{ id, nome: texto(c.nome) ?? id }] : [];
  });

/** A resposta de `rpc_ativos_listar` tal como o ecrã a usa. Tolerante: uma chave que falte vira lista vazia. */
export function ativosLidosDaResposta(dados: unknown): AtivosLidos {
  const raiz = objeto(dados) ?? {};
  const pessoa = objeto(raiz.pessoa) ?? {};
  const semAtivo = Array.isArray(pessoa.atribuicoes_sem_ativo) ? lista(pessoa.atribuicoes_sem_ativo) : null;
  const rhOculto = pessoa.rh_oculto === true;
  return {
    servico: ativosDe(raiz.servico),
    estrutura: ativosDe(raiz.estrutura),
    pessoa: ativosDe(pessoa.ativos),
    atribuicoesSemAtivo: rhOculto || semAtivo === null
      ? null
      : semAtivo.flatMap((a) => {
          const id = texto(a.id);
          return id
            ? [{ id, pessoaNome: texto(a.pessoa_nome), tipo: texto(a.tipo), descricao: texto(a.descricao), valor: numeroOuNull(a.valor), entrega: data(a.entrega), estado: texto(a.estado) }]
            : [];
        }),
    rhOculto,
    centrosCusto: centrosDe(raiz.centros_custo),
    truncado: raiz.truncado === true,
  };
}

/** A resposta de `rpc_ativos_opcoes`. */
export function opcoesDaResposta(dados: unknown): OpcoesAtivo {
  const raiz = objeto(dados) ?? {};
  return {
    equipamentos: lista(raiz.equipamentos).flatMap((e) => {
      const id = texto(e.id);
      return id ? [{ id, nome: texto(e.nome) ?? id, vidaAnos: numeroOuNull(e.vida_anos), vidaHoras: numeroOuNull(e.vida_horas) }] : [];
    }),
    centrosCusto: centrosDe(raiz.centros_custo),
  };
}
