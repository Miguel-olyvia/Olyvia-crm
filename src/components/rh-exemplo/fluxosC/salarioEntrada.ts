/**
 * A entrada do calculo do salario de UMA pessoa num mes, lida dos dados de exemplo. Sem React (nao e um hook):
 * le os stores directamente, por isso serve o ecra, o fecho do mes e os testes.
 *
 * Os numeros da assiduidade vem do MESMO calendario do mes que a ficha mostra (`montarMes` + `totaisDoMes`):
 *  - horas planeadas = o que o horario previa no mes (valor da hora);
 *  - desconto = faltas marcadas, pelas regras das faltas (justificada e paga nao desconta; atraso dentro da
 *    tolerancia nao desconta; pendente de documento desconta a titulo provisorio);
 *  - subsidio de alimentacao = dias com o minimo de minutos feitos, o da organizacao;
 *  - horas extra = as da pessoa nesse mes (so as confirmadas pagam).
 */
import { montarMes } from "@/components/rh-exemplo/calendarioPessoa/montarMes";
import { entradaMesDaFicha } from "@/components/rh-exemplo/calendarioPessoa/fonteMes";
import { totaisDoMes } from "@/components/rh-exemplo/calendarioPessoa/totaisMes";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import { lerFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { lerGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { descontoDaFalta } from "@/components/rh-exemplo/lib/faltasB";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import type { EstadoFluxosC } from "./dadosFluxosC";
import { calcularSalario, diasUteisDoMes, type EntradaSalario, type ResultadoSalario } from "./salarioRegras";
import { saldoDoBanco } from "./bancoHorasRegras";

const HORAS_SEMANAIS_OMISSAO = 40;
export const MINIMO_SUBSIDIO_OMISSAO_MIN = 240;

const doisDigitos = (n: number): string => String(n).padStart(2, "0");

function ultimoDiaDoMes(ano: number, mes: number): string {
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(new Date(Date.UTC(ano, mes, 0)).getUTCDate())}`;
}

/** Horas por semana do contrato em vigor (o equivalente semanal, ou 40 h por omissão). */
export function horasSemanaisDaFicha(ficha: FichaRh): number {
  const v = ficha.horasVersoes.find((x) => x.valido_ate === null) ?? ficha.horasVersoes[0];
  if (!v) return HORAS_SEMANAIS_OMISSAO;
  return v.horas_semanais_equivalentes ?? (v.horas_frequencia === "semanal" ? v.horas_periodo : HORAS_SEMANAIS_OMISSAO);
}

/** A versão de retribuição em vigor no fim do mês (a mais recente que já começou). */
export function retribuicaoDoMes(ficha: FichaRh, ano: number, mes: number) {
  const fim = ultimoDiaDoMes(ano, mes);
  return [...ficha.retribuicoes].filter((r) => r.valido_de <= fim).sort((a, b) => b.valido_de.localeCompare(a.valido_de))[0] ?? null;
}

/** Quantos dias do mes tem contrato em vigor (0 = nao tem nenhum). */
export function diasDeContratoNoMes(ficha: FichaRh, ano: number, mes: number): { dias: number; doMes: number } {
  const primeiro = `${ano}-${doisDigitos(mes)}-01`;
  const ultimo = ultimoDiaDoMes(ano, mes);
  const de = ficha.pessoa.data_admissao && ficha.pessoa.data_admissao > primeiro ? ficha.pessoa.data_admissao : primeiro;
  const ate = ficha.pessoa.data_saida && ficha.pessoa.data_saida < ultimo ? ficha.pessoa.data_saida : ultimo;
  const doMes = Number(ultimo.slice(8, 10));
  if (de > ate) return { dias: 0, doMes };
  return { dias: Number(ate.slice(8, 10)) - Number(de.slice(8, 10)) + 1, doMes };
}

export function entradaSalarioDaFicha(ficha: FichaRh, c: EstadoFluxosC, ano: number, mes: number): EntradaSalario {
  const chaveMes = `${ano}-${doisDigitos(mes)}`;
  const id = ficha.pessoa.id;
  const gestao = lerGestao();
  const entradaMes = entradaMesDaFicha(ficha, ano, mes, {
    gestao, fluxosB: lerFluxosB(), fluxosC: c, tiposAusencia: lerEstado().tiposAusencia, locais: lerEstado().locais, hoje: hojeIso(),
  });
  const dias = montarMes(entradaMes);
  // O valor da hora usa as horas do mes INTEIRO, mesmo que o contrato comece ou acabe a meio (a base paga-se a dias).
  const horasPlaneadasMin = totaisDoMes(montarMes({ ...entradaMes, contrato: null }), { minimoSubsidioMin: 0 }).horasPlaneadasMin;
  const totais = totaisDoMes(dias, {
    minimoSubsidioMin: gestao.minutosMinimosSubsidio ?? MINIMO_SUBSIDIO_OMISSAO_MIN,
    bancoSaldoMin: saldoDoBanco(c.banco, id),
  });
  const minutosEmFalta = dias
    .flatMap((d) => d.faltas)
    .reduce((s, f) => s + descontoDaFalta(f, 0).minutos, 0);
  const ret = retribuicaoDoMes(ficha, ano, mes);
  return {
    mes,
    retribuicao: ret
      ? { valor: ret.valor_base, periodicidade: ret.periodicidade, duodecimosPct: ret.duodecimos_pct, subsidioAlimentacaoDia: ret.subsidio_alimentacao }
      : null,
    diasUteisMes: diasUteisDoMes(ano, mes),
    horasPlaneadasMes: horasPlaneadasMin / 60,
    minutosEmFalta,
    diasElegiveisSubsidio: totais.diasElegiveisSubsidio,
    horasExtra: c.horasExtra.filter((h) => h.pessoaId === id && h.data.startsWith(chaveMes)),
    regrasHE: c.regras,
    subsidioFerias: 0,
    pontuais: c.pontuais.filter((p) => p.pessoaId === id && p.mes === chaveMes),
    diasDeContrato: diasDeContratoNoMes(ficha, ano, mes),
  };
}

export interface LinhaCalculoPessoa {
  pessoaId: string;
  pessoaNome: string;
  entrada: EntradaSalario;
  resultado: ResultadoSalario;
}

/** Quem entra no calculo do mes: quem tem pelo menos um dia de contrato nesse mes (inclui quem saiu a meio). */
export function fichasDoCalculo(fichas: Record<string, FichaRh>, ordem: readonly string[], ano: number, mes: number): FichaRh[] {
  return ordem
    .map((id) => fichas[id])
    .filter((f) => f && diasDeContratoNoMes(f, ano, mes).dias > 0);
}

/** O calculo vivo (sem fecho) de cada pessoa, no mes. */
export function calcularMes(fichas: FichaRh[], c: EstadoFluxosC, ano: number, mes: number): LinhaCalculoPessoa[] {
  return fichas.map((f) => {
    const entrada = entradaSalarioDaFicha(f, c, ano, mes);
    return { pessoaId: f.pessoa.id, pessoaNome: f.pessoa.nome_completo, entrada, resultado: calcularSalario(entrada) };
  });
}
