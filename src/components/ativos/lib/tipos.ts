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
 * Limites da base. A data (de compra e de desativação) vai de 2000-01-01 a hoje + 7 dias (ATV07 e ATV16; ver `dataMaximaAtivo()` em
 * `validarAtivo.ts`), e os euros chegam a 9 999 999 999,99.
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

/** Comprado (valor de compra, amortiza-se) ou alugado (renda mensal e datas do contrato, não se amortiza). */
export const FORMAS_AQUISICAO = ["comprado", "alugado"] as const;
export type FormaAquisicao = (typeof FORMAS_AQUISICAO)[number];

/** Como se definiu a vida útil de um comprado: meses de pagamento, a do equipamento do catálogo, ou escrita à mão. */
export const ORIGENS_VIDA = ["pagamento", "catalogo", "manual"] as const;
export type OrigemVida = (typeof ORIGENS_VIDA)[number];

/**
 * Uma vez que o ativo esteve entregue a uma pessoa (uma linha de `pessoas_equipamentos`). `contaDesde` é o que a base calcula: a
 * entrega, ou o dia seguinte se outra ocupação do mesmo ativo foi devolvida nesse dia. O nome só vem de `rpc_ativo_ler` e só com
 * `hr.pessoas.retribuicao.view`; a lista traz o `pessoaId` (também só com essa permissão).
 */
export interface OcupacaoDoAtivo {
  pessoaEquipamentoId: string;
  pessoaId: string | null;
  pessoaNome: string | null;
  estado: "atribuido" | "devolvido" | null;
  entrega: string;
  devolucao: string | null;
  contaDesde: string | null;
}

/** O armazém do Stock a que o ativo está ligado; só vem com `inventory.view`. */
export interface ArmazemDoAtivo {
  id: string;
  nome: string | null;
  /** O armazém foi apagado no Stock (o ativo fica). */
  apagado: boolean;
}

/** Um ativo, como o ecrã o usa (valores já em número, datas AAAA-MM-DD). Um alugado não tem compra, residual nem vida. */
export interface Ativo {
  id: string;
  grupo: GrupoAtivo;
  tipo: string | null;
  nome: string;
  codigo: string | null;
  numSerie: string | null;
  catEquipamentoId: string | null;
  /** `null` no alugado. */
  dataCompra: string | null;
  /** `null` no alugado. */
  valorCompra: number | null;
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
  /** Só nos de pessoa, e só com `hr.pessoas.retribuicao.view`; sem ela, `null`. Também `null` se a pessoa já foi apagada. */
  atribuicao: AtribuicaoDoAtivo | null;
  /**
   * Está atribuído a uma pessoa (chave `ligado` da base). Vem sempre, mesmo sem `hr.pessoas.retribuicao.view`: não diz a quem, só
   * que está atribuído. É o que decide «Sem pessoa ligada» e se se pode desativar; `atribuicao` pode ser `null` com `ligado` verdadeiro.
   */
  ligado: boolean;
  forma: FormaAquisicao;
  /** Só no alugado. */
  rendaMensal: number | null;
  inicioAluguer: string | null;
  /** `null` num alugado = sem fim (um arrendamento que se renova). */
  fimAluguer: string | null;
  /** Só no comprado. */
  vidaOrigem: OrigemVida | null;
  /** `null` sem `inventory.view` mesmo que o ativo esteja ligado a um armazém (ver `armazemLigado`). */
  armazem: ArmazemDoAtivo | null;
  armazemLigado: boolean;
  /** Todas as vezes que esteve entregue (só no grupo Pessoas). */
  ocupacoes: OcupacaoDoAtivo[];
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
  /** Sem `hr.pessoas.retribuicao.view` não há nomes de pessoas. */
  rhOculto: boolean;
  /** Tem `inventory.view`: vê os armazéns e pode ligar um. */
  podeVerArmazens: boolean;
  centrosCusto: OpcaoCentroCusto[];
  /** A lista foi cortada nos 2000 ativos que a base devolve. */
  truncado: boolean;
}

export interface OpcaoArmazem {
  id: string;
  nome: string;
  codigo: string | null;
}

