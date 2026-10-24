/**
 * O mes de uma pessoa, lido dos stores em memoria (ficha, gestao, horarios, horas extra e banco). Recalcula quando
 * qualquer um muda: confirmar uma hora extra, marcar uma falta ou corrigir uma picagem mexe logo no dia.
 */
import { useMemo } from "react";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { saldoDoBanco } from "@/components/rh-exemplo/fluxosC/bancoHorasRegras";
import { useFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { MINIMO_SUBSIDIO_OMISSAO_MIN } from "@/components/rh-exemplo/fluxosC/salarioEntrada";
import { entradaMesDaFicha } from "./fonteMes";
import { montarMes, type DiaCalendario } from "./montarMes";
import { totaisDoMes, type TotaisMes } from "./totaisMes";

export interface MesDaPessoa {
  dias: DiaCalendario[];
  totais: TotaisMes;
}

export function useMesDaPessoa(pessoaId: string, ano: number, mes: number): MesDaPessoa | null {
  const ficha = useEstadoRh((e) => e.fichas[pessoaId] ?? null);
  const tiposAusencia = useEstadoRh((e) => e.tiposAusencia);
  const locais = useEstadoRh((e) => e.locais);
  const picagens = useGestao((g) => g.picagens);
  const faltas = useGestao((g) => g.faltas);
  const minimo = useGestao((g) => g.minutosMinimosSubsidio);
  const horarios = useFluxosB((e) => e.horarios);
  const horasExtra = useFluxosC((e) => e.horasExtra);
  const banco = useFluxosC((e) => e.banco);
  const podeHE = useFluxosC((e) => e.podeHE);

  return useMemo(() => {
    if (!ficha) return null;
    const dias = montarMes(
      entradaMesDaFicha(ficha, ano, mes, {
        gestao: { picagens, faltas }, fluxosB: { horarios }, fluxosC: { horasExtra, banco, podeHE }, tiposAusencia, locais, hoje: hojeIso(),
      }),
    );
    const totais = totaisDoMes(dias, {
      minimoSubsidioMin: minimo ?? MINIMO_SUBSIDIO_OMISSAO_MIN,
      bancoSaldoMin: saldoDoBanco(banco, pessoaId),
    });
    return { dias, totais };
  }, [ficha, ano, mes, picagens, faltas, minimo, horarios, horasExtra, banco, podeHE, tiposAusencia, locais, pessoaId]);
}
