/**
 * O mes de uma pessoa, dia a dia. Picagens, horas realizadas, faltas e ausencias vem da assiduidade REAL da pessoa
 * (o hook que a aba Assiduidade ja carregou para esta janela, entregue por quem chama para nao ir duas vezes a base),
 * tal como o horario planeado (`pessoas_horario_planeado`, que vem na mesma leitura). O minimo de minutos do subsidio
 * e a regra real da organizacao (`hr_regras_subsidio_alimentacao`). Continuam a vir dos stores de exemplo, por ainda
 * nao terem tabela, so as horas extra e o banco de horas.
 */
import { useMemo } from "react";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { useRegrasSubsidioAlimentacao } from "@/components/rh-exemplo/hooks/useRegrasSubsidioAlimentacao";
import { horarioPessoaDeLinhas } from "@/components/rh-exemplo/lib/horarioReal";
import { saldoDoBanco } from "@/components/rh-exemplo/fluxosC/bancoHorasRegras";
import { useFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import type { LocalTrabalho } from "@/components/rh-exemplo/tipos";
import type { AusenciaTipo } from "@/components/rh-exemplo/tiposAusencias";
import { entradaMesReal, type AssiduidadeDoMes } from "./fonteMes";
import { montarMes, type DiaCalendario } from "./montarMes";
import { totaisDoMes, type TotaisMes } from "./totaisMes";

export interface MesDaPessoa {
  dias: DiaCalendario[];
  totais: TotaisMes;
  /** A regra do subsidio nao se leu: os totais usam o minimo por omissao e o ecra tem de o dizer. */
  erroRegraSubsidio: boolean;
  /** O horario planeado foi recusado a quem consulta: o previsto fica vazio e o ecra tem de o dizer. */
  planeadoRecusado: boolean;
}

export interface FonteRealDoMes {
  assiduidade: AssiduidadeDoMes;
  /** Para dizer que antes da admissao nao ha contrato. Sem ela nao se restringe nenhum dia. */
  dataAdmissao: string | null;
  tiposAusencia?: readonly Pick<AusenciaTipo, "id" | "nome">[];
  /** Os centros de trabalho, para marcar os dias com picagens fora do local. Sem eles nenhum dia se marca. */
  locais?: readonly LocalTrabalho[];
}

const SEM_TIPOS: readonly Pick<AusenciaTipo, "id" | "nome">[] = [];
const SEM_LOCAIS: readonly LocalTrabalho[] = [];

export function useMesDaPessoa(pessoaId: string, ano: number, mes: number, fonte: FonteRealDoMes): MesDaPessoa {
  const { regra, error: erroRegra } = useRegrasSubsidioAlimentacao();
  const minimo = regra.minutosMinimosDia;
  const horasExtra = useFluxosC((e) => e.horasExtra);
  const banco = useFluxosC((e) => e.banco);
  const podeHE = useFluxosC((e) => e.podeHE);
  const { assiduidade, dataAdmissao, tiposAusencia = SEM_TIPOS, locais = SEM_LOCAIS } = fonte;
  const planeado = assiduidade.planeado;
  const horario = useMemo(() => horarioPessoaDeLinhas(planeado), [planeado]);

  return useMemo(() => {
    const dias = montarMes(
      entradaMesReal({
        ano,
        mes,
        hoje: hojeIso(),
        contrato: dataAdmissao ? { desde: dataAdmissao, ate: null } : null,
        assiduidade,
        tiposAusencia,
        locais,
        horario,
        horasExtra: horasExtra.filter((h) => h.pessoaId === pessoaId),
        banco: banco.filter((m) => m.pessoaId === pessoaId),
        podeHE: podeHE[pessoaId] === true,
      }),
    );
    const totais = totaisDoMes(dias, {
      minimoSubsidioMin: minimo,
      bancoSaldoMin: saldoDoBanco(banco, pessoaId),
    });
    return { dias, totais, erroRegraSubsidio: Boolean(erroRegra), planeadoRecusado: Boolean(assiduidade.planeadoRecusado) };
  }, [ano, mes, dataAdmissao, assiduidade, tiposAusencia, locais, horario, horasExtra, banco, podeHE, minimo, erroRegra, pessoaId]);
}