export interface OpcoesAtivo {
  equipamentos: OpcaoEquipamento[];
  centrosCusto: OpcaoCentroCusto[];
  /** Vazio sem `inventory.view`. */
  armazens: OpcaoArmazem[];
  podeVerArmazens: boolean;
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

function ocupacaoDaLinha(o: Linha): OcupacaoDoAtivo | null {
  const id = texto(o.pessoa_equipamento_id);
  const entrega = data(o.entrega);
  if (!id || !entrega) return null;
  return {
    pessoaEquipamentoId: id,
    pessoaId: texto(o.pessoa_id),
    pessoaNome: texto(o.pessoa_nome),
    estado: o.estado === "atribuido" || o.estado === "devolvido" ? o.estado : null,
    entrega,
    devolucao: data(o.devolucao),
    contaDesde: data(o.conta_desde),
  };
}

/** As ocupações de um ativo (de `rpc_ativos_listar` ou `rpc_ativo_ler`), por ordem de entrega; uma sem id ou sem entrega fica de fora. */
export const ocupacoesDaResposta = (v: unknown): OcupacaoDoAtivo[] => lista(v).flatMap((o) => ocupacaoDaLinha(o) ?? []);

function armazemDaLinha(l: Linha): ArmazemDoAtivo | null {
  const id = texto(l.warehouse_id);
  return id ? { id, nome: texto(l.warehouse_nome), apagado: l.warehouse_apagado === true } : null;
}

/** Uma linha de `rpc_ativos_listar` como `Ativo`; `null` se não tiver id, grupo ou os dados da conta (compra ou renda) legíveis. */
export function ativoDaLinha(l: Linha): Ativo | null {
  const id = texto(l.id);
  const grupo = l.grupo;
  const forma: FormaAquisicao = l.forma_aquisicao === "alugado" ? "alugado" : "comprado";
  const dataCompra = data(l.data_compra);
  const inicioAluguer = data(l.inicio_aluguer);
  if (!id || (grupo !== "servico" && grupo !== "estrutura" && grupo !== "pessoa")) return null;
  // Um comprado sem data de compra, ou um alugado sem início, não tem conta legível.
  if (forma === "comprado" ? !dataCompra : !inicioAluguer) return null;
  const origem = l.vida_origem;
  return {
    id,
    grupo,
    tipo: texto(l.tipo),
    nome: texto(l.nome) ?? "",
    codigo: texto(l.codigo),
    numSerie: texto(l.num_serie),
    catEquipamentoId: texto(l.cat_equipamento_id),
    dataCompra,
    valorCompra: numeroOuNull(l.valor_compra),
    valorResidual: numero(l.valor_residual),
    forma,
    rendaMensal: numeroOuNull(l.renda_mensal),
    inicioAluguer,
    fimAluguer: data(l.fim_aluguer),
    vidaOrigem: origem === "pagamento" || origem === "catalogo" || origem === "manual" ? origem : null,
    armazem: armazemDaLinha(l),
    armazemLigado: l.armazem_ligado === true,
    ocupacoes: ocupacoesDaResposta(l.ocupacoes),
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
    ligado: l.ligado === true,
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
  return {
    servico: ativosDe(raiz.servico),
    estrutura: ativosDe(raiz.estrutura),
    pessoa: ativosDe(pessoa.ativos),
    rhOculto: pessoa.rh_oculto === true,
    podeVerArmazens: raiz.pode_ver_armazens === true,
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
    armazens: lista(raiz.armazens).flatMap((w) => {
      const id = texto(w.id);
      return id ? [{ id, nome: texto(w.nome) ?? id, codigo: texto(w.codigo) }] : [];
    }),
    podeVerArmazens: raiz.pode_ver_armazens === true,
  };
}

/** Uma linha de `rpc_ativo_ler`: o ativo (as ocupações já com o nome, quando o RH o deixa ver). */
export function ativoLidoDaResposta(dados: unknown): Ativo | null {
  const raiz = objeto(dados);
  if (!raiz) return null;
  const base = ativoDaLinha(raiz);
  if (!base) return null;
  const atribuicao = atribuicaoDaLinha(raiz.atribuicao);
  return { ...base, atribuicao: atribuicao ?? base.atribuicao, ligado: raiz.ligado === true, ocupacoes: ocupacoesDaResposta(raiz.ocupacoes) };
}
