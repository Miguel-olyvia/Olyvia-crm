/**
 * O mes de uma pessoa, dia a dia. Picagens, horas realizadas, faltas e ausencias vem da assiduidade REAL da pessoa
 * (o hook que a aba Assiduidade ja carregou para esta janela, entregue por quem chama para nao ir duas vezes a base),
 * tal como o horario planeado (`pessoas_horario_planeado`, que vem na mesma leitura). O minimo de minutos do subsidio
 * e o limite da regra salarial em vigor (`subsidio_limite_min`); sem regra em vigor nao ha contagem de dias. Continuam a vir dos stores de exemplo, por ainda
 * nao ter tabela, so o banco de horas. As horas extra vem da base (`rpc_hr_horas_extra_listar`, so as do mes desta pessoa).
 */
import { useMemo } from "react";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { useRegrasSalariais } from "@/components/rh-exemplo/hooks/useRegrasSalariais";
import { horarioPessoaDeLinhas } from "@/components/rh-exemplo/lib/horarioReal";
import { saldoDoBanco } from "@/components/rh-exemplo/fluxosC/bancoHorasRegras";
import { useFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { limitesDoMes, useHorasExtraAutorizacoes, useHorasExtraListar } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { usePermissoesAssiduidade } from "@/components/rh-exemplo/hooks/usePermissoesAssiduidade";
import type { LocalTrabalho } from "@/components/rh-exemplo/tipos";
import type { AusenciaTipo } from "@/components/rh-exemplo/tiposAusencias";
import { entradaMesReal, type AssiduidadeDoMes } from "./fonteMes";
import { montarMes, type DiaCalendario } from "./montarMes";
import { totaisDoMes, type TotaisMes } from "./totaisMes";

export interface MesDaPessoa {
  dias: DiaCalendario[];
  totais: TotaisMes;
  /** A regra salarial nao se leu: os dias com direito a subsidio nao se mostram e o ecra tem de o dizer. */
  erroRegraSubsidio: boolean;
  /** O horario planeado foi recusado a quem consulta: o previsto fica vazio e o ecra tem de o dizer. */
  planeadoRecusado: boolean;
  /** As horas extra do mes nao se leram (texto traduzido): o calendario nao as mostra e tem de o dizer. `null` se correu bem. */
  erroHorasExtra: string | null;
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
  // O limite do subsidio e o da REGRA SALARIAL em vigor (`subsidio_limite_min`); sem regra em vigor (ou ainda por ler) nao ha numero.
  const { emVigor, estado: estadoRegras } = useRegrasSalariais();
  const minimo: number | null = emVigor ? emVigor.subsidio_limite_min : null;
  const erroRegra = estadoRegras === "erro";
  const banco = useFluxosC((e) => e.banco);
  const { permissoes } = usePermissoesAssiduidade();
  const periodo = useMemo(() => limitesDoMes(ano, mes), [ano, mes]);
  // Sem permissao de ver (ou se a leitura falha) o mes fica sem horas extra, em vez de acusar a pessoa.
  const { horas: horasExtra, erro: erroHorasExtra } = useHorasExtraListar({ pessoaId, de: periodo.de, ate: periodo.ate, enabled: permissoes.view || permissoes.viewOwn });
  // «Pode fazer horas extra» so se le com `hr.assiduidade.view`; sem ela nao se afirma que falta a marca.
  const autorizacoes = useHorasExtraAutorizacoes(permissoes.view);
  const podeHE = permissoes.view && !autorizacoes.aCarregar && !autorizacoes.erro ? autorizacoes.pode(pessoaId) : true;
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
        horasExtra,
        banco: banco.filter((m) => m.pessoaId === pessoaId),
        podeHE,
      }),
    );
    const totais = totaisDoMes(dias, {
      minimoSubsidioMin: minimo,
      bancoSaldoMin: saldoDoBanco(banco, pessoaId),
    });
    return { dias, totais, erroRegraSubsidio: Boolean(erroRegra), planeadoRecusado: Boolean(assiduidade.planeadoRecusado), erroHorasExtra };
  }, [ano, mes, dataAdmissao, assiduidade, tiposAusencia, locais, horario, horasExtra, banco, podeHE, minimo, erroRegra, erroHorasExtra, pessoaId]);
}
