/**
 * A validação do formulário de um ativo, antes de ir à base: as mesmas regras que a base aplica (e o mesmo campo a que cada erro
 * se refere), para mostrar o erro junto do campo. Puro: recebe o texto dos campos e devolve os erros por campo (chave do texto).
 * Um ativo é COMPRADO (valor, data de compra e vida útil) ou ALUGADO (renda mensal e datas do contrato, sem compra nem vida). O grupo
 * Serviço nunca se aluga: o formulário trata-o sempre como comprado.
 */
import { hojeLocal } from "@/lib/hr/custoBase";
import { LIMITES_ATIVO, TIPOS_ATIVO_ESTRUTURA, TIPOS_ATIVO_PESSOA, type FormaAquisicao, type GrupoAtivo, type OrigemVida } from "./tipos";
import type { CampoAtivo } from "./errosAtivo";

export interface CamposAtivo {
  grupo: GrupoAtivo;
  nome: string;
  tipo: string;
  catEquipamentoId: string;
  codigo: string;
  numSerie: string;
  dataCompra: string;
  valorCompra: string;
  valorResidual: string;
  vidaMeses: string;
  manutencaoAno: string;
  centroCustoId: string;
  localizacao: string;
  notas: string;
  forma: FormaAquisicao;
  /** Como se define a vida de um comprado: meses de pagamento, a do equipamento do catálogo, ou escrita à mão. */
  vidaOrigem: OrigemVida;
  /** A vida do equipamento do catálogo escolhido, em meses (anos x 12); `null` se o equipamento não tem vida em anos. */
  vidaCatalogoMeses: number | null;
  rendaMensal: string;
  inicioAluguer: string;
  /** Vazio = sem fim. */
  fimAluguer: string;
  /** O armazém do Stock (só instalações de estrutura). Vazio = nenhum. */
  armazemId: string;
}

export type ErrosAtivo = Partial<Record<CampoAtivo, string>>;

/** O limite do início do aluguer (um contrato que ainda vai começar, como a base: hoje + 366 dias) e do fim (2100-01-01). */
const FIM_MAXIMO_ALUGUER = "2100-01-01";

/**
 * «1.234,50», «1234,50», «1 234,50» ou «1234.5» -> número; vazio -> `null`; ilegível -> `NaN`. O ponto só é separador de milhares
 * quando vem em grupos de três algarismos («1.234», «1.234.567,89»); «0.125» e «1234.5» são decimais.
 */
export function numeroDoCampo(texto: string): number | null {
  const semEspacos = texto.replace(/\p{Zs}/gu, "").trim();
  if (semEspacos === "") return null;
  const comMilhares = /^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(semEspacos);
  const limpo = comMilhares ? semEspacos.replace(/\./g, "").replace(",", ".") : semEspacos.replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(limpo) ? Number(limpo) : Number.NaN;
}

/** Um valor como se escreve no campo: «1234,50» (vírgula e dois decimais), «1200» se for inteiro. */
export const numeroTexto = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const aoCentimo = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** O último dia aceite para a data de compra e a de desativação: hoje + 7 dias (a base recusa mais com ATV07 e ATV16). */
export function dataMaximaAtivo(hoje: Date = new Date()): string {
  return hojeLocal(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 7));
}

/** O último dia aceite para o início de um aluguer: hoje + 366 dias (ATV21). */
export function inicioMaximoAluguer(hoje: Date = new Date()): string {
  return hojeLocal(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 366));
}

/** O fim de um aluguer vai até 2100-01-01. */
export const fimMaximoAluguer = (): string => FIM_MAXIMO_ALUGUER;

/** Uma data que existe no calendário (AAAA-MM-DD). */
function dataReal(d: string): boolean {
  if (!DATA.test(d)) return false;
  const [a, m, dia] = d.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, dia));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === dia;
}

/** Uma data real, de 2000-01-01 a hoje + 7 dias (a faixa que a base aceita). */
export const dataValida = (d: string): boolean => dataReal(d) && d >= LIMITES_ATIVO.dataMinima && d <= dataMaximaAtivo();

export const tiposDoGrupo = (grupo: GrupoAtivo): readonly string[] =>
  grupo === "pessoa" ? TIPOS_ATIVO_PESSOA : grupo === "estrutura" ? TIPOS_ATIVO_ESTRUTURA : [];

