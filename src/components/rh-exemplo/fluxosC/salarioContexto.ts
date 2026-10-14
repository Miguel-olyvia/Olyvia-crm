/**
 * Liga os dados de exemplo (fichas + store da frente C) às funções puras do processamento salarial.
 * Só lê; nada aqui escreve em store.
 */
import { useMemo } from "react";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import { useFluxosC } from "./lojaFluxosC";
import type { EstadoFluxosC } from "./dadosFluxosC";
import {
  calcularSalario, diasUteisDoMes, type EntradaSalario, type ResultadoSalario,
} from "./salarioRegras";

const HORAS_SEMANAIS_OMISSAO = 40;

function ultimoDiaDoMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, "0")}`;
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

export function entradaSalarioDaFicha(ficha: FichaRh, c: EstadoFluxosC, ano: number, mes: number): EntradaSalario {
  const chaveMes = `${ano}-${String(mes).padStart(2, "0")}`;
  const diasUteis = diasUteisDoMes(ano, mes);
  const horasDia = horasSemanaisDaFicha(ficha) / 5;
  const faltaMin = c.faltasMin[ficha.pessoa.id] ?? 0;
  const ret = retribuicaoDoMes(ficha, ano, mes);
  const diasDeFalta = horasDia > 0 ? Math.ceil(faltaMin / (horasDia * 60)) : 0;
  return {
    mes,
    retribuicao: ret
      ? { valor: ret.valor_base, periodicidade: ret.periodicidade, duodecimosPct: ret.duodecimos_pct, subsidioAlimentacaoDia: ret.subsidio_alimentacao }
      : null,
    diasUteisMes: diasUteis,
    horasPlaneadasMes: diasUteis * horasDia,
    minutosEmFalta: faltaMin,
    diasElegiveisSubsidio: Math.max(0, diasUteis - diasDeFalta),
    horasExtra: c.horasExtra.filter((h) => h.pessoaId === ficha.pessoa.id && h.data.startsWith(chaveMes)),
    regrasHE: c.regras,
    subsidioFerias: 0,
    pontuais: c.pontuais.filter((p) => p.pessoaId === ficha.pessoa.id && p.mes === chaveMes),
  };
}

export interface LinhaCalculoPessoa {
  pessoaId: string;
  pessoaNome: string;
  entrada: EntradaSalario;
  resultado: ResultadoSalario;
}

/** O cálculo vivo (sem fecho) de cada pessoa activa, no mês. */
export function useCalculoDoMes(ano: number, mes: number): LinhaCalculoPessoa[] {
  const fichas = useEstadoRh((e) => e.fichas);
  const ordem = useEstadoRh((e) => e.ordem);
  const c = useFluxosC((e) => e);
  return useMemo(
    () =>
      ordem
        .map((id) => fichas[id])
        .filter((f) => f && f.pessoa.estado_registo === "activo")
        .map((f) => {
          const entrada = entradaSalarioDaFicha(f, c, ano, mes);
          return { pessoaId: f.pessoa.id, pessoaNome: f.pessoa.nome_completo, entrada, resultado: calcularSalario(entrada) };
        }),
    [fichas, ordem, c, ano, mes],
  );
}

/** Valor da hora da pessoa no mês, para o pagamento das horas extra. */
export function valorDaHoraDaFicha(ficha: FichaRh, c: EstadoFluxosC, ano: number, mes: number): number | null {
  return calcularSalario(entradaSalarioDaFicha(ficha, c, ano, mes)).valorHora;
}
