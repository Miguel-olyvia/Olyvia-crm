/**
 * A validação do formulário de um ativo, antes de ir à base: as mesmas regras que a base aplica (e o mesmo campo a que cada erro
 * se refere), para mostrar o erro junto do campo. Puro: recebe o texto dos campos e devolve os erros por campo (chave do texto).
 */
import { hojeLocal } from "@/lib/hr/custoBase";
import { LIMITES_ATIVO, TIPOS_ATIVO_ESTRUTURA, TIPOS_ATIVO_PESSOA, type GrupoAtivo } from "./tipos";
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
}

export type ErrosAtivo = Partial<Record<CampoAtivo, string>>;

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

/** Uma data real, de 2000-01-01 a hoje + 7 dias (a faixa que a base aceita). */
export const dataValida = (d: string): boolean => {
  if (!DATA.test(d) || d < LIMITES_ATIVO.dataMinima || d > dataMaximaAtivo()) return false;
  const [a, m, dia] = d.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, dia));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === dia;
};

export const tiposDoGrupo = (grupo: GrupoAtivo): readonly string[] =>
  grupo === "pessoa" ? TIPOS_ATIVO_PESSOA : grupo === "estrutura" ? TIPOS_ATIVO_ESTRUTURA : [];

/** Os erros do formulário, por campo (chave do texto traduzido). Vazio = pode enviar. */
export function validarAtivo(c: CamposAtivo): ErrosAtivo {
  const erros: ErrosAtivo = {};
  const nome = c.nome.trim();
  if (nome.length < 1 || nome.length > LIMITES_ATIVO.nome || /\p{Cc}/u.test(nome)) erros.nome = "ativos.val.nome";
  if (c.grupo !== "servico" && !tiposDoGrupo(c.grupo).includes(c.tipo)) erros.tipo = "ativos.val.tipo";
  if (c.grupo === "servico" && c.catEquipamentoId === "") erros.modelo = "ativos.val.modelo";
  if (!dataValida(c.dataCompra)) erros.data = "ativos.val.data";

  const compra = numeroDoCampo(c.valorCompra);
  if (compra === null || Number.isNaN(compra) || aoCentimo(compra) <= 0 || compra > LIMITES_ATIVO.valorMaximo) erros.valorCompra = "ativos.val.valorCompra";
  const residual = numeroDoCampo(c.valorResidual);
  if (residual !== null && (Number.isNaN(residual) || residual < 0 || (compra !== null && !Number.isNaN(compra) && aoCentimo(residual) > aoCentimo(compra)))) {
    erros.residual = "ativos.val.residual";
  }

  const vida = numeroDoCampo(c.vidaMeses);
  if (vida === null) {
    if (c.grupo !== "servico") erros.vida = "ativos.val.vidaObrigatoria";
  } else if (!Number.isInteger(vida) || vida < LIMITES_ATIVO.vidaMinima || vida > LIMITES_ATIVO.vidaMaxima) {
    erros.vida = "ativos.val.vida";
  }

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

/** Os argumentos das RPCs de criar e alterar (sem `p_organization_id`, `p_grupo` nem `p_id`). Só depois de `validarAtivo` vazio. */
export function argumentosDoAtivo(c: CamposAtivo): Record<string, unknown> {
  const compra = numeroDoCampo(c.valorCompra) as number;
  const residual = numeroDoCampo(c.valorResidual);
  const manutencao = numeroDoCampo(c.manutencaoAno);
  const vida = numeroDoCampo(c.vidaMeses);
  return {
    p_nome: c.nome.trim(),
    p_tipo: c.grupo === "servico" ? null : c.tipo,
    p_cat_equipamento_id: c.grupo === "servico" ? c.catEquipamentoId : null,
    p_data_compra: c.dataCompra,
    p_valor_compra: aoCentimo(compra),
    p_valor_residual: residual === null ? 0 : aoCentimo(residual),
    p_vida_meses: vida,
    p_manutencao_ano: manutencao === null ? 0 : aoCentimo(manutencao),
    p_codigo: textoOuNull(c.codigo),
    p_num_serie: textoOuNull(c.numSerie),
    p_centro_custo_id: c.centroCustoId === "" ? null : c.centroCustoId,
    p_localizacao: textoOuNull(c.localizacao),
    p_notas: textoOuNull(c.notas),
  };
}