/** O ativo é alugado: o que o formulário escolheu, salvo no grupo Serviço (nunca se aluga). */
export const eAlugado = (c: Pick<CamposAtivo, "forma" | "grupo">): boolean => c.forma === "alugado" && c.grupo !== "servico";

/** As opções de vida que o grupo oferece: o serviço só tem a do catálogo ou à mão; a estrutura não tem catálogo. */
export function origensDeVidaDoGrupo(grupo: GrupoAtivo): readonly OrigemVida[] {
  if (grupo === "servico") return ["catalogo", "manual"];
  if (grupo === "estrutura") return ["pagamento", "manual"];
  return ["pagamento", "catalogo", "manual"];
}

/** A origem efetiva: uma que o grupo não oferece conta como «à mão» (ou como a do catálogo, no serviço). */
function origemEfetiva(c: Pick<CamposAtivo, "grupo" | "vidaOrigem">): OrigemVida {
  if (origensDeVidaDoGrupo(c.grupo).includes(c.vidaOrigem)) return c.vidaOrigem;
  return c.grupo === "servico" ? "catalogo" : "manual";
}

function validarCompra(c: CamposAtivo, erros: ErrosAtivo): void {
  if (!dataValida(c.dataCompra)) erros.data = "ativos.val.data";
  const compra = numeroDoCampo(c.valorCompra);
  if (compra === null || Number.isNaN(compra) || aoCentimo(compra) <= 0 || compra > LIMITES_ATIVO.valorMaximo) erros.valorCompra = "ativos.val.valorCompra";
  const residual = numeroDoCampo(c.valorResidual);
  if (residual !== null && (Number.isNaN(residual) || residual < 0 || (compra !== null && !Number.isNaN(compra) && aoCentimo(residual) > aoCentimo(compra)))) {
    erros.residual = "ativos.val.residual";
  }
  const origem = origemEfetiva(c);
  if (origem === "catalogo") {
    // O serviço usa a vida do modelo ao vivo (não se escreve). A pessoa copia-a do equipamento escolhido, que tem de ter vida em anos.
    if (c.grupo === "pessoa") {
      if (c.catEquipamentoId === "") erros.modelo = "ativos.val.modelo";
      else if (c.vidaCatalogoMeses === null) erros.vida = "ativos.val.vidaCatalogo";
    }
    return;
  }
  const vida = numeroDoCampo(c.vidaMeses);
  if (vida === null) {
    if (c.grupo !== "servico") erros.vida = "ativos.val.vidaObrigatoria";
  } else if (!Number.isInteger(vida) || vida < LIMITES_ATIVO.vidaMinima || vida > LIMITES_ATIVO.vidaMaxima) {
    erros.vida = "ativos.val.vida";
  }
}

function validarAluguer(c: CamposAtivo, erros: ErrosAtivo): void {
  const renda = numeroDoCampo(c.rendaMensal);
  if (renda === null || Number.isNaN(renda) || aoCentimo(renda) <= 0 || renda > LIMITES_ATIVO.valorMaximo) erros.renda = "ativos.val.renda";
  const inicioOk = dataReal(c.inicioAluguer) && c.inicioAluguer >= LIMITES_ATIVO.dataMinima && c.inicioAluguer <= inicioMaximoAluguer();
  if (!inicioOk) erros.inicioAluguer = "ativos.val.inicioAluguer";
  if (c.fimAluguer.trim() !== "") {
    const fimOk = dataReal(c.fimAluguer) && c.fimAluguer <= FIM_MAXIMO_ALUGUER && (!dataReal(c.inicioAluguer) || c.fimAluguer >= c.inicioAluguer);
    if (!fimOk) erros.fimAluguer = "ativos.val.fimAluguer";
  }
}

/** Os erros do formulário, por campo (chave do texto traduzido). Vazio = pode enviar. */
export function validarAtivo(c: CamposAtivo): ErrosAtivo {
  const erros: ErrosAtivo = {};
  const nome = c.nome.trim();
  if (nome.length < 1 || nome.length > LIMITES_ATIVO.nome || /\p{Cc}/u.test(nome)) erros.nome = "ativos.val.nome";
  if (c.grupo !== "servico" && !tiposDoGrupo(c.grupo).includes(c.tipo)) erros.tipo = "ativos.val.tipo";
  if (c.grupo === "servico" && c.catEquipamentoId === "") erros.modelo = "ativos.val.modelo";

  if (eAlugado(c)) validarAluguer(c, erros);
  else validarCompra(c, erros);

  const manutencao = numeroDoCampo(c.manutencaoAno);
  if (manutencao !== null && (Number.isNaN(manutencao) || manutencao < 0 || manutencao > LIMITES_ATIVO.valorMaximo)) erros.manutencao = "ativos.val.manutencao";

  if (c.codigo.trim().length > LIMITES_ATIVO.codigo) erros.codigo = "ativos.val.codigo";
  if (c.numSerie.trim().length > LIMITES_ATIVO.numSerie) erros.numSerie = "ativos.val.numSerie";
  if (c.localizacao.trim().length > LIMITES_ATIVO.localizacao) erros.localizacao = "ativos.val.localizacao";
  if (c.notas.trim().length > LIMITES_ATIVO.notas) erros.notas = "ativos.val.notas";
  return erros;
}

