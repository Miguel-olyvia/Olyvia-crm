/**
 * As contas do separador Custo da ficha (fluxo 11), todas puras e sem dados de lado nenhum.
 *
 * Custo total do mês = bruto + encargos da empresa + outros custos (o equipamento repartido por 36 meses).
 * Os valores avulsos (quilómetros, ajudas de custo) somam ao bruto; o equipamento nunca entra no bruto.
 * Os resultados em euros arredondam-se ao cêntimo; o valor da hora do banco de horas não se arredonda antes de multiplicar.
 * As taxas são de exemplo (a confirmar pela contabilidade).
 */
export const MESES_EQUIPAMENTO = 36;
/** Dois valores "AAAA-MM": o mês de contagem de um valor ou de uma linha do acumulado. */
export type MesIso = string;

export type ErroAvulso = "semAutorizacao" | "semDescricao" | "valorZero";
export type ErroAnulacao = "semAutorizacao" | "semMotivo";

const MOTIVO_MINIMO = 3;

/** Arredonda ao cêntimo (o EPSILON evita que 1,005 caia para 1,00). */
export function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export const valorDeKm = (km: number, valorPorKm: number): number => arredondar(km * valorPorKm);
export const valorDeAjudaDeCusto = (dias: number, valorDiario: number): number => arredondar(dias * valorDiario);
export const equipamentoPorMes = (valorDeCompra: number): number => arredondar(valorDeCompra / MESES_EQUIPAMENTO);

const indiceDoMes = (mes: MesIso): number => {
  const [ano, m] = mes.split("-").map(Number);
  return ano * 12 + (m - 1);
};

export const mesDaData = (dataIso: string): MesIso => dataIso.slice(0, 7);

export interface EquipamentoDatas {
  entrega: string;
  devolucao: string | null;
}

/** O equipamento pesa do mês da entrega, por 36 meses, e até ao mês da devolução (inclusive). */
export function equipamentoDoMes(e: EquipamentoDatas, mes: MesIso): boolean {
  const desde = indiceDoMes(mesDaData(e.entrega));
  const agora = indiceDoMes(mes);
  if (agora < desde || agora >= desde + MESES_EQUIPAMENTO) return false;
  return e.devolucao === null || agora <= indiceDoMes(mesDaData(e.devolucao));
}

export function validarAvulso(entrada: { descricao: string; valor: number; podeProcessar: boolean }): ErroAvulso | null {
  if (!entrada.podeProcessar) return "semAutorizacao";
  if (entrada.descricao.trim() === "") return "semDescricao";
  if (!Number.isFinite(entrada.valor) || entrada.valor <= 0) return "valorZero";
  return null;
}

export function anularAvulsoErro(motivo: string, podeProcessar: boolean): ErroAnulacao | null {
  if (!podeProcessar) return "semAutorizacao";
  return motivo.trim().length >= MOTIVO_MINIMO ? null : "semMotivo";
}

/** Uma data num mês já fechado conta no primeiro mês aberto; `dataReal` guarda a data original para a nota. */
export function mesDeContagem(dataIso: string, primeiroMesAberto: MesIso): { mes: MesIso; dataReal: string | null } {
  const mes = mesDaData(dataIso);
  return mes < primeiroMesAberto ? { mes: primeiroMesAberto, dataReal: dataIso } : { mes, dataReal: null };
}

/** A taxa da pessoa, quando tem exceção (regimes com taxa reduzida), senão a da empresa; em percentagem. */
export const taxaEfetiva = (taxaEmpresa: number, excecaoPessoa: number | null): number => excecaoPessoa ?? taxaEmpresa;

export function encargosDaEmpresa(parteSujeita: number, taxaPct: number, seguroPct: number): number {
  return arredondar((parteSujeita * (taxaPct + seguroPct)) / 100);
}

export function custoTotalDoMes(bruto: number | null, encargos: number, outrosCustos: number): number | null {
  return bruto === null ? null : arredondar(bruto + encargos + outrosCustos);
}

/** Pessoa que não recebe os subsídios repartidos pelos meses: salário base x 14 / 12 + encargos. */
export function custoRepartido14em12(salarioBase: number | null, encargos: number): number | null {
  return salarioBase === null ? null : arredondar((salarioBase * 14) / 12 + encargos);
}

/** Horas a favor x valor da hora (salário / horas previstas, sem arredondar). Só informativo. */
export function saldoBancoEmEuros(horas: number, salarioMes: number | null, horasPrevistas: number): number | null {
  if (salarioMes === null || horasPrevistas <= 0) return null;
  return arredondar(horas * (salarioMes / horasPrevistas));
}

export function custoPorHora(custoTotal: number | null, horas: number): number | null {
  return custoTotal === null || horas <= 0 ? null : arredondar(custoTotal / horas);
}

/** Soma dos meses; um mês sem valor não conta. */
export const somarMeses = (meses: ReadonlyArray<number | null>): number =>
  arredondar(meses.reduce<number>((soma, m) => soma + (m ?? 0), 0));

/** Os dias úteis (segunda a sexta) do mês x horas da semana / 5. */
export function horasPrevistasDoMes(horasSemanais: number, mes: MesIso): number {
  const [ano, m] = mes.split("-").map(Number);
  const dias = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  let uteis = 0;
  for (let d = 1; d <= dias; d += 1) {
    const dia = new Date(Date.UTC(ano, m - 1, d)).getUTCDay();
    if (dia !== 0 && dia !== 6) uteis += 1;
  }
  return arredondar((uteis * horasSemanais) / 5);
}

/**
 * O salário de um mês a partir da retribuição em vigor: anual conta por 14 pagamentos; à hora, pelas horas do mês;
 * ao dia, por dias de 8 horas; à semana, 52 semanas por 12 meses.
 */
export function salarioMensal(
  retribuicao: { valor_base: number; periodicidade: "hora" | "diaria" | "semanal" | "mensal" | "anual" } | null,
  horasPrevistas: number,
): number | null {
  if (!retribuicao) return null;
  const { valor_base: valor, periodicidade } = retribuicao;
  if (periodicidade === "anual") return arredondar(valor / 14);
  if (periodicidade === "hora") return arredondar(valor * horasPrevistas);
  if (periodicidade === "diaria") return arredondar(valor * (horasPrevistas / 8));
  if (periodicidade === "semanal") return arredondar((valor * 52) / 12);
  return valor;
}