/** Texto vazio vira `null`, como a base normaliza. */
export const textoOuNull = (t: string): string | null => (t.trim() === "" ? null : t.trim());

/** Os campos da compra e da vida que seguem para a base num comprado. */
function camposDoComprado(c: CamposAtivo): Record<string, unknown> {
  const compra = numeroDoCampo(c.valorCompra) as number;
  const residual = numeroDoCampo(c.valorResidual);
  const origem = origemEfetiva(c);
  const escrita = numeroDoCampo(c.vidaMeses);
  let vida: number | null;
  let vidaOrigem: OrigemVida | null;
  if (origem === "catalogo") {
    // Serviço: a vida fica por preencher e a base usa a do modelo. Pessoa: a do equipamento escolhido, copiada.
    vida = c.grupo === "servico" ? null : c.vidaCatalogoMeses;
    vidaOrigem = "catalogo";
  } else {
    vida = escrita;
    // Um serviço sem vida escrita não tem origem (usa a do modelo, como antes).
    vidaOrigem = c.grupo === "servico" && vida === null ? null : origem;
  }
  return {
    p_data_compra: c.dataCompra,
    p_valor_compra: aoCentimo(compra),
    p_valor_residual: residual === null ? 0 : aoCentimo(residual),
    p_vida_meses: vida,
    p_vida_origem: vidaOrigem,
    p_renda_mensal: null,
    p_inicio_aluguer: null,
    p_fim_aluguer: null,
    p_forma_aquisicao: "comprado",
  };
}

/** Os campos do aluguer que seguem para a base num alugado (sem compra, residual nem vida). */
function camposDoAlugado(c: CamposAtivo): Record<string, unknown> {
  return {
    p_data_compra: null,
    p_valor_compra: null,
    p_valor_residual: null,
    p_vida_meses: null,
    p_vida_origem: null,
    p_renda_mensal: aoCentimo(numeroDoCampo(c.rendaMensal) as number),
    p_inicio_aluguer: c.inicioAluguer,
    p_fim_aluguer: c.fimAluguer.trim() === "" ? null : c.fimAluguer,
    p_forma_aquisicao: "alugado",
  };
}

/**
 * Os argumentos das RPCs de criar e alterar (sem `p_organization_id`, `p_grupo` nem `p_id`). Só depois de `validarAtivo` vazio.
 * Mandam sempre a forma, e os campos da outra forma vão a `null` explícito.
 */
export function argumentosDoAtivo(c: CamposAtivo): Record<string, unknown> {
  const manutencao = numeroDoCampo(c.manutencaoAno);
  const alugado = eAlugado(c);
  // O equipamento do catálogo: obrigatório no serviço; na pessoa só quando a vida vem dele.
  const usaCatalogo = c.grupo === "servico" || (c.grupo === "pessoa" && !alugado && origemEfetiva(c) === "catalogo");
  return {
    p_nome: c.nome.trim(),
    p_tipo: c.grupo === "servico" ? null : c.tipo,
    p_cat_equipamento_id: usaCatalogo ? c.catEquipamentoId : null,
    ...(alugado ? camposDoAlugado(c) : camposDoComprado(c)),
    p_manutencao_ano: manutencao === null ? 0 : aoCentimo(manutencao),
    p_codigo: textoOuNull(c.codigo),
    p_num_serie: textoOuNull(c.numSerie),
    p_centro_custo_id: c.centroCustoId === "" ? null : c.centroCustoId,
    p_localizacao: textoOuNull(c.localizacao),
    p_notas: textoOuNull(c.notas),
    p_warehouse_id: c.grupo === "estrutura" && c.tipo === "instalacoes" && c.armazemId !== "" ? c.armazemId : null,
  };
}
